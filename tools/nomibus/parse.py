#!/usr/bin/env python3
"""キャッシュした時刻表HTMLをパースして中間JSONを生成する。

ネットワークアクセスは一切しない（cache/ のみ読む）。何度でも再実行可。

各時刻表ページ(cache/<id>.html)には1つ以上の <table> があり、各テーブルは:
  caption: "循環ルート（鍋谷方面・坪野方面）時刻表【平日】鍋谷方面" のような系統名
  ヘッダ行: 番号 | バス停名 | 乗り継ぎ | 1便目 | 2便目 | ...
  データ行: <系統コード> | <バス停名> | <乗継先> | <時刻 or ->...

出力(intermediate/<page_id>__<table_idx>.json):
  {
    "source_page": "1240",
    "caption": "...",
    "route_name": "循環ルート（鍋谷方面・坪野方面）",
    "day_type": "weekday" | "weekend",
    "direction_label": "鍋谷方面",
    "stops": ["辰口福祉会館", ...],
    "stop_codes": ["NA1", ...],
    "transfers_at": {"辰口福祉会館": "連携(日中)/循環(坪野)/循環(岩本)", ...},
    "trips": [ ["9:12","9:13",...], ... ]   # 便ごと(列ごと)の時刻配列。"-"/空はnull
  }
"""
import os
import re
import json
import html
import glob

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
OUT_DIR = os.path.join(os.path.dirname(__file__), "intermediate")

clean = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_caption(cap):
    """captionから route_name / day_type / direction_label を抽出"""
    day_type = None
    if "平日" in cap:
        day_type = "weekday"
    elif "土日祝" in cap or "土日" in cap or "休日" in cap:
        day_type = "weekend"
    elif "全日" in cap:
        day_type = "all"  # weekday・weekendともに同じダイヤ
    # "<route>時刻表【...】<direction>" の形を分解
    route_name = cap
    direction_label = ""
    m = re.match(r"^(.*?)時刻表【.*?】(.*)$", cap)
    if m:
        route_name = m.group(1).strip()
        direction_label = m.group(2).strip()
    else:
        # 【...】が無い場合: "時刻表" 以前を route_name に
        m2 = re.match(r"^(.*?)時刻表(.*)$", cap)
        if m2:
            route_name = m2.group(1).strip()
            direction_label = m2.group(2).strip()
    return route_name, day_type, direction_label


def norm_time(s):
    s = s.strip().replace(";", ":").replace("：", ":")
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}"
    return None  # "-" や空欄は通過/運行なし


