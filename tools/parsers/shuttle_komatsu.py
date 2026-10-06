"""JAISTシャトルバス 小松線のパーサー"""
import pdfplumber
import pandas as pd
import json
import re
import os
import glob
from datetime import date


PERIOD_RE = re.compile(
    r'(\d{4})\s*/\s*(\d{1,2})\s*/\s*(\d{1,2})\s*[~～\-]\s*(?:(\d{1,2})\s*/\s*)?(\d{1,2})'
)


def _parse_period(text):
    """「2026/9/1～30」「2026/9/1～10/31」から (valid_from, valid_until) を返す"""
    m = PERIOD_RE.search(text or '')
    if not m:
        return None, None
    year, fm, fd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    tm = int(m.group(4)) if m.group(4) else fm
    td = int(m.group(5))
    return date(year, fm, fd), date(year + (1 if tm < fm else 0), tm, td)


def _table_times(page, dep_key, arr_key):
    df = pd.DataFrame(page.extract_table())
    dep_col = arr_col = None
    for col in df.columns:
        header_text = "".join(str(val) for val in df[col].head(5).values if val is not None)
        if dep_key in header_text:
            dep_col = col
        elif arr_key in header_text:
            arr_col = col
    pairs = []
    if dep_col is None or arr_col is None:
        return pairs
    for r in range(df.shape[0]):
        dep_cell = str(df.iloc[r, dep_col]) if df.iloc[r, dep_col] is not None else ''
        arr_cell = str(df.iloc[r, arr_col]) if df.iloc[r, arr_col] is not None else ''
        for d, a in zip(re.findall(r'\d{1,2}:\d{2}', dep_cell), re.findall(r'\d{1,2}:\d{2}', arr_cell)):
            pairs.append([f"{int(d.split(':')[0])}:{d.split(':')[1]}",
                          f"{int(a.split(':')[0])}:{a.split(':')[1]}"])
    return pairs


def _build_routes(period, outbound, inbound):
    valid_from, valid_until = period
    if valid_from:
        note_text = f"{valid_from.year}/{valid_from.month}/{valid_from.day}~{valid_until.month}/{valid_until.day} ダイヤ"
    else:
        note_text = "期間不明"
    return [
        {
            "id": "komatsu_outbound",
            "name": "JAISTシャトル 小松線（大学 → 小松駅）",
            "short_name": "小松線 下り",
            "color": "#FF9800",
            "note": note_text,
            "stops": ["JAIST", "小松駅"],
            "schedules": {"weekday": outbound, "weekend": [list(p) for p in outbound]},
        },
        {
            "id": "komatsu_inbound",
            "name": "JAISTシャトル 小松線（小松駅 → 大学）",
            "short_name": "小松線 上り",
            "color": "#E91E63",
            "note": note_text,
            "stops": ["小松駅", "JAIST"],
            "schedules": {"weekday": inbound, "weekend": [list(p) for p in inbound]},
        },
    ]


def extract_komatsu_periods(pdf_path):
    """小松線のPDFから期間ごとの [(valid_from, valid_until, 路線リスト), ...] を返す．

    1 期間につき 2 ページ（下り・上り）．2026 年 9 月以降は 1 ファイルに
    2 か月分（4 ページ）が載るため，2 ページずつ区切って読む．
    """
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages
        if len(pages) % 2 != 0:
            raise ValueError(f'ページ数が奇数（{len(pages)}）: 下り・上りの 2 ページ組の前提が崩れている')
        for i in range(0, len(pages) - 1, 2):
            period = _parse_period(pages[i].extract_text())
            if period[0] is None:
                raise ValueError(f'{i + 1} ページ目から期間を取得できない')
            outbound = _table_times(pages[i], "大学院発", "小松駅着")
            inbound = _table_times(pages[i + 1], "小松駅発", "大学院着")
            out.append((period[0], period[1], _build_routes(period, outbound, inbound)))
    return out


def extract_komatsu_data(pdf_path):
    """小松線のPDFからデータを抽出し，(valid_from, valid_until, 路線リスト) を返す．
    複数期間のPDFでは最初の期間のみ（全期間は extract_komatsu_periods）"""
    periods = extract_komatsu_periods(pdf_path)
    return periods[0] if periods else (None, None, [])


def find_pdf(data_dir):
    """data_dir内の小松線PDFを探す"""
    candidates = glob.glob(os.path.join(data_dir, "shuttle_komatsu*.pdf"))
    if candidates:
        return sorted(candidates)[-1]
    return None


def generate(data_dir, output_dir):
    """小松線の時刻表JSONを生成"""
    pdf_path = find_pdf(data_dir)
    if not pdf_path:
        print("  警告: 小松線のPDFが見つかりません。")
        return None

    print(f"  小松線: {os.path.basename(pdf_path)}")
    valid_from, valid_until, routes = extract_komatsu_data(pdf_path)

    final_data = {
        "meta": {
            "valid_from": valid_from.isoformat() if valid_from else None,
            "valid_until": valid_until.isoformat() if valid_until else None,
            "operator": "JAISTシャトルバス",
            "note": "時刻が空欄の箇所は、通過または停車設定なしです。",
        },
        "routes": routes,
    }

    output_path = os.path.join(output_dir, "shuttle_komatsu.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    for route in routes:
        for day_type in ['weekday', 'weekend']:
            trips = route['schedules'].get(day_type, [])
            print(f"    {route['short_name']} ({day_type}): {len(trips)}便")

    return output_path
