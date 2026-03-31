"""北陸鉄道 石川線のパーサー"""
import json
import os
import glob
import re
import pdfplumber
import pandas as pd


# 駅データ（鶴来→野町の順）
STATIONS = [
    {"num": 17, "name_ja": "鶴来駅", "name_en": "Tsurugi"},
    {"num": 16, "name_ja": "日御子駅", "name_en": "Hinomiko"},
    {"num": 15, "name_ja": "小柳駅", "name_en": "Oyanagi"},
    {"num": 14, "name_ja": "井口駅", "name_en": "Inokuchi"},
    {"num": 13, "name_ja": "道法寺駅", "name_en": "Dōhōji"},
    {"num": 12, "name_ja": "曽谷駅", "name_en": "Sodani"},
    {"num": 11, "name_ja": "陽羽里駅", "name_en": "Hibari"},
    {"num": 10, "name_ja": "四十万駅", "name_en": "Shijima"},
    {"num": 9, "name_ja": "乙丸駅", "name_en": "Otomaru"},
    {"num": 8, "name_ja": "額住宅前駅", "name_en": "Nukajūtaku-mae"},
    {"num": 7, "name_ja": "馬替駅", "name_en": "Magae"},
    {"num": 6, "name_ja": "野々市工大前駅", "name_en": "Nonoichi-Kōdaimae"},
    {"num": 5, "name_ja": "野々市駅", "name_en": "Nonoichi"},
    {"num": 4, "name_ja": "押野駅", "name_en": "Oshino"},
    {"num": 3, "name_ja": "新西金沢駅", "name_en": "Shin-nishikanazawa"},
    {"num": 2, "name_ja": "西泉駅", "name_en": "Nishiizumi"},
    {"num": 1, "name_ja": "野町駅", "name_en": "Nomachi"},
]

STATION_NUMS = {s["num"] for s in STATIONS}


def parse_time(raw):
    """'545' -> '5:45', '1013' -> '10:13', None/空/非数値 -> None"""
    if raw is None:
        return None
    s = str(raw).strip().replace("\n", "")
    # 末尾の漢字（金、小、福など）を除去
    s = re.sub(r'[^\d]', '', s)
    if not s or not s.isdigit():
        return None
    if len(s) == 3:
        return f"{s[0]}:{s[1:3]}"
    elif len(s) == 4:
        return f"{int(s[0:2])}:{s[2:4]}"
    return None


def extract_station_num(cell_text):
    """セル先頭の駅番号を取得。'17 鶴 つ る ぎ 来' -> 17"""
    if cell_text is None:
        return None
    m = re.match(r'^\s*(\d{1,2})\s', str(cell_text))
    if m:
        return int(m.group(1))
    return None


def extract_table_data(df):
    """DataFrameから駅番号→時刻リストの辞書を返す"""
    station_times = {}  # {station_num: [time_str, ...]}

    for _, row in df.iterrows():
        station_num = extract_station_num(row.iloc[0])
        if station_num is None or station_num not in STATION_NUMS:
            continue

        times = []
        for val in row.iloc[2:29]:  # 列2~28が時刻データ（列0=駅名, 列1=NaN, 列29=英語名）
            t = parse_time(val)
            times.append(t)
        station_times[station_num] = times

    return station_times


def build_trips(station_times, station_order):
    """駅番号順に並べて便ごとの時刻配列を作る"""
    if not station_times:
        return []

    # 便数を判定（最初に見つかった駅のデータ長）
    first_key = next(iter(station_times))
    num_trips = len(station_times[first_key])

    trips = []
    for trip_idx in range(num_trips):
        trip = []
        all_none = True
        for snum in station_order:
            t = station_times.get(snum, [None] * num_trips)[trip_idx]
            trip.append(t if t else "")
            if t:
                all_none = False
        if not all_none:
            trips.append(trip)

    return trips