def parse_table(tbl, page_id, ti):
    cap_m = re.search(r"<caption[^>]*>(.*?)</caption>", tbl, re.S)
    caption = clean(cap_m.group(1)) if cap_m else ""
    route_name, day_type, direction_label = parse_caption(caption)

    rows = re.findall(r"<tr.*?</tr>", tbl, re.S)
    grid = []
    for r in rows:
        cells = [clean(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
        grid.append(cells)
    if not grid:
        return None

    # ヘッダ行を特定（"バス停名" を含む行）
    header_idx = next((i for i, row in enumerate(grid) if "バス停名" in row), 0)
    header = grid[header_idx]
    data_rows = grid[header_idx + 1:]
    # 便の列インデックス（"○便目" / "便" を含む列、なければ4列目以降）
    trip_cols = [j for j, h in enumerate(header) if "便" in h]
    if not trip_cols:
        trip_cols = list(range(3, len(header)))

    stop_codes, stops, transfers_at = [], [], {}
    # trips[col] = バス停順の時刻配列
    trips = {j: [] for j in trip_cols}
    for row in data_rows:
        if len(row) < 3:
            continue
        code, name, tr = row[0], row[1], row[2]
        if not name:
            continue
        stop_codes.append(code)
        stops.append(name)
        if tr:
            transfers_at[name] = tr
        for j in trip_cols:
            val = row[j] if j < len(row) else ""
            trips[j].append(norm_time(val))

    # 全便がNoneの列(運行なし)は捨てる
    trip_list = []
    for j in trip_cols:
        col = trips[j]
        if any(v is not None for v in col):
            trip_list.append(col)

    return {
        "source_page": page_id,
        "table_index": ti,
        "caption": caption,
        "route_name": route_name,
        "day_type": day_type,
        "direction_label": direction_label,
        "stops": stops,
        "stop_codes": stop_codes,
        "transfers_at": transfers_at,
        "trips": trip_list,
    }


def _find_outer_caption(tbl):
    """caption内にtableが入った不正HTML向け: tblは外側tableの全体テキスト。
    外側tableの直下(depth=1)にある <caption>...</caption> の内容範囲を返す。
    見つからなければ None。"""
    tbl_d = 0  # table深さ (最初の<table>で1になる)
    cap_open = None
    for m in re.finditer(r"<(/?)(table|caption)\b", tbl, re.I):
        is_close = bool(m.group(1))
        tag = m.group(2).lower()
        if tag == "table":
            tbl_d += -1 if is_close else 1
        elif tag == "caption":
            # tbl_d==1 が外側tableの直下
            if not is_close and tbl_d == 1:
                cap_open = m.end()
            elif is_close and tbl_d == 1 and cap_open is not None:
                return cap_open, m.start()
    return None


def extract_tables(html_text):
    """トップレベル(depth=1)の<table>を抽出する。
    ただし caption 内に子テーブルが埋め込まれた不正HTML(1219等)を分解する。
    """
    tables = []
    depth = 0
    start = None
    for m in re.finditer(r"<(/?)table", html_text, re.I):
        if m.group(1) == "":
            if depth == 0:
                start = m.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0 and start is not None:
                tbl = html_text[start:m.end() + 1]
                start = None
                # 外側captionを深さ追跡で取得
                outer_cap = _find_outer_caption(tbl)
                if outer_cap:
                    cap_s, cap_e = outer_cap
                    cap_content = tbl[cap_s:cap_e]
                    if re.search(r"<table", cap_content, re.I):
                        # caption内の子テーブルを個別抽出
                        inner_d = 0; inner_s = None
                        for im in re.finditer(r"<(/?)table", cap_content, re.I):
                            if im.group(1) == "":
                                if inner_d == 0: inner_s = im.start()
                                inner_d += 1
                            else:
                                inner_d -= 1
                                if inner_d == 0 and inner_s is not None:
                                    tables.append(cap_content[inner_s:im.end() + 1])
                                    inner_s = None
                        # caption終了後の残りデータを擬似テーブルとして追加
                        # </caption>タグの終了位置を求める
                        cap_close_end = tbl.find("</caption>", cap_e)
                        if cap_close_end >= 0:
                            after_cap = tbl[cap_close_end + len("</caption>"):]
                        else:
                            after_cap = tbl[cap_e:]
                        if re.search(r"<thead|<tbody|<tr", after_cap, re.I):
                            p_cap = re.search(r"<p>([^<]+時刻表[^<]*)</p>", cap_content)
                            cap_tag = f"<caption>{p_cap.group(1)}</caption>" if p_cap else ""
                            outer_tag = re.match(r"(<table[^>]*>)", tbl)
                            prefix = (outer_tag.group(1) if outer_tag else "<table>") + cap_tag
                            tables.append(prefix + after_cap)
                        continue
                tables.append(tbl)
    return tables


def parse_revision_date(html_text):
    """ページ内の <time datetime="YYYY-MM-DD"> から更新日を取得する。
    市サイトは <!-- ↓更新日 --> ... <time datetime="2026-03-14"> の形式。
    見つからなければ None。"""
    m = re.search(r'<time[^>]+datetime="(\d{4}-\d{2}-\d{2})"', html_text)
    return m.group(1) if m else None


def parse_page(path):
    page_id = os.path.splitext(os.path.basename(path))[0]
    h = open(path, encoding="utf-8", errors="replace").read()
    revision_date = parse_revision_date(h)
    # script/style除去はテーブル抽出後に行う（除去でオフセットが変わると入れ子検出が壊れる）
    tables = extract_tables(h)
    results = []
    for ti, tbl in enumerate(tables):
        # テーブル内のscript/styleを除去してからパース
        tbl_clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", tbl, flags=re.S)
        if "時刻表" not in tbl_clean and "バス停名" not in tbl_clean:
            continue
        parsed = parse_table(tbl_clean, page_id, ti)
        if parsed and parsed["stops"]:
            if revision_date:
                parsed["revision_date"] = revision_date
            results.append(parsed)
    return page_id, results


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # timetable_ids.tsv があればそれを優先、なければ cache 内の全HTMLを走査
    ids_file = os.path.join(os.path.dirname(__file__), "timetable_ids.tsv")
    target_paths = []
    if os.path.exists(ids_file):
        with open(ids_file, encoding="utf-8") as f:
            next(f, None)
            for line in f:
                tid = line.split("\t", 1)[0].strip()
                p = os.path.join(CACHE_DIR, f"{tid}.html")
                if os.path.exists(p):
                    target_paths.append(p)
    else:
        target_paths = sorted(glob.glob(os.path.join(CACHE_DIR, "*.html")))

    total_tables = 0
    summary = []
    for path in target_paths:
        page_id, results = parse_page(path)
        for res in results:
            out = os.path.join(OUT_DIR, f"{page_id}__{res['table_index']}.json")
            with open(out, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
            total_tables += 1
            summary.append((page_id, res["caption"], len(res["stops"]), len(res["trips"]), res["day_type"]))

    print(f"パース完了: {total_tables} テーブル → {OUT_DIR}")
    print(f"{'page':<6}{'day':<9}{'stops':>6}{'trips':>6}  caption")
    for pid, cap, ns, nt, dt in summary:
        print(f"{pid:<6}{str(dt):<9}{ns:>6}{nt:>6}  {cap}")


if __name__ == "__main__":
    main()
