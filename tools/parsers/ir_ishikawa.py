"""IRいしかわ鉄道のパーサー"""
import json
import os
import glob
import re
import pdfplumber
import pandas as pd


# IR石川線の全駅（大聖寺→倶利伽羅の順 = 下り方向）
# 金沢を境に南側（大聖寺〜金沢）と北側（金沢〜倶利伽羅）に分かれる
STATIONS_SOUTH = [
    "大聖寺駅", "加賀温泉駅", "動橋駅", "粟津駅", "小松駅", "明峰駅", "能美根上駅",
    "小舞子駅", "美川駅", "加賀笠間駅", "西松任駅", "松任駅", "野々市駅", "西金沢駅", "金沢駅",
]
STATIONS_NORTH = [
    "金沢駅", "東金沢駅", "森本駅", "津幡駅", "倶利伽羅駅",
]

# PDFの駅名表記 → 正規化名のマッピング
STATION_NAME_MAP = {
    "大 聖 寺": "大聖寺駅",
    "加賀温泉": "加賀温泉駅",
    "動 橋": "動橋駅",
    "粟 津": "粟津駅",
    "小 松": "小松駅",
    "明 峰": "明峰駅",
    "能美根上": "能美根上駅",
    "小 舞 子": "小舞子駅",
    "美 川": "美川駅",
    "加賀笠間": "加賀笠間駅",
    "西 松 任": "西松任駅",
    "松 任": "松任駅",
    "野 々 市": "野々市駅",
    "西 金 沢": "西金沢駅",
    "金 沢": "金沢駅",
    "東 金 沢": "東金沢駅",
    "森 本": "森本駅",
    "津 幡": "津幡駅",
    "倶利伽羅": "倶利伽羅駅",
    "敦 賀": "敦賀駅",
    "福 井": "福井駅",
    "七 尾": "七尾駅",
    "富 山": "富山駅",
}


def normalize_station(raw):
    """PDF駅名を正規化"""
    if raw is None:
        return None
    s = str(raw).strip().replace("\n", "")
    if s == '' or s == 'nan' or s == 'None':
        return None
    return STATION_NAME_MAP.get(s, s)


