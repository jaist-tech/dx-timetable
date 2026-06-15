#!/usr/bin/env python3
"""のみバス時刻表 更新ツール

能美市公式サイトから時刻表HTMLを取得・パースし、
public/data/regular/nomi_*.json および manifest.json を更新する。

使い方:
    cd tools/nomibus
    python3 run.py              # キャッシュ再利用 + 差分のみ更新
    python3 run.py --fetch      # キャッシュを破棄して全ページを再取得
    python3 run.py --dry-run    # public/ を書き換えずに変更内容だけ表示

通常の更新フロー:
    1. python3 run.py          # 実行
    2. 出力の "変更あり" / "変更なし" を確認
    3. git diff public/data/   # 差分確認
    4. git add / commit / push

注意:
    --fetch を付けると能美市サーバへHTTPリクエストが発生する。
    ダイヤ改正後など本当に最新データが必要なときだけ使うこと。
    通常は --fetch なし(キャッシュ利用)で十分。
"""
import argparse
import glob
import json
import os
import shutil
import sys
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DATA = os.path.join(HERE, "..", "..", "public", "data")
REGULAR_DIR = os.path.join(PUBLIC_DATA, "regular")
MANIFEST_PATH = os.path.join(PUBLIC_DATA, "manifest.json")
CACHE_DIR = os.path.join(HERE, "cache")
INTERMEDIATE_DIR = os.path.join(HERE, "intermediate")

JST = timezone(timedelta(hours=9))


def step_fetch(force: bool):
    """Step 1: HTML キャッシュ取得"""
    print("=== Step 1: クロール ===")
    if force:
        print("  --fetch: cache/ を削除して全ページ再取得します")
        if os.path.isdir(CACHE_DIR):
            shutil.rmtree(CACHE_DIR)
    import crawl
    crawl.main()


def step_parse():
    """Step 2: HTML → 中間JSON"""
    print("\n=== Step 2: パース ===")
    # intermediate/ をクリアして再生成（前回の残骸を防ぐ）
    if os.path.isdir(INTERMEDIATE_DIR):
        for f in glob.glob(os.path.join(INTERMEDIATE_DIR, "*.json")):
            os.remove(f)
    import parse
    parse.main()


def step_convert(added_at: str, fallback_valid_from: str):
    """Step 3: 中間JSON → nomi_*.json"""
    print("\n=== Step 3: 変換 ===")
    import convert
    convert.ADDED_AT = added_at
    convert.FALLBACK_VALID_FROM = fallback_valid_from
    return convert.convert()  # [(fname, n_routes, status, segment), ...]


def _parse_fname(fname):
    """ファイル名から (segment, valid_from, valid_until) を取得する。
    fname: "nomi_renkei_kitamawari_2026-03-14_null.json"
    """
    parts = fname.replace(".json", "").split("_")
    valid_until_str = parts[-1]   # "null" or "2026-12-31"
    valid_from_str  = parts[-2]   # "2026-03-14"
    segment = "_".join(parts[:-2])
    valid_until = None if valid_until_str == "null" else valid_until_str
    return segment, valid_from_str, valid_until


def update_manifest(convert_results, today_str: str, dry_run: bool):
    """convert() の結果を manifest.json に反映する。

    - 新規ファイル (written): エントリを追加
    - 新バージョン (new_version): 古いエントリの valid_until を前日に設定し、新エントリを追加
    - 変更なし (unchanged): manifest は触らない
    - スキップ (skipped): 路線廃止の可能性。manifest の既存エントリの valid_until を前日に設定する
    """
    print("\n=== Step 4: manifest.json 更新 ===")
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = json.load(f)
    regular = manifest.setdefault("regular", {})
    changed = False

    from datetime import date, timedelta
    yesterday = (date.fromisoformat(today_str) - timedelta(days=1)).isoformat()

    for rec in convert_results:
        fname, n_routes, status, segment = rec

        if status == "unchanged":
            continue  # manifest は触らない

        if status == "skipped":
            # データなし = 廃止路線の可能性。既存の open-ended エントリを閉じる。
            existing = regular.get(segment, [])
            closed = False
            for e in existing:
                if e.get("valid_until") is None and e.get("valid_from", "") <= today_str:
                    e["valid_until"] = yesterday
                    print(f"  廃止 {segment}: valid_until={yesterday} に設定")
                    closed = True
                    changed = True
            if not closed:
                print(f"  スキップ (データなし): {segment} (manifest 変更なし)")
            regular[segment] = existing
            continue

        # written / new_version
        seg2, valid_from, valid_until = _parse_fname(fname)
        new_entry = {"file": fname, "valid_from": valid_from, "valid_until": valid_until}
        existing = regular.get(segment, [])

        if status == "new_version":
            # 旧エントリのうち valid_until が None のものを閉じる
            for e in existing:
                if e.get("valid_until") is None and e.get("file") != fname:
                    e["valid_until"] = yesterday
                    print(f"  旧バージョン終了: {e['file']} → valid_until={yesterday}")
            # 同一ファイル名が既にあれば上書き、なければ追加
            idx = next((i for i, e in enumerate(existing) if e.get("file") == fname), None)
            if idx is not None:
                existing[idx] = new_entry
            else:
                existing.append(new_entry)
            print(f"  新バージョン追加: {fname}")
        else:  # written (初回)
            idx = next((i for i, e in enumerate(existing) if e.get("file") == fname), None)
            if idx is not None:
                existing[idx] = new_entry
                print(f"  UPD {segment}: {fname}")
            else:
                existing.append(new_entry)
                print(f"  NEW {segment}: {fname}")

        regular[segment] = existing
        changed = True

    if not changed:
        print("  変更なし")

    if not dry_run and changed:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print("  manifest.json を更新しました")
    elif dry_run and changed:
        print("  [dry-run] manifest.json は更新しませんでした")


def print_summary(convert_results):
    """実行結果のサマリを表示する"""
    print("\n=== サマリ ===")
    for fname, n_routes, status, segment in convert_results:
        if status == "written":
            print(f"  書き出し:   {fname}  ({n_routes} routes)")
        elif status == "new_version":
            print(f"  新バージョン: {fname}  ({n_routes} routes)")
        elif status == "unchanged":
            print(f"  変更なし:   {fname}")
        elif status == "skipped":
            print(f"  スキップ:   {segment} (データなし)")
    print("\ngit diff public/data/ で変更内容を確認してください")


def main():
    parser = argparse.ArgumentParser(
        description="のみバス時刻表を能美市サイトから取得して public/data/ を更新する"
    )
    parser.add_argument(
        "--fetch", action="store_true",
        help="cache/ を削除して全ページを再取得する（ダイヤ改正後に使用）"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="manifest.json を書き換えずに変換結果だけ表示する"
    )
    args = parser.parse_args()

    # カレントディレクトリを tools/nomibus/ に変更（import が通るように）
    os.chdir(HERE)
    sys.path.insert(0, HERE)

    now = datetime.now(JST)
    added_at = now.strftime("%Y-%m-%dT%H:%M:%S+09:00")
    today_str = now.strftime("%Y-%m-%d")
    print(f"のみバス時刻表更新ツール  実行時刻: {added_at}")
    print(f"出力先: {os.path.relpath(REGULAR_DIR)}\n")

    step_fetch(args.fetch)
    step_parse()
    results = step_convert(added_at, today_str)
    update_manifest(results, today_str, args.dry_run)
    print_summary(results)


if __name__ == "__main__":
    main()
