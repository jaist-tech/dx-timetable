#!/usr/bin/env python3
"""watch.py が検知した新規・更新PDFを解析し，public/data/ に反映する（push はしない）

流れ: events.json → PDF をダウンロード（間隔を空ける）→ tools/admin/parser_adapter でパース
      → check_commit.check_payload で整合性チェック → エラーなしのものだけ commit_payload で書き込み

使い方（要 pdfplumber・pandas．uv run --with pdfplumber --with pandas python tools/watch/apply.py）:
    python3 tools/watch/watch.py --update-state   # 先に検知（events.json を作る）
    python3 tools/watch/apply.py                  # 反映．結果は Markdown で標準出力
    python3 tools/watch/apply.py --dry-run        # チェックのみで書き込まない
    git diff --stat public/data                   # 差分を確認してから commit / push

石川線は平日・休日の 2 PDF を組にして読む（片方だけ更新されたときも state.json の相方を使う）．
自動反映しない（人が確認する）もの: 特別ダイヤ，整合性エラーのあるもの，石川線の既存期間の内容変更
"""
import argparse
import json
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, "tools", "admin"))
sys.path.insert(0, os.path.join(REPO, "tools", "parsers"))

import watch  # noqa: E402  fetch() の間隔・robots.txt 制御を共用する
import parser_adapter  # noqa: E402
import check_commit  # noqa: E402
import validate  # noqa: E402  形式・内容・前回比の検査

MANUAL = re.compile(r"特別|臨時|GW|お盆|年末年始|夏|冬|special|holiday|summer|winter", re.I)


def load_manifest():
    with open(check_commit.PUBLIC_DATA + "/manifest.json", encoding="utf-8") as f:
        return json.load(f)


def payloads_for(path, segment):
    """PDF から commit 可能な payload のリストを作る（小松線は複数期間）"""
    if segment == "shuttle_komatsu":
        import shuttle_komatsu
        out = []
        for vf, vu, routes in shuttle_komatsu.extract_komatsu_periods(path):
            r = parser_adapter._build_result(
                segment=segment, kind="regular",
                valid_from=vf.isoformat() if vf else None,
                valid_until=vu.isoformat() if vu else None, routes=routes,
                operator="JAISTシャトルバス", note="時刻が空欄の箇所は、通過または停車設定なしです。")
            out.append(r)
        return out
    return [parser_adapter.parse_pdf(path, segment, "regular")]


def validate_errors(pl, manifest):
    """payload を validate.check_doc にかける（直前のバージョンと比べる）．エラー文の一覧"""
    meta = pl["meta"]
    fname = f"{pl['segment']}_{meta.get('valid_from')}_{meta.get('valid_until') or 'null'}.json"
    prev = validate.previous_doc(manifest, pl["segment"], fname)
    return validate.check_doc({"meta": meta, "routes": pl["routes"]}, prev)


def ishikawa_pair(events):
    """石川線の (平日 URL, 休日 URL) を返す．events の URL と state.json の掲載中 PDF から，種別ごとに最新のものを選ぶ"""
    urls = {ev["url"] for ev in events if "ishikawa_line" in (ev.get("segments") or [])}
    try:
        with open(watch.STATE_PATH, encoding="utf-8") as f:
            for u, r in json.load(f).get("pdfs", {}).items():
                if "ishikawa_line" in (r.get("segments") or []) and r.get("is_pdf"):
                    urls.add(u)
    except OSError:
        pass
    pick = {}
    for u in sorted(urls, key=os.path.basename):
        n = os.path.basename(u).lower()
        kind = "weekday" if "weekday" in n else "weekend" if ("weekend" in n or "holiday" in n) else None
        if kind:
            pick[kind] = u
    return pick.get("weekday"), pick.get("weekend")


