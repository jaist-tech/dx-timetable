"""小松空港連絡バスのパーサー"""
import json
import os
import glob
import re
import pdfplumber
import pandas as pd


def parse_time(raw):
    """時刻文字列をパース。セミコロン(8;05)もコロンとして扱う"""
    if raw is None:
        return None
    s = str(raw).strip().replace(';', ':')
    m = re.match(r'^(\d{1,2}):(\d{2})$', s)
    if m:
        h, mi = int(m.group(1)), m.group(2)
        return f"{h}:{mi}"
    return None


def extract_to_airport(df):
    """テーブル0から小松駅→小松空港の便を抽出"""
    trips = []

    for r in range(df.shape[0]):
        cell1 = str(df.iloc[r, 1]) if df.iloc[r, 1] is not None else ''

        # --- 自動運転バス行: 「自動 HH:MM ... HH:MM」形式 ---
        auto_match = re.search(r'自動\s*(\d{1,2}[;:]\d{2})', cell1)
        if auto_match:
            dep_raw = auto_match.group(1)
            dep = parse_time(dep_raw)
            if not dep:
                continue
            # 小松空港着: col8 or セル末尾の時刻
            arr = parse_time(df.iloc[r, 8])
            if not arr:
                # セル内の最後の時刻を探す
                times_in_cell = re.findall(r'(\d{1,2}[;:]\d{2})', cell1)
                if len(times_in_cell) >= 2:
                    arr = parse_time(times_in_cell[-1])
            if dep and arr:
                trip = [""] * len(STOPS_TO_AIRPORT)
                trip[0] = dep   # 小松駅
                trip[7] = arr   # 小松空港
                trips.append({"type": "auto", "times": trip})
            continue

        # --- 通常便: col1に時刻がある行 ---
        # セルに改行区切りで2便入っているケースがある (例: '11:20\n12:20')
        lines = cell1.split('\n')
        for li, line in enumerate(lines):
            dep = parse_time(line.strip())
            if not dep:
                continue

            trip = []
            for ci in range(8):  # col1〜col8
                cell = str(df.iloc[r, ci + 1]) if df.iloc[r, ci + 1] is not None else ''
                cell_lines = cell.split('\n')
                # 同じ行インデックスの時刻を使う
                if li < len(cell_lines):
                    t = parse_time(cell_lines[li].strip())
                else:
                    t = None
                trip.append(t if t else "")

            if any(t for t in trip):
                trips.append({"type": "normal", "times": trip})

    return trips


def extract_from_airport(df, text):
    """テーブル1から小松空港→小松駅の便を抽出

    空港→小松駅のバスは:
    - 航空便到着の約15分後に出発
    - 小松駅まで概ね12分
    - 一部は自動運転バス(定刻発車)
    - 「他の接続バスをご利用ください」= 専用バスなし
    - 「☆」マーク便はクローズドドア(途中乗車不可)
    """
    trips = []

    for r in range(df.shape[0]):
        # col0=発地, col1=便名, col2=☆マーク等, col3=到着時刻, col4=バス情報, col5=自動運転バス
        origin = str(df.iloc[r, 0]).strip() if df.iloc[r, 0] is not None else ''
        flight = str(df.iloc[r, 1]).strip() if df.iloc[r, 1] is not None else ''
        arr_raw = str(df.iloc[r, 3]).strip() if df.iloc[r, 3] is not None else ''
        bus_info = str(df.iloc[r, 4]).strip() if df.iloc[r, 4] is not None else ''
        auto_raw = str(df.iloc[r, 5]).strip() if df.iloc[r, 5] is not None else ''

        # 到着時刻をパース
        arr_time = parse_time(arr_raw)
        if not arr_time:
            continue

        # 「他の接続バスをご利用ください」→ 通常バスなし
        # ただし自動運転バス(col5)がある場合はそちらだけ追加
        if '他の接続バス' in bus_info:
            auto_time = parse_time(auto_raw)
            if auto_time:
                auto_parts = auto_time.split(':')
                auto_h, auto_m = int(auto_parts[0]), int(auto_parts[1])
                auto_arr_min = auto_h * 60 + auto_m + 12
                auto_arr_h, auto_arr_m = auto_arr_min // 60, auto_arr_min % 60
                origin_clean = re.sub(r'[※①②③④⑤○◎☆△□]', '', origin).strip()
                trips.append({
                    "type": "auto",
                    "times": [auto_time, f"{auto_arr_h}:{auto_arr_m:02d}"],
                    "flight": flight,
                    "origin": origin_clean,
                })
            continue

        # バス発車時刻 = 到着の約15分後
        arr_parts = arr_time.split(':')
        arr_h, arr_m = int(arr_parts[0]), int(arr_parts[1])
        bus_dep_min = arr_h * 60 + arr_m + 15
        bus_dep_h, bus_dep_m = bus_dep_min // 60, bus_dep_min % 60
        bus_dep = f"{bus_dep_h}:{bus_dep_m:02d}"

        # 小松駅着 = バス発車の約12分後
        bus_arr_min = bus_dep_min + 12
        bus_arr_h, bus_arr_m = bus_arr_min // 60, bus_arr_min % 60
        bus_arr = f"{bus_arr_h}:{bus_arr_m:02d}"

        trip = [bus_dep, bus_arr]
        origin_clean = re.sub(r'[※①②③④⑤○◎☆△□]', '', origin).strip()

        # 普通バスを追加（col4が〇/○/※などバスありの場合）
        trips.append({
            "type": "normal",
            "times": trip,
            "flight": flight,
            "origin": origin_clean,
        })

        # 自動運転バスもある場合は別便として追加
        auto_time = parse_time(auto_raw)
        if auto_time:
            auto_parts = auto_time.split(':')
            auto_h, auto_m = int(auto_parts[0]), int(auto_parts[1])
            auto_arr_min = auto_h * 60 + auto_m + 12
            auto_arr_h, auto_arr_m = auto_arr_min // 60, auto_arr_min % 60
            trips.append({
                "type": "auto",
                "times": [auto_time, f"{auto_arr_h}:{auto_arr_m:02d}"],
                "flight": flight,
                "origin": origin_clean,
            })

    return trips


