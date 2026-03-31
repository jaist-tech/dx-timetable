"""JAISTシャトルバス 小松線のパーサー"""
import pdfplumber
import pandas as pd
import json
import re
import os
import glob
from datetime import date


def extract_komatsu_data(pdf_path):
    """小松線のPDFからデータを抽出し、(valid_from, valid_until, 路線リスト) を返す"""
    note_text = "期間不明"
    komatsu_valid_from = None
    komatsu_valid_until = None
    outbound_schedule = {"weekday": [], "weekend": []}
    inbound_schedule = {"weekday": [], "weekend": []}

    with pdfplumber.open(pdf_path) as pdf:
        first_page_text = pdf.pages[0].extract_text()

        match = re.search(
            r'(\d{4})\s*/\s*(\d{1,2})\s*/\s*(\d{1,2})\s*[~～\-]\s*(\d{1,2})\s*/\s*(\d{1,2})',
            first_page_text,
        )
        if match:
            year = int(match.group(1))
            from_month = int(match.group(2))
            from_day = int(match.group(3))
            to_month = int(match.group(4))
            to_day = int(match.group(5))
            komatsu_valid_from = date(year, from_month, from_day)
            komatsu_valid_until = date(year, to_month, to_day)
            clean_date = f"{year}/{from_month}/{from_day}~{to_month}/{to_day}"
            note_text = clean_date + " ダイヤ"

        # 下り（JAIST -> 小松駅）
        page0 = pdf.pages[0]
        df0 = pd.DataFrame(page0.extract_table())
        dep_col = arr_col = None
        for col in df0.columns:
            header_text = "".join(str(val) for val in df0[col].head(5).values if val is not None)
            if "大学院発" in header_text:
                dep_col = col
            elif "小松駅着" in header_text:
                arr_col = col

        if dep_col is not None and arr_col is not None:
            for r in range(df0.shape[0]):
                dep_cell = str(df0.iloc[r, dep_col]) if df0.iloc[r, dep_col] is not None else ''
                arr_cell = str(df0.iloc[r, arr_col]) if df0.iloc[r, arr_col] is not None else ''
                dep_times = re.findall(r'\d{1,2}:\d{2}', dep_cell)
                arr_times = re.findall(r'\d{1,2}:\d{2}', arr_cell)
                for d, a in zip(dep_times, arr_times):
                    df_ = f"{int(d.split(':')[0])}:{d.split(':')[1]}"
                    af_ = f"{int(a.split(':')[0])}:{a.split(':')[1]}"
                    outbound_schedule["weekday"].append([df_, af_])
                    outbound_schedule["weekend"].append([df_, af_])

        # 上り（小松駅 -> JAIST）
        page1 = pdf.pages[1]
        df1 = pd.DataFrame(page1.extract_table())
        dep_col = arr_col = None
        for col in df1.columns:
            header_text = "".join(str(val) for val in df1[col].head(5).values if val is not None)
            if "小松駅発" in header_text:
                dep_col = col
            elif "大学院着" in header_text:
                arr_col = col

        if dep_col is not None and arr_col is not None:
            for r in range(df1.shape[0]):
                dep_cell = str(df1.iloc[r, dep_col]) if df1.iloc[r, dep_col] is not None else ''
                arr_cell = str(df1.iloc[r, arr_col]) if df1.iloc[r, arr_col] is not None else ''
                dep_times = re.findall(r'\d{1,2}:\d{2}', dep_cell)
                arr_times = re.findall(r'\d{1,2}:\d{2}', arr_cell)
                for d, a in zip(dep_times, arr_times):
                    df_ = f"{int(d.split(':')[0])}:{d.split(':')[1]}"
                    af_ = f"{int(a.split(':')[0])}:{a.split(':')[1]}"
                    inbound_schedule["weekday"].append([df_, af_])
                    inbound_schedule["weekend"].append([df_, af_])

    routes = [
        {
            "id": "komatsu_outbound",
            "name": "JAISTシャトル 小松線（大学 → 小松駅）",
            "short_name": "小松線 下り",
            "color": "#FF9800",
            "note": note_text,
            "stops": ["JAIST", "小松駅"],
            "schedules": outbound_schedule,
        },
        {
            "id": "komatsu_inbound",
            "name": "JAISTシャトル 小松線（小松駅 → 大学）",
            "short_name": "小松線 上り",
            "color": "#E91E63",
            "note": note_text,
            "stops": ["小松駅", "JAIST"],
            "schedules": inbound_schedule,
        },
    ]
    return komatsu_valid_from, komatsu_valid_until, routes


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
