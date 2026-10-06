#!/usr/bin/env python3
"""読み取った時刻表 JSON の検査（取得→読み取り→JSON の各段で正常に動いているかの確認）

使い方:
    python3 tools/watch/validate.py            # public/data の全ファイルと manifest を検査
    python3 tools/watch/validate.py --changed  # git で変更・追加された public/data のファイルだけ検査

検査の内容（落ちたものは commit せず「要手動」にする）:
  形式      路線・停留所・便の構造，時刻の書式，便ごとの時刻数＝停留所数（アプリが読める形）
  内容      便内の時刻が単調増加，有効期間の日付，各曜日の便が 0 件でない
  前回比    同じ区間の直前のバージョンと，路線の組・停留所の並び・便数（0.5〜2 倍）を比べる
  manifest  ファイルの実在，同じ区間の期間の重なり，期間の切れ目（警告）
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(REPO, "public", "data")
TIME_RE = re.compile(r"^(\d{1,2}):([0-5]\d)$")
RATIO = (0.5, 2.0)
# 公式の資料そのものに誤りがあり，読み取りは正しいと確認済みの異常（ファイル名 → 路線 id）．増やすときは理由を書く
KNOWN_SOURCE_ANOMALY = {
    # 能美市の時刻表で「松が岡2丁目」が 7:50（前後は 6:49・6:52）．公式側の誤記の可能性が高い（2026-10-07 に確認）
    "nomi_renkei_minamimawari_2026-03-14_null.json": {"nomi_minamimawari_from_jaist"},
}


def _minutes(t):
    m = TIME_RE.match(t)
    return int(m.group(1)) * 60 + int(m.group(2))


def check_doc(doc, prev=None):
    """1 ファイル分（{meta, routes}）の検査．エラーの文のリストを返す．prev は直前のバージョンの doc"""
    errs = []
    meta, routes = doc.get("meta") or {}, doc.get("routes")
    vf, vu = meta.get("valid_from"), meta.get("valid_until")
    for k, v in (("valid_from", vf), ("valid_until", vu)):
        if v is not None:
            try:
                date.fromisoformat(v)
            except (TypeError, ValueError):
                errs.append(f"{k} が日付でない: {v!r}")
    if vf is None and doc.get("meta", {}).get("apply_periods") is None:
        errs.append("valid_from が無い")
    if vf and vu and not errs and vu < vf:
        errs.append(f"有効期間が逆転: {vf}〜{vu}")
    if not routes or not isinstance(routes, list):
        return errs + ["routes が空"]
    for r in routes:
        rid = r.get("id", "?")
        stops, sch = r.get("stops"), r.get("schedules")
        if not stops or not all(isinstance(s, str) and s for s in stops):
            errs.append(f"{rid}: stops が不正")
            continue
        if not isinstance(sch, dict) or not sch:
            errs.append(f"{rid}: schedules が不正")
            continue
        for day, trips in sch.items():
            if not isinstance(trips, list):
                errs.append(f"{rid}/{day}: 便の一覧が配列でない")
                continue
            for i, trip in enumerate(trips):
                if len(trip) != len(stops):
                    errs.append(f"{rid}/{day} 便{i}: 時刻の数 {len(trip)} ≠ 停留所の数 {len(stops)}")
                    break
                times = [t for t in trip if t]
                bad = [t for t in times if not (isinstance(t, str) and TIME_RE.match(t))]
                if bad:
                    errs.append(f"{rid}/{day} 便{i}: 時刻の書式が不正 {bad[:2]}")
                    break
                if len(times) < 1:
                    errs.append(f"{rid}/{day} 便{i}: 時刻が 1 つも無い")
                    break
                mins = [_minutes(t) for t in times]
                # 日またぎ（23:59 → 0:02）は 12 時間以上戻ったときだけ許す
                if any(0 < a - b < 720 for a, b in zip(mins, mins[1:])):
                    errs.append(f"{rid}/{day} 便{i}: 時刻が単調増加でない {times[:6]}")
                    break
        if not any(sch.get(d) for d in sch):
            errs.append(f"{rid}: すべての曜日で便が 0 件")
    if prev:
        pr = {r["id"]: r for r in prev.get("routes", [])}
        nr = {r["id"]: r for r in routes}
        if set(pr) != set(nr):
            errs.append(f"前回と路線の組が違う: 消えた {sorted(set(pr) - set(nr))} 増えた {sorted(set(nr) - set(pr))}")
        for rid in set(pr) & set(nr):
            if pr[rid]["stops"] != nr[rid]["stops"]:
                errs.append(f"{rid}: 停留所の並びが前回と違う")
            for day, old in pr[rid]["schedules"].items():
                new = nr[rid]["schedules"].get(day, [])
                if old and not (RATIO[0] <= len(new) / len(old) <= RATIO[1]):
                    errs.append(f"{rid}/{day}: 便数が前回 {len(old)} → {len(new)} と極端に変わった")
    return errs


def check_manifest(manifest, data_dir=DATA):
    """manifest の検査．(errors, warnings)"""
    errs, warns = [], []
    for kind in ("regular",):
        for seg, entries in (manifest.get(kind) or {}).items():
            for e in entries:
                if not os.path.exists(os.path.join(data_dir, kind, e["file"])):
                    errs.append(f"{seg}: {e['file']} が存在しない")
            es = sorted(entries, key=lambda e: e["valid_from"])
            for a, b in zip(es, es[1:]):
                au = a.get("valid_until")
                if au is None:  # 開いたままの旧エントリ（既存データにある．アプリは新しい方を選ぶ）
                    warns.append(f"{seg}: {a['file']} の valid_until が空のまま次の {b['file']} がある")
                elif au >= b["valid_from"]:
                    errs.append(f"{seg}: 期間が重なる {a['file']} と {b['file']}")
                elif date.fromisoformat(au) + timedelta(days=1) < date.fromisoformat(b["valid_from"]):
                    warns.append(f"{seg}: {au} から {b['valid_from']} の間に切れ目")
    return errs, warns


def previous_doc(manifest, seg, entry_file, data_dir=DATA, kind="regular"):
    """同じ区間で entry_file の 1 つ前のバージョンの doc（無ければ None）"""
    es = sorted((manifest.get(kind) or {}).get(seg, []), key=lambda e: e["valid_from"])
    names = [e["file"] for e in es]
    if entry_file in names:
        names = names[:names.index(entry_file)]
    if not names:
        return None
    with open(os.path.join(data_dir, kind, names[-1]), encoding="utf-8") as f:
        return json.load(f)


def seg_of(fname):
    return re.sub(r"_\d{4}-\d{2}-\d{2}_(\d{4}-\d{2}-\d{2}|null)\.json$", "", fname)


def check_file(path, manifest, data_dir=DATA):
    fname = os.path.basename(path)
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    errs = check_doc(doc, previous_doc(manifest, seg_of(fname), fname, data_dir))
    known = KNOWN_SOURCE_ANOMALY.get(fname, set())
    return [e for e in errs if not any(e.startswith(r + "/") for r in known)]


def changed_files():
    out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "public/data/regular"],
                         cwd=REPO, text=True, capture_output=True).stdout
    return [os.path.join(REPO, l[3:].strip()) for l in out.splitlines() if l[3:].strip().endswith(".json")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--changed", action="store_true")
    args = ap.parse_args()
    with open(os.path.join(DATA, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    files = changed_files() if args.changed else [
        os.path.join(DATA, "regular", n) for n in sorted(os.listdir(os.path.join(DATA, "regular"))) if n.endswith(".json")]
    bad = 0
    for p in files:
        if not os.path.exists(p):
            continue
        for e in check_file(p, manifest):
            print(f"✖ {os.path.basename(p)}: {e}")
            bad += 1
    me, mw = check_manifest(manifest)
    for e in me:
        print(f"✖ manifest {e}")
        bad += 1
    for w in mw:
        print(f"⚠ manifest {w}")
    print(f"検査 {len(files)} ファイル: エラー {bad} 件")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