def apply_ishikawa(events, dry_run):
    """石川線: 平日・休日の PDF を組にして読み取り，検査を通れば書き込む．戻り値は要手動の件数"""
    import ishikawa_line
    wd, we = ishikawa_pair(events)
    label = "石川線（平日・休日）"
    if not (wd and we):
        print(f"| {label} | ishikawa_line | 要手動: 平日・休日の PDF の組が揃わない |")
        return 1
    try:
        with tempfile.TemporaryDirectory() as td:
            paths = []
            for u in (wd, we):
                _, _, body = watch.fetch(u)
                p = os.path.join(td, os.path.basename(u))
                with open(p, "wb") as f:
                    f.write(body)
                paths.append(p)
            valid_from, routes = ishikawa_line.extract_ishikawa_line(*paths)
    except Exception as e:  # noqa: BLE001
        print(f"| {label} | ishikawa_line | 失敗: 解析できない（{type(e).__name__}: {e}） |")
        return 1
    pl = parser_adapter._build_result(
        segment="ishikawa_line", kind="regular", valid_from=valid_from, valid_until=None, routes=routes,
        operator="北陸鉄道 石川線", note="時刻が空欄の箇所は、通過または停車設定なしです。")
    meta = pl["meta"]
    names = f"{os.path.basename(wd)} + {os.path.basename(we)}"
    fname = f"ishikawa_line_{meta.get('valid_from')}_null.json"
    existing = os.path.join(check_commit.PUBLIC_DATA, "regular", fname)
    if os.path.exists(existing):
        with open(existing, encoding="utf-8") as f:
            same = json.load(f).get("routes") == pl["routes"]
        if same:
            print(f"| {names} | ishikawa_line | 反映済み（{fname}） |")
            return 0
        print(f"| {names} | ishikawa_line | 要手動: 既存期間の内容が変わった（{fname}） |")
        return 1
    if any(not r["schedules"].get(d) for r in pl["routes"] for d in ("weekday", "weekend")):
        print(f"| {names} | ishikawa_line | 要手動: 便数 0 の路線・曜日がある（PDF の様式変更の可能性） |")
        return 1
    res = check_commit.check_payload(pl, load_manifest())
    if res["errors"] or res.get("overlaps"):
        msgs = "; ".join([e["msg"] for e in res["errors"]] + [f"重複 {o}" for o in res.get("overlaps", [])])[:200]
        print(f"| {names} | ishikawa_line | 要手動: チェックエラー {msgs} |")
        return 1
    verr = validate_errors(pl, load_manifest())
    if verr:
        print(f"| {names} | ishikawa_line | 要手動: 検査に落ちた {'; '.join(verr)[:300]} |")
        return 1
    n = {d: [len(r["schedules"][d]) for r in pl["routes"]] for d in ("weekday", "weekend")}
    if dry_run:
        print(f"| {names} | ishikawa_line | OK（dry-run，便数 {n}） |")
        return 0
    w = check_commit.commit_payload(pl, load_manifest())
    print(f"| {names} | ishikawa_line | 反映 {w['data_file']}（便数 {n}） |")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    with open(watch.EVENTS_PATH, encoding="utf-8") as f:
        events = json.load(f)
    print("# 時刻表の反映レポート\n")
    if not events:
        print("新規・更新のPDFはありません．")
        return 0
    print("| PDF | 区間 | 結果 |\n|---|---|---|")
    manual = 0
    ishikawa_done = False
    for ev in events:
        url = ev["url"]
        name = os.path.basename(url)
        seg = parser_adapter.guess_segment_from_filename(name)
        if seg is None or seg not in (ev.get("segments") or [seg]):
            print(f"| {name} | ? | 要手動: 区間を判別できない |")
            manual += 1
            continue
        if ev.get("kind") == "backlog" and seg not in ev.get("expired", [seg]):
            continue
        if seg == "ishikawa_line":
            if not ishikawa_done:  # 平日・休日の 2 PDF を組にして 1 回だけ処理する
                ishikawa_done = True
                manual += apply_ishikawa(events, args.dry_run)
            continue
        if MANUAL.search(name) or MANUAL.search(ev.get("label") or ""):
            print(f"| {name} | {seg} | 要手動: 特別ダイヤの可能性（tools/admin で種別を確認） |")
            manual += 1
            continue
        try:
            _, _, body = watch.fetch(url)
            with tempfile.TemporaryDirectory() as td:
                path = os.path.join(td, name)
                with open(path, "wb") as f:
                    f.write(body)
                payloads = payloads_for(path, seg)
        except Exception as e:  # noqa: BLE001
            print(f"| {name} | {seg} | 失敗: 解析できない（{type(e).__name__}: {e}） |")
            manual += 1
            continue
        for pl in payloads:
            meta = pl["meta"]
            period = f"{meta.get('valid_from')}〜{meta.get('valid_until')}"
            manifest = load_manifest()
            fname = f"{seg}_{meta.get('valid_from')}_{meta.get('valid_until') or 'null'}.json"
            existing = os.path.join(check_commit.PUBLIC_DATA, "regular", fname)
            if os.path.exists(existing):
                with open(existing, encoding="utf-8") as f:
                    old_routes = json.load(f).get("routes")
                if old_routes == pl["routes"]:
                    print(f"| {name} | {seg} {period} | 反映済み（{fname}） |")
                else:
                    print(f"| {name} | {seg} {period} | 要手動: 既存期間の内容が変わった（{fname}） |")
                    manual += 1
                continue
            if any(not r["schedules"]["weekday"] for r in pl["routes"]):
                print(f"| {name} | {seg} {period} | 要手動: 便数 0 の路線がある（PDF の様式変更の可能性） |")
                manual += 1
                continue
            res = check_commit.check_payload(pl, manifest)
            if res["errors"] or res.get("overlaps"):
                msgs = "; ".join([e["msg"] for e in res["errors"]] + [f"重複 {o}" for o in res.get("overlaps", [])])[:200]
                print(f"| {name} | {seg} {period} | 要手動: チェックエラー {msgs} |")
                manual += 1
                continue
            verr = validate_errors(pl, manifest)
            if verr:
                print(f"| {name} | {seg} {period} | 要手動: 検査に落ちた {'; '.join(verr)[:300]} |")
                manual += 1
                continue
            n = [len(r["schedules"]["weekday"]) for r in pl["routes"]]
            if args.dry_run:
                print(f"| {name} | {seg} {period} | OK（dry-run，便数 {n}） |")
                continue
            w = check_commit.commit_payload(pl, manifest)
            print(f"| {name} | {seg} {period} | 反映 {w['data_file']}（便数 {n}） |")
    return 10 if manual else 0


if __name__ == "__main__":
    sys.exit(main())
