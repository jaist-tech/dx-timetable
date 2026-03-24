"""JAISTシャトルバス 鶴来線のパーサー"""
import pdfplumber
import pandas as pd
import json
import re
import os
import glob
from datetime import date


def extract_tsurugi_data(pdf_path):
    """鶴来線のPDFからデータを抽出し、(valid_from, valid_until, 路線リスト) を返す"""
    valid_from = None
    valid_until = None
    outbound_schedule = {"weekday": [], "weekend": []}
    inbound_schedule = {"weekday": [], "weekend": []}

    with pdfplumber.open(pdf_path) as pdf:
        first_page_text = pdf.pages[0].extract_text()
        match = re.search(r'令和(\d+)年(\d+)月(\d+)日現在', first_page_text)
        if match:
            year = int(match.group(1)) + 2018
            month = int(match.group(2))
            day = int(match.group(3))
            valid_from = date(year, month, day)

        for i, page in enumerate(pdf.pages):
            day_type = "weekday" if i == 0 else "weekend"
            table = page.extract_table()
            if not table:
                continue

            df = pd.DataFrame(table)
            df = df.dropna(how='all').dropna(axis=1, how='all')
            half_cols = len(df.columns) // 2

            for index, row in df.iterrows():
                full_row = [str(cell).replace('\n', '') if cell is not None else "" for cell in row.values]

                inbound_data = full_row[:half_cols]
                inbound_times = [val for val in inbound_data if ":" in val]
                if len(inbound_times) == 8:
                    inbound_schedule[day_type].append(inbound_times)

                outbound_data = full_row[half_cols:]
                outbound_times = [val for val in outbound_data if ":" in val]
                if len(outbound_times) == 8:
                    outbound_schedule[day_type].append(outbound_times)

    routes = [
        {
            "id": "tsurugi_outbound",
            "name": "鶴来線（大学 → 鶴来駅）",
            "short_name": "鶴来線 下り",
            "color": "#4CAF50",
            "stops": ["JAIST", "ハイテクセンター前", "宮竹ヘルスロード", "灯台笹", "岩本", "本鶴来", "鶴来本町", "鶴来駅"],
            "schedules": outbound_schedule,
        },
        {
            "id": "tsurugi_inbound",
            "name": "鶴来線（鶴来駅 → 大学）",
            "short_name": "鶴来線 上り",
            "color": "#2196F3",
            "stops": ["鶴来駅", "鶴来本町", "本鶴来", "岩本", "灯台笹", "宮竹ヘルスロード", "ハイテクセンター前", "JAIST"],
            "schedules": inbound_schedule,
        },
    ]
    return valid_from, valid_until, routes


def find_pdf(data_dir):
    """data_dir内の鶴来線PDFを探す"""
    candidates = glob.glob(os.path.join(data_dir, "shuttle_turugi*.pdf"))
    if candidates:
        return sorted(candidates)[-1]
    return None


def generate(data_dir, output_dir):
    """鶴来線の時刻表JSONを生成"""
    pdf_path = find_pdf(data_dir)
    if not pdf_path:
        print("  警告: 鶴来線のPDFが見つかりません。")
        return None

    print(f"  鶴来線: {os.path.basename(pdf_path)}")
    valid_from, valid_until, routes = extract_tsurugi_data(pdf_path)

    final_data = {
        "meta": {
            "valid_from": valid_from.isoformat() if valid_from else None,
            "valid_until": valid_until.isoformat() if valid_until else None,
            "operator": "JAISTシャトルバス",
            "note": "時刻が空欄の箇所は、通過または停車設定なしです。",
        },
        "routes": routes,
    }

    output_path = os.path.join(output_dir, "shuttle_tsurugi.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    for route in routes:
        for day_type in ['weekday', 'weekend']:
            trips = route['schedules'].get(day_type, [])
            print(f"    {route['short_name']} ({day_type}): {len(trips)}便")

    return output_path