def extract_ishikawa_line(weekday_pdf, weekend_pdf):
    """石川線の時刻表を抽出"""

    # 上り: 鶴来→野町（テーブル0）の駅順
    upbound_order = [s["num"] for s in STATIONS]  # 17, 16, ..., 1
    upbound_stops = [s["name_ja"] for s in STATIONS]

    # 下り: 野町→鶴来（テーブル1）の駅順
    downbound_order = list(reversed(upbound_order))  # 1, 2, ..., 17
    downbound_stops = list(reversed(upbound_stops))

    upbound_schedule = {}
    downbound_schedule = {}

    valid_from = None

    for day_type, pdf_path in [("weekday", weekday_pdf), ("weekend", weekend_pdf)]:
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]

            # バージョン情報の抽出
            if day_type == "weekday":
                text = page.extract_text()
                # 「２０２６年度 時刻表」→ その年度の4/1を採用
                nendo_match = re.search(r'[２\d][\d０-９]{3}年度', text)
                if nendo_match:
                    nendo_str = nendo_match.group(0).replace('２', '2').replace('０', '0').replace('２', '2')
                    # 全角→半角変換
                    nendo_str = nendo_str.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
                    y_match = re.match(r'(\d{4})年度', nendo_str)
                    if y_match:
                        valid_from = f"{y_match.group(1)}-04-01"
                if not valid_from:
                    # フォールバック: 「2024. 3.16 改正」パターン
                    matches = re.findall(r'(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*改正', text)
                    if matches:
                        y, mo, d = matches[0]
                        valid_from = f"{int(y)}-{int(mo):02d}-{int(d):02d}"

            tables = page.extract_tables()
            if len(tables) < 2:
                print(f"警告: {pdf_path} のテーブルが2つ未満です")
                continue

            # テーブル0 = 上り（鶴来→野町）
            df_up = pd.DataFrame(tables[0])
            up_data = extract_table_data(df_up)
            upbound_schedule[day_type] = build_trips(up_data, upbound_order)

            # テーブル1 = 下り（野町→鶴来）
            df_down = pd.DataFrame(tables[1])
            down_data = extract_table_data(df_down)
            downbound_schedule[day_type] = build_trips(down_data, downbound_order)

    routes = [
        {
            "id": "ishikawa_upbound",
            "name": "北陸鉄道 石川線（鶴来 → 野町）",
            "short_name": "石川線 上り",
            "color": "#7B1FA2",
            "stops": upbound_stops,
            "schedules": upbound_schedule,
        },
        {
            "id": "ishikawa_downbound",
            "name": "北陸鉄道 石川線（野町 → 鶴来）",
            "short_name": "石川線 下り",
            "color": "#00796B",
            "stops": downbound_stops,
            "schedules": downbound_schedule,
        },
    ]
    return valid_from, routes


def find_pdfs(data_dir):
    """data_dir内の石川線PDFを探す（平日・土日のペア）"""
    weekday = sorted(glob.glob(os.path.join(data_dir, "ishikawa-line_timetable_weekday*.pdf")))
    weekend = sorted(glob.glob(os.path.join(data_dir, "ishikawa-line_timetable_weekend*.pdf")))
    if weekday and weekend:
        return weekday[-1], weekend[-1]
    return None, None


def generate(data_dir, output_dir):
    """石川線の時刻表JSONを生成"""
    weekday_pdf, weekend_pdf = find_pdfs(data_dir)
    if not weekday_pdf or not weekend_pdf:
        print("  警告: 石川線のPDFが見つかりません。")
        return None

    print(f"  石川線: {os.path.basename(weekday_pdf)}, {os.path.basename(weekend_pdf)}")
    valid_from, routes = extract_ishikawa_line(weekday_pdf, weekend_pdf)

    final_data = {
        "meta": {
            "valid_from": valid_from,
            "valid_until": None,
            "operator": "北陸鉄道 石川線",
            "note": "時刻が空欄の箇所は、通過または停車設定なしです。",
        },
        "routes": routes,
    }

    output_path = os.path.join(output_dir, "ishikawa_line.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    for route in routes:
        for day_type in ['weekday', 'weekend']:
            trips = route['schedules'].get(day_type, [])
            print(f"    {route['short_name']} ({day_type}): {len(trips)}便")

    return output_path
