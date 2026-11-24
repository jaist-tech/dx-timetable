#!/usr/bin/env python3
"""時刻表ソース監視ツール（標準ライブラリのみ）

1. 公式ページに掲載されている時刻表PDFのリンクを列挙し，Last-Modified / ETag / SHA-256 を
   前回状態 (state.json) と比較して「新規・更新・消失」を検知する
2. public/data/manifest.json の有効期間を調べ，期限切れ・期限間近の区間を警告する

使い方:
    python3 tools/watch/watch.py                 # 検査してMarkdownレポートを標準出力へ
    python3 tools/watch/watch.py --update-state  # state.json を今回の結果で更新する
    python3 tools/watch/watch.py --days 21       # 期限警告のしきい値（既定 21 日）

終了コード: 0 = 変化なし，10 = 変化あり／警告あり（GitHub Actions の分岐に使う）
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urljoin

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
STATE_PATH = os.path.join(HERE, "state.json")
EVENTS_PATH = os.path.join(HERE, "events.json")  # 実行ごとに上書き（commit しない）
MANIFEST_PATH = os.path.join(REPO, "public", "data", "manifest.json")
UA = "BusDX-watch/0.1 (+https://github.com/jaist-tech/dx-timetable)"
JST = timezone(timedelta(hours=9))

# 監視対象ページ: (id, URL, PDFリンクの正規表現, 対応する区間ID)
SOURCES = [
    ("jaist_access", "https://www.jaist.ac.jp/top/access/",
     r"/top/data/shuttle_[^\"'\s]+\.pdf", ["shuttle_komatsu", "shuttle_tsurugi"]),
    ("hokutetsu_ishikawa", "https://www.hokutetsu.co.jp/railway/ishikawasen/",
     r"[^\"'\s]*ishikawa-line_timetable_[^\"'\s]+\.pdf", ["ishikawa_line"]),
    ("ir_ishikawa", "https://www.ishikawa-railway.jp/timetable/",
     r"pdf/\d{8}\.pdf", ["ir_ishikawa"]),
    ("hokutetsu_airport", "https://www.hokutetsu.co.jp/airport-bus",
     r"[^\"'\s]*limo_komatsu-komatsu_[^\"'\s]+\.pdf", ["limo_komatsu"]),
]


DELAY = 3.0  # リクエスト間の待ち時間（秒）．アクセス過多を避ける
_robots = {}
_last_req = [0.0]


def allowed(url):
    """robots.txt で取得が許可されているか（取得できなければ許可扱い）"""
    from urllib.parse import urlsplit
    u = urlsplit(url)
    base = f"{u.scheme}://{u.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            wait = DELAY - (time.time() - _last_req[0])
            if wait > 0:
                time.sleep(wait)
            _last_req[0] = time.time()
            req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode("utf-8", "replace")
            # HTML（404 ページ等）が返る場合は robots.txt なしとみなす
            rp.parse(text.splitlines() if "<html" not in text.lower() else [])
        except Exception:  # noqa: BLE001
            rp.parse([])
        _robots[base] = rp
    return _robots[base].can_fetch(UA, url)


def fetch(url, method="GET", timeout=60, prev=None):
    """間隔を空けて取得する．prev（前回の記録）があれば条件付き GET にし，
    未更新なら (304, headers, None) を返す"""
    if not allowed(url):
        raise PermissionError("robots.txt で禁止")
    wait = DELAY - (time.time() - _last_req[0])
    if wait > 0:
        time.sleep(wait)
    headers = {"User-Agent": UA}
    if prev:
        if prev.get("etag"):
            headers["If-None-Match"] = prev["etag"]
        if prev.get("last_modified"):
            headers["If-Modified-Since"] = prev["last_modified"]
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read() if method == "GET" else b""
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return 304, dict(e.headers), None
        raise
    finally:
        _last_req[0] = time.time()


def strip_comments(s):
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)


def link_label(page, m):
    """リンク周辺のテキスト（期間表記の手がかり）を 120 文字程度で返す"""
    a = max(0, m.start() - 300)
    ctx = page[a:m.end() + 60]
    # 切り出し位置がタグの途中なら，その断片を捨てる
    lt, gt = ctx.find("<"), ctx.find(">")
    if gt != -1 and (lt == -1 or gt < lt):
        ctx = ctx[gt + 1:]
    if ctx.rfind("<") > ctx.rfind(">"):
        ctx = ctx[:ctx.rfind("<")]
    t = html.unescape(re.sub(r"<[^>]+>", " ", ctx))
    t = re.sub(r"\s+", " ", t).strip()
    # 「（2026年9月1日～10月31日）」のような期間表記があれば優先
    periods = re.findall(r"[（(]\s*20\d\d年[^）)]{0,40}[）)]", t)
    return (periods[-1] if periods else t[-120:])


def scan_sources(old):
    found = {}
    errors = []
    for sid, page_url, pat, segments in SOURCES:
        try:
            status, _, body = fetch(page_url)
            page = strip_comments(body.decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sid}: ページ取得失敗 {e}")
            # 一時的な失敗で「消失」扱いにしないよう，前回の記録を引き継ぐ
            for u, r in old.items():
                if r.get("source") == sid:
                    found[u] = r
            continue
        seen = set()
        for m in re.finditer(pat, page):
            url = urljoin(page_url, html.unescape(m.group(0)))
            if url in seen:
                continue
            seen.add(url)
            rec = {"source": sid, "segments": segments, "label": link_label(page, m)}
            try:
                status, h, body = fetch(url, prev=old.get(url))
                if status == 304:  # 未更新: 前回の記録をそのまま使う
                    found[url] = {**old[url], "source": sid, "segments": segments,
                                  "label": rec["label"]}
                    continue
                rec["last_modified"] = h.get("Last-Modified")
                rec["etag"] = h.get("ETag")
                rec["size"] = len(body)
                rec["is_pdf"] = body[:5] == b"%PDF-"
                rec["sha256"] = hashlib.sha256(body).hexdigest()
            except Exception as e:  # noqa: BLE001
                rec["error"] = str(e)
                if url in old:  # 取得エラーは state に保存せず前回の記録を残す
                    errors.append(f"{sid}: {os.path.basename(url)} 取得失敗 {e}")
                    found[url] = old[url]
                    continue
            found[url] = rec
    return found, errors


def diff_state(old, new):
    events = []
    for url, rec in new.items():
        if "error" in rec:
            events.append(("error", url, rec, f"取得失敗: {rec['error']}"))
        elif not rec.get("is_pdf"):
            events.append(("broken", url, rec, "PDF ではない応答（リンク切れの可能性）"))
        elif url not in old:
            events.append(("new", url, rec, "新規リンク"))
        elif old[url].get("sha256") != rec.get("sha256"):
            events.append(("changed", url, rec, f"内容更新（前回 {old[url].get('last_modified')} → {rec.get('last_modified')}）"))
    for url, rec in old.items():
        if url not in new:
            events.append(("removed", url, rec, "ページから消失"))
    return events


def coverage_warnings(today, days):
    """manifest.regular の各区間について，today+days までデータが続くかを調べる"""
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = json.load(f)
    horizon = today + timedelta(days=days)
    rows = []
    for seg, entries in sorted(manifest.get("regular", {}).items()):
        # 今日を覆うエントリ
        covering = [e for e in entries if e["valid_from"] <= today.isoformat()
                    and (e["valid_until"] is None or today.isoformat() <= e["valid_until"])]
        untils = [e["valid_until"] for e in entries if e["valid_from"] <= horizon.isoformat()]
        open_ended = any(u is None for u in untils)
        last_until = None if open_ended else max(untils) if untils else None
        if not covering:
            status = "expired"
            note = f"今日を覆うデータなし（最終 valid_until {last_until}）．アプリは期限切れデータへフォールバック中"
        elif not open_ended and last_until and date.fromisoformat(last_until) < horizon:
            status = "expiring"
            note = f"{last_until} で終了（{(date.fromisoformat(last_until) - today).days} 日後）"
        else:
            status = "ok"
            note = "無期限" if open_ended else f"{last_until} まで"
        rows.append((seg, status, note))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-state", action="store_true")
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--today", help="YYYY-MM-DD（テスト用）")
    args = ap.parse_args()
    today = date.fromisoformat(args.today) if args.today else datetime.now(JST).date()

    old = {}
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH, encoding="utf-8") as f:
            old = json.load(f).get("pdfs", {})
    new, errors = scan_sources(old)
    events = diff_state(old, new)
    cov = coverage_warnings(today, args.days)

    print(f"# 時刻表ソース監視レポート（{today}）\n")
    print("## データの有効期間\n")
    print("| 区間 | 状態 | 備考 |\n|---|---|---|")
    mark = {"ok": "OK", "expiring": "⚠ 期限間近", "expired": "✖ 期限切れ"}
    for seg, st, note in cov:
        print(f"| {seg} | {mark[st]} | {note} |")
    print("\n## 公式ページのPDF\n")
    if not old:
        print("（初回実行: 状態ファイルがないため全リンクを一覧表示）\n")
    print("| 状態 | ソース | ファイル | Last-Modified | ページ上の表記 |\n|---|---|---|---|---|")
    ev_by_url = {u: (k, msg) for k, u, _, msg in events}
    for url, rec in sorted(new.items(), key=lambda x: (x[1]["source"], x[0])):
        k, msg = ev_by_url.get(url, ("same", "変化なし"))
        print(f"| {k} | {rec['source']} | [{os.path.basename(url)}]({url}) | {rec.get('last_modified') or '-'} | {rec.get('label', '')[:60]} |")
    for k, url, rec, msg in events:
        if k == "removed":
            print(f"| removed | {rec['source']} | {os.path.basename(url)} | - | {msg} |")
    if errors:
        print("\n## エラー\n")
        for e in errors:
            print(f"- {e}")

    # apply.py に渡す「新規・更新」PDF の一覧（state.json 更新の前に書く）
    # 期限切れの区間は，掲載中の PDF が未反映の可能性があるため（検知済みでも）候補に加える
    expired = {seg for seg, st, _ in cov if st == "expired"}
    cands = [(k, u, r) for k, u, r, _ in events if k in ("new", "changed")]
    listed = {u for _, u, _ in cands}
    for u, r in new.items():
        if u not in listed and r.get("is_pdf") and expired & set(r.get("segments") or []):
            cands.append(("backlog", u, r))
    with open(EVENTS_PATH, "w", encoding="utf-8") as f:
        json.dump([{"kind": k, "url": u, "source": r.get("source"), "segments": r.get("segments"),
                    "label": r.get("label"), "expired": sorted(expired)} for k, u, r in cands], f, ensure_ascii=False, indent=1)

    if args.update_state:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump({"checked_at": datetime.now(JST).isoformat(timespec="seconds"), "pdfs": new},
                      f, ensure_ascii=False, indent=1)

    changed = any(k in ("new", "changed", "removed", "broken") for k, *_ in events)
    warned = any(st != "ok" for _, st, _ in cov)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\nwarned={'true' if warned else 'false'}\n")
    return 10 if (changed or warned or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
