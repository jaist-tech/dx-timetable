#!/usr/bin/env python3
"""能美市コミュニティバス(のみバス) 時刻表クローラ

サイト負荷を避けるため「1回だけ」全ページをローカルにキャッシュする。
- 既にキャッシュ済みのファイルは再取得しない（再実行で差分のみ取得）
- 各リクエスト間に SLEEP 秒待つ
- robots.txt 確認済み: /docs/ は許可

段階:
  Stage A: 一覧(1242) → バス停ページ群を取得 → そこから時刻表ページIDを収集
  Stage B: 時刻表ページ(重複排除済み) を取得

使い方:
    python3 1_crawl.py
キャッシュは cache/<id>.html に保存。何度実行しても未取得分のみ取りに行く。
"""
import os
import re
import sys
import time
import html
import json
import urllib.error
import urllib.request
import urllib.robotparser

BASE = "https://www.city.nomi.ishikawa.jp/docs/{}.html"
INDEX_ID = "1242"  # バス停一覧
UA = "Mozilla/5.0 (compatible; nomibus-timetable-import/1.0; personal timetable app, contact via github)"
SLEEP = 3.0  # 秒。サイトに優しく
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
# True のとき，キャッシュ済みのページも ETag / Last-Modified の条件付き GET で確かめる（未更新なら 304 で本体は転送されない）
REFRESH = False
_robots = []

# 索引(1242)に出てくるが時刻表とは無関係な定型リンク(フッタ等)。バス停ページ収集から除外。
NON_STOP_IDS = {
    "3246",  # Multilingual
    "1214", "1215", "1216", "1217", "1218",  # 個人情報/免責/著作権/プライバシー/アクセシビリティ
    "1242",  # 自分自身
}

clean = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def cache_path(doc_id):
    return os.path.join(CACHE_DIR, f"{doc_id}.html")


def meta_path(doc_id):
    return os.path.join(CACHE_DIR, f"{doc_id}.meta.json")


def robots_allowed(url):
    """robots.txt で取得が許可されているか（取得できなければ許可扱い）"""
    if not _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request("https://www.city.nomi.ishikawa.jp/robots.txt", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode("utf-8", "replace")
            rp.parse(text.splitlines() if "<html" not in text.lower() else [])
        except Exception:  # noqa: BLE001
            rp.parse([])
        _robots.append(rp)
        time.sleep(SLEEP)
    return _robots[0].can_fetch(UA, url)


def fetch(doc_id):
    """1ページ取得してキャッシュに保存。既にあればスキップして読み込むだけ。
    REFRESH のときは条件付き GET で更新を確かめる（304 ならキャッシュを使う）。
    戻り値: (html_text, was_fetched)"""
    path = cache_path(doc_id)
    cached = os.path.exists(path) and os.path.getsize(path) > 0
    prev = {}
    if cached:
        if not REFRESH:
            with open(path, encoding="utf-8", errors="replace") as f:
                return f.read(), False
        if os.path.exists(meta_path(doc_id)):
            with open(meta_path(doc_id), encoding="utf-8") as f:
                prev = json.load(f)
    url = BASE.format(doc_id)
    if not robots_allowed(url):
        raise PermissionError("robots.txt で禁止")
    headers = {"User-Agent": UA, "Accept-Encoding": "gzip, deflate"}
    if prev.get("etag"):
        headers["If-None-Match"] = prev["etag"]
    if prev.get("last_modified"):
        headers["If-Modified-Since"] = prev["last_modified"]
    req = urllib.request.Request(url, headers=headers)
    print(f"  GET {url}", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            enc = resp.headers.get("Content-Encoding", "")
            if enc == "gzip":
                import gzip
                raw = gzip.decompress(raw)
            elif enc == "deflate":
                import zlib
                raw = zlib.decompress(raw)
            text = raw.decode("utf-8", errors="replace")
            meta = {"etag": resp.headers.get("ETag"), "last_modified": resp.headers.get("Last-Modified")}
    except urllib.error.HTTPError as e:
        time.sleep(SLEEP)
        if e.code == 304 and cached:
            with open(path, encoding="utf-8", errors="replace") as f:
                return f.read(), False
        raise
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    with open(meta_path(doc_id), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    time.sleep(SLEEP)
    return text, True


def docs_links(text):
    """ページ内の /docs/<id>.html リンクを (id, anchor_text) で返す"""
    pairs = re.findall(r'<a[^>]*href="[^"]*?/docs/(\d+)\.html"[^>]*>(.*?)</a>', text, re.S)
    return [(num, clean(t)) for num, t in pairs]


def is_timetable_link(anchor_text):
    """アンカーテキストが時刻表ページかどうか（「時刻表」を含む）"""
    return "時刻表" in anchor_text


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)

    # --- Stage A: 索引 → バス停ページ ---
    print("=== Stage A: 索引(1242) を取得 ===")
    index_html, _ = fetch(INDEX_ID)
    stop_links = []
    for num, txt in docs_links(index_html):
        if num in NON_STOP_IDS or not txt:
            continue
        stop_links.append((num, txt))
    # 重複排除（同一バス停が複数回出る場合に備え）
    seen = set()
    stop_links = [(n, t) for n, t in stop_links if not (n in seen or seen.add(n))]
    print(f"バス停ページ候補: {len(stop_links)} 件")

    print("\n=== Stage A: 各バス停ページを取得し時刻表ページIDを収集 ===")
    timetable_ids = {}  # id -> anchor_text(初出)
    fetched_a = 0
    failed_b = []
    for i, (num, name) in enumerate(stop_links, 1):
        try:
            text, was = fetch(num)
        except Exception as e:  # 取得失敗は握りつぶさず，呼び出し側が中断できるよう記録する
            print(f"  NG {num} ({name}): {e}")
            failed_b.append((num, name))
            continue
        if was:
            fetched_a += 1
        for tid, tt in docs_links(text):
            if is_timetable_link(tt) and tid not in timetable_ids:
                timetable_ids[tid] = tt
        if i % 25 == 0:
            print(f"  ...{i}/{len(stop_links)} 処理 (今回新規DL {fetched_a}件, 時刻表ID累計 {len(timetable_ids)})")
    print(f"バス停ページ取得完了 (今回新規DL {fetched_a}件)")
    print(f"発見した時刻表ページ(uniq): {len(timetable_ids)} 件")

    # --- Stage B: 時刻表ページ取得 ---
    print("\n=== Stage B: 時刻表ページを取得 ===")
    fetched_b = 0
    for i, (tid, tt) in enumerate(sorted(timetable_ids.items()), 1):
        try:
            _, was = fetch(tid)
            if was:
                fetched_b += 1
        except Exception as e:
            print(f"  SKIP {tid} ({tt}): {e}")
            failed_b.append((tid, tt))
    print(f"時刻表ページ取得完了 (今回新規DL {fetched_b}件, スキップ {len(failed_b)}件)")
    if failed_b:
        for tid, tt in failed_b:
            print(f"  NG: {tid}  {tt}")

    # --- 収集した時刻表IDの一覧を記録 ---
    manifest_path = os.path.join(os.path.dirname(__file__), "timetable_ids.tsv")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write("id\tanchor_text\n")
        for tid, tt in sorted(timetable_ids.items()):
            f.write(f"{tid}\t{tt}\n")
    print(f"\n時刻表ID一覧を {manifest_path} に書き出し")
    print("完了。cache/ にHTMLをキャッシュ済み。再実行しても未取得分のみ取得します。")
    return failed_b


if __name__ == "__main__":
    main()