def parse_time(raw, prefer_first=True):
    """時刻文字列をパース。'5:18' -> '5:18', None/空 -> None
    セルに改行区切りで複数時刻がある場合(例: '16:12\\n16:40'):
      prefer_first=True: 最初の時刻(着)を返す
      prefer_first=False: 最後の時刻(発)を返す
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s == 'nan':
        return None
    # 改行区切りで複数時刻があるケース
    parts = s.split('\n')
    target = parts[0].strip() if prefer_first else parts[-1].strip()
    target = target.replace(" ", "")
    m = re.match(r'^(\d{1,2}):(\d{2})$', target)
    if m:
        h, mi = int(m.group(1)), m.group(2)
        return f"{h}:{mi}"
    # 単一値のケース（改行なし）
    s_clean = s.replace("\n", "").replace(" ", "")
    m = re.match(r'^(\d{1,2}):(\d{2})$', s_clean)
    if m:
        h, mi = int(m.group(1)), m.group(2)
        return f"{h}:{mi}"
    return None


def detect_operation(df, col_idx):
    """列の運行条件を判定: 'daily', 'weekday_only', 'weekend_only'"""
    # テーブル全体で土休日マーカーを探す
    for r in range(df.shape[0]):
        val = str(df.iloc[r, col_idx]) if df.iloc[r, col_idx] is not None else ''
        val_clean = val.replace('\n', '').replace(' ', '')
        # 「運」「土」を含むセルのみ対象（土休日の運行条件）
        if '運' not in val_clean or '土' not in val_clean:
            continue
        # 「運休」がサブストリングに含まれるなら土休日運休 = 平日のみ
        if '運休' in val_clean:
            return 'weekday_only'
        # 「転」があり「休止」でなければ土休日運転 = 土休日のみ
        if '転' in val_clean and '休止' not in val_clean:
            return 'weekend_only'
    return 'daily'


def extract_trains_from_table(df, station_rows, col_start, col_end,
                              train_id_row=0, terminal_row=None):
    """
    テーブルから列車ごとのデータを抽出。
    station_rows: [(row_idx, station_name), ...] 駅の行位置と名前
    train_id_row: 列車番号が入っている行番号
    terminal_row: 終着駅の行番号（着時刻を使う）。Noneなら全駅で発時刻を使う。
    Returns: [{train_id, operation, times: {station: time}, col: int}, ...]
    """
    trains = []
    for c in range(col_start, col_end):
        # 列車番号を取得
        train_id_raw = str(df.iloc[train_id_row, c]).strip() if df.iloc[train_id_row, c] else ''
        # 列車番号がない列はスキップ（空列や特急の直通元情報）
        train_id_clean = re.sub(r'[^\dA-Za-zＭ]', '', train_id_raw.replace('\n', ''))
        if not train_id_clean:
            continue
        # Ｍ→Mに正規化
        train_id_clean = train_id_clean.replace('Ｍ', 'M')

        # 運行条件の判定
        operation = detect_operation(df, c)

        # 各駅の時刻を取得
        times = {}
        has_any_time = False
        for row_idx, station_name in station_rows:
            # 終着駅は着時刻(prefer_first=True)、それ以外は発時刻
            # 改行区切りで「着\n発」の場合: 着=最初, 発=最後
            if row_idx == terminal_row:
                t = parse_time(df.iloc[row_idx, c], prefer_first=True)
            else:
                t = parse_time(df.iloc[row_idx, c], prefer_first=False)
            if t:
                times[station_name] = t
                has_any_time = True

        if has_any_time:
            trains.append({
                'train_id': train_id_clean,
                'operation': operation,
                'times': times,
                'col': c,
            })

    return trains


def propagate_operation(north_trains, south_trains):
    """
    同じ列(col)の北側・南側で運行条件を共有する。
    片方にマーカーがあればもう片方にも適用。
    """
    col_to_op = {}
    for train in north_trains + south_trains:
        c = train['col']
        if train['operation'] != 'daily':
            col_to_op[c] = train['operation']

    for train in north_trains + south_trains:
        c = train['col']
        if c in col_to_op:
            train['operation'] = col_to_op[c]


def build_downbound_station_rows(df):
    """下りテーブルの駅行マッピングを構築"""
    rows = []
    for r in range(df.shape[0]):
        station = normalize_station(df.iloc[r, 1])
        dep_arr = str(df.iloc[r, 2]).strip() if df.iloc[r, 2] else ''
        if station in STATION_NAME_MAP.values():
            # 金沢の「着」と金沢以北の「発」を区別
            if station == "金沢駅":
                if dep_arr == '着':
                    rows.append((r, "金沢駅"))
                elif dep_arr == '列車':
                    # 金沢以北セクションの列車番号行 → スキップ
                    pass
            elif station == "津幡駅":
                # 津幡は着行と発行がある。発の時刻を使う
                if dep_arr == '発' or (df.iloc[r, 2] is None and r > 0):
                    # 発の行を探す
                    pass
                if dep_arr == '着':
                    rows.append((r, "津幡駅"))
            else:
                if dep_arr in ('発', '着'):
                    rows.append((r, station))
    return rows


def build_upbound_station_rows(df):
    """上りテーブルの駅行マッピングを構築"""
    rows = []
    for r in range(df.shape[0]):
        station = normalize_station(df.iloc[r, 1])
        dep_arr = str(df.iloc[r, 2]).strip() if df.iloc[r, 2] else ''
        if station in STATION_NAME_MAP.values():
            if station == "金沢駅":
                if dep_arr == '着':
                    rows.append((r, "金沢駅"))
                # 金沢の「列車」行はスキップ
            elif station == "津幡駅":
                if dep_arr == '着':
                    rows.append((r, "津幡駅"))
            else:
                if dep_arr in ('発', '発\n着', '着'):
                    rows.append((r, station))
    return rows


def merge_tables(trains_list_a, trains_list_b):
    """2つのテーブル（前半・後半）の列車リストを結合"""
    return trains_list_a + trains_list_b


def trains_to_schedule(trains, stations, day_type):
    """
    列車リストからスケジュール配列を構築。
    day_type: 'weekday' or 'weekend'
    """
    trips = []
    for train in trains:
        op = train['operation']
        # 日種に合わない列車は除外
        if day_type == 'weekday' and op == 'weekend_only':
            continue
        if day_type == 'weekend' and op == 'weekday_only':
            continue

        trip = []
        has_time = False
        for station in stations:
            t = train['times'].get(station, '')
            trip.append(t)
            if t:
                has_time = True

        if has_time:
            trips.append(trip)

    return trips


def sort_trips(trips, stations):
    """始発駅の時刻でソート"""
    def sort_key(trip):
        for t in trip:
            if t:
                parts = t.split(':')
                h = int(parts[0])
                m = int(parts[1])
                # 0〜3時台は翌日扱い
                if h < 4:
                    h += 24
                return h * 60 + m
        return 9999
    return sorted(trips, key=sort_key)


def extract_ir_ishikawa(pdf_path):
    """IR石川線のPDFから時刻表データを抽出"""
    valid_from = None

    all_down_south_trains = []  # 下り南側（大聖寺→金沢）
    all_down_north_trains = []  # 下り北側（金沢→倶利伽羅）
    all_up_north_trains = []    # 上り北側（倶利伽羅→金沢）
    all_up_south_trains = []    # 上り南側（金沢→大聖寺）

    with pdfplumber.open(pdf_path) as pdf:
        # バージョン情報 → valid_from
        text = pdf.pages[0].extract_text()
        m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', text)
        if m:
            valid_from = f"{int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        # ===== ページ0: 下り =====
        page0_tables = pdf.pages[0].extract_tables()

        for ti in [1, 2]:  # テーブル0は凡例、テーブル1,2が時刻表
            if ti >= len(page0_tables):
                continue
            df = pd.DataFrame(page0_tables[ti])
            station_rows = build_downbound_station_rows(df)

            # 南側区間（大聖寺〜金沢着）の駅行 — 列車番号はrow0
            south_rows = [(r, s) for r, s in station_rows
                          if s in STATIONS_SOUTH]

            # 北側区間（金沢発〜倶利伽羅）— 列車番号はrow20
            # 始発=金沢(発), 途中=東金沢,森本(発), 津幡(着),
            # 終着=倶利伽羅(発だが実質終着)
            north_rows = []
            tsubata_arr_row = None
            kanazawa_dep_found = False
            for r in range(df.shape[0]):
                if r <= 19:
                    continue
                dep_arr = str(df.iloc[r, 2]).strip() if df.iloc[r, 2] else ''
                station = normalize_station(df.iloc[r, 1])
                if dep_arr == '発':
                    if station and station in STATION_NAME_MAP.values():
                        north_rows.append((r, station))
                    elif station is None and not kanazawa_dep_found:
                        # 最初のstation=None+発 = 金沢発
                        north_rows.append((r, "金沢駅"))
                        kanazawa_dep_found = True
                    # 2回目のstation=None+発(=津幡発)は無視
                elif dep_arr == '着':
                    if station == "津幡駅":
                        tsubata_arr_row = r
            # 津幡: 着を使う（終着便は着のみ、通過便は着も発もある）
            if tsubata_arr_row is not None:
                north_rows.append((tsubata_arr_row, "津幡駅"))

            col_end = df.shape[1] - 1

            # 南側の終着駅=金沢着の行を特定
            south_terminal = None
            for row_idx, sname in south_rows:
                if sname == "金沢駅":
                    south_terminal = row_idx

            # 南側と北側を別々に抽出
            south_trains = extract_trains_from_table(
                df, south_rows, 3, col_end, train_id_row=0,
                terminal_row=south_terminal
            )
            # 北側: 倶利伽羅が終着だが「発」しかない。津幡着を終着扱い。
            north_trains = extract_trains_from_table(
                df, north_rows, 3, col_end, train_id_row=20,
                terminal_row=tsubata_arr_row
            )
            # 運行条件を共有（マーカーが片側にしかないケース対応）
            propagate_operation(north_trains, south_trains)
            all_down_south_trains.extend(south_trains)
            all_down_north_trains.extend(north_trains)

        # ===== ページ1: 上り =====
        page1_tables = pdf.pages[1].extract_tables()

        for ti in range(len(page1_tables)):
            df = pd.DataFrame(page1_tables[ti])

            # 北側区間（倶利伽羅〜金沢着）— 列車番号はrow0
            # 始発=倶利伽羅(発), 途中=森本,東金沢(発), 津幡(発),
            # 終着=金沢(着)
            north_rows = []
            tsubata_arr_row = None
            tsubata_dep_row = None
            kanazawa_arr_row = None
            for r in range(df.shape[0]):
                if r > 11:
                    break
                station = normalize_station(df.iloc[r, 1])
                dep_arr = str(df.iloc[r, 2]).strip() if df.iloc[r, 2] else ''
                if station == "金沢駅" and dep_arr == '着':
                    kanazawa_arr_row = r
                    north_rows.append((r, "金沢駅"))
                elif station == "津幡駅":
                    if dep_arr == '着':
                        tsubata_arr_row = r
                    elif dep_arr == '発':
                        tsubata_dep_row = r
                elif station and station in STATION_NAME_MAP.values():
                    if dep_arr in ('発',):
                        north_rows.append((r, station))
                elif station is None and dep_arr == '発' and tsubata_arr_row is not None and tsubata_dep_row is None:
                    # 津幡着の直後のstation=None+発 = 津幡発
                    tsubata_dep_row = r
            # 津幡: 発を使う（途中駅）
            if tsubata_dep_row is not None:
                north_rows.append((tsubata_dep_row, "津幡駅"))
            elif tsubata_arr_row is not None:
                north_rows.append((tsubata_arr_row, "津幡駅"))

            # 南側区間（金沢発〜大聖寺）— 列車番号はrow12
            south_rows = []
            for r in range(12, df.shape[0]):
                station = normalize_station(df.iloc[r, 1])
                dep_arr = str(df.iloc[r, 2]).strip() if df.iloc[r, 2] else ''
                if station == "金沢駅" and dep_arr == '列車':
                    pass  # 列車番号行
                elif dep_arr == '発' and station is None:
                    # 金沢発（駅名セルが結合で空）
                    south_rows.append((r, "金沢駅"))
                elif station and station in STATION_NAME_MAP.values():
                    if dep_arr in ('発', '発\n着'):
                        south_rows.append((r, station))

            col_start = 3
            col_end = df.shape[1] - 1

            # 北側の終着駅=金沢着の行を特定
            north_terminal = None
            for row_idx, sname in north_rows:
                if sname == "金沢駅":
                    north_terminal = row_idx

            # 南側の終着駅=大聖寺の行を特定
            south_terminal = None
            for row_idx, sname in south_rows:
                if sname == "大聖寺駅":
                    south_terminal = row_idx

            # 北側と南側を別々に抽出
            north_trains = extract_trains_from_table(
                df, north_rows, col_start, col_end, train_id_row=0,
                terminal_row=north_terminal
            )
            south_trains = extract_trains_from_table(
                df, south_rows, col_start, col_end, train_id_row=12,
                terminal_row=south_terminal
            )
            propagate_operation(north_trains, south_trains)
            all_up_north_trains.extend(north_trains)
            all_up_south_trains.extend(south_trains)

    # スケジュール構築 — 南側・北側を独立した路線として出力
    # 上り方向の駅順
    stations_up_north = list(reversed(STATIONS_NORTH))  # 倶利伽羅→金沢
    stations_up_south = list(reversed(STATIONS_SOUTH))   # 金沢→大聖寺

    route_configs = [
        ("ir_ishikawa_down_south", "IRいしかわ鉄道（大聖寺 → 金沢）",
         "IR石川 下り南", "#1565C0", STATIONS_SOUTH, all_down_south_trains),
        ("ir_ishikawa_down_north", "IRいしかわ鉄道（金沢 → 倶利伽羅）",
         "IR石川 下り北", "#1976D2", STATIONS_NORTH, all_down_north_trains),
        ("ir_ishikawa_up_north", "IRいしかわ鉄道（倶利伽羅 → 金沢）",
         "IR石川 上り北", "#C62828", stations_up_north, all_up_north_trains),
        ("ir_ishikawa_up_south", "IRいしかわ鉄道（金沢 → 大聖寺）",
         "IR石川 上り南", "#D32F2F", stations_up_south, all_up_south_trains),
    ]

    routes = []
    for route_id, name, short_name, color, stations, trains in route_configs:
        schedules = {}
        for day_type in ['weekday', 'weekend']:
            trips = trains_to_schedule(trains, stations, day_type)
            trips = sort_trips(trips, stations)
            schedules[day_type] = trips
        routes.append({
            "id": route_id,
            "name": name,
            "short_name": short_name,
            "color": color,
            "stops": stations,
            "schedules": schedules,
        })

    return valid_from, routes


def find_pdf(data_dir):
    """data_dir内のIR石川線PDFを探す"""
    candidates = glob.glob(os.path.join(data_dir, "IR_ishikawa*.pdf"))
    if candidates:
        return sorted(candidates)[-1]
    return None


def generate(data_dir, output_dir):
    """IR石川線の時刻表JSONを生成"""
    pdf_path = find_pdf(data_dir)
    if not pdf_path:
        print("  警告: IR石川線のPDFが見つかりません。")
        return None

    print(f"  IR石川線: {os.path.basename(pdf_path)}")
    version_date, routes = extract_ir_ishikawa(pdf_path)

    valid_from = version_date  # already in "YYYY-MM-DD" format from extract_ir_ishikawa

    final_data = {
        "meta": {
            "valid_from": valid_from,
            "valid_until": None,
            "operator": "IRいしかわ鉄道",
            "note": "時刻が空欄の箇所は、通過または停車設定なしです。",
        },
        "routes": routes,
    }

    output_path = os.path.join(output_dir, "ir_ishikawa.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    for route in routes:
        for day_type in ['weekday', 'weekend']:
            trips = route['schedules'].get(day_type, [])
            print(f"    {route['short_name']} ({day_type}): {len(trips)}便")

    return output_path
