#!/usr/bin/env python3
"""watch.py が検知した新規・更新PDFを解析し，public/data/ に反映する（push はしない）

流れ: events.json → PDF をダウンロード（間隔を空ける）→ tools/admin/parser_adapter でパース
      → check_commit.check_payload で整合性チェック → エラーなしのものだけ commit_payload で書き込み

使い方（要 pdfplumber・pandas．uv run --with pdfplumber --with pandas python tools/watch/apply.py）:
    python3 tools/watch/watch.py --update-state   # 先に検知（events.json を作る）
    python3 tools/watch/apply.py                  # 反映．結果は Markdown で標準出力
    python3 tools/watch/apply.py --dry-run        # チェックのみで書き込まない
    git diff --stat public/data                   # 差分を確認してから commit / push

自動反映しない（人が確認する）もの: 特別ダイヤ，石川線（平日・休日の 2 PDF が必要），整合性エラーのあるもの
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
            print(f"| {name} | {seg} | 要手動: 平日・休日の 2 PDF が必要（tools/run_all.py） |")
            manual += 1
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
            n = [len(r["schedules"]["weekday"]) for r in pl["routes"]]
            if args.dry_run:
                print(f"| {name} | {seg} {period} | OK（dry-run，便数 {n}） |")
                continue
            w = check_commit.commit_payload(pl, manifest)
            print(f"| {name} | {seg} {period} | 反映 {w['data_file']}（便数 {n}） |")
    return 10 if manual else 0


if __name__ == "__main__":
    sys.exit(main())