def find_pdf(data_dir):
    """data_dir内の小松空港バスPDFを探す"""
    candidates = glob.glob(os.path.join(data_dir, "limo_komatsu*.pdf"))
    if candidates:
        return sorted(candidates)[-1]
    return None


STOPS_TO_AIRPORT = [
    "小松駅", "西町", "浜田町", "桜木町", "城南町", "浮柳", "浮柳西", "小松空港",
]

STOPS_FROM_AIRPORT = [
    "小松空港", "小松駅",
]


def generate(data_dir, output_dir):
    """小松空港連絡バスの時刻表JSONを生成"""
    pdf_path = find_pdf(data_dir)
    if not pdf_path:
        print("  警告: 小松空港バスのPDFが見つかりません。")
        return None

    print(f"  小松空港バス: {os.path.basename(pdf_path)}")

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text()
        tables = page.extract_tables()
        df0 = pd.DataFrame(tables[0])
        df1 = pd.DataFrame(tables[1])

    # 有効期間を抽出
    version_match = re.search(
        r'(\d{4})年\s*(\d{1,2})月(\d{1,2})日\s*[～~]\s*(\d{4})年\s*(\d{1,2})月(\d{1,2})日',
        text,
    )
    if version_match:
        valid_from = f"{version_match.group(1)}-{int(version_match.group(2)):02d}-{int(version_match.group(3)):02d}"
        valid_until = f"{version_match.group(4)}-{int(version_match.group(5)):02d}-{int(version_match.group(6)):02d}"
    else:
        valid_from = None
        valid_until = None

    # 小松駅→小松空港
    to_airport_trips = extract_to_airport(df0)
    to_airport_schedule = [trip["times"] for trip in to_airport_trips]

    # 小松空港→小松駅
    from_airport_trips = extract_from_airport(df1, text)
    from_airport_schedule = [trip["times"] for trip in from_airport_trips]
    from_airport_schedule.sort(
        key=lambda t: int(t[0].split(':')[0]) * 60 + int(t[0].split(':')[1])
    )

    routes = [
        {
            "id": "limo_komatsu_to_airport",
            "name": "小松空港連絡バス（小松駅 → 小松空港）",
            "short_name": "空港バス 小松駅発",
            "color": "#6A1B9A",
            "note": "「自動」は自動運転バス（途中バス停通過）",
            "stops": STOPS_TO_AIRPORT,
            "schedules": {
                "weekday": to_airport_schedule,
                "weekend": to_airport_schedule,
            },
        },
        {
            "id": "limo_komatsu_from_airport",
            "name": "小松空港連絡バス（小松空港 → 小松駅）",
            "short_name": "空港バス 小松空港発",
            "color": "#4A148C",
            "note": "航空便到着の約15分後発車。小松駅まで概ね12分。時刻は目安です。",
            "stops": STOPS_FROM_AIRPORT,
            "schedules": {
                "weekday": from_airport_schedule,
                "weekend": from_airport_schedule,
            },
        },
    ]

    final_data = {
        "meta": {
            "valid_from": valid_from,
            "valid_until": valid_until,
            "operator": "小松空港連絡バス",
            "note": "小松空港→小松駅の時刻は航空便到着の約15分後発車・約12分運行の推定値です。正確な時刻は元のPDFデータをご確認ください。",
        },
        "routes": routes,
    }

    output_path = os.path.join(output_dir, "limo_komatsu.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    for route in routes:
        print(f"    {route['short_name']}: {len(route['schedules']['weekday'])}便")

    return output_path
