"""JAIST シャトルバス 特別ダイヤ（臨時ダイヤ）用パーサー

対応フォーマット（別紙1=鶴来線 / 別紙2=小松線 と同じ表構造のPDF）:
- 5月連休鶴来線特別ダイヤ（別紙１）.pdf   / 5月連休小松線特別ダイヤ（別紙２）.pdf   (GW)
- shuttle_turugi-summer.pdf              / shuttle_komatsu-summer.pdf              (夏季)

時刻表の表構造は上記いずれも共通。適用日の抽出は日別運行表（「N日 …特別ダイヤ運行」）を
1行ずつ読む方式なので、GWのような連続期間でも夏季のような飛び日でも正しく反映される。
サマリ行の区切り記号の揺れ（、 . , ～ から）にも依存しない。詳細は _extract_apply_periods を参照。
"""

import re
import pdfplumber
import pandas as pd
from datetime import date, timedelta


# 鶴来線 通常ダイヤの停留所別所要分パターン (中間時刻推定用)
# outbound: JAIST → 鶴来駅 (8 stops)
TSURUGI_OUTBOUND_STOPS = ["JAIST", "ハイテクセンター前", "宮竹ヘルスロード", "灯台笹", "岩本", "本鶴来", "鶴来本町", "鶴来駅"]
TSURUGI_OUTBOUND_OFFSETS = [0, 1, 3, 4, 5, 8, 10, 13]
# inbound: 鶴来駅 → JAIST (8 stops)
TSURUGI_INBOUND_STOPS = ["鶴来駅", "鶴来本町", "本鶴来", "岩本", "灯台笹", "宮竹ヘルスロード", "ハイテクセンター前", "JAIST"]
TSURUGI_INBOUND_OFFSETS = [0, 2, 3, 6, 7, 8, 10, 13]


# ----- 共通ユーティリティ -----

def _normalize_time(s):
    """'8:42' のような時刻文字列を正規化。'-' '空欄' なら None。"""
    if not s:
        return None
    s = str(s).strip()
    if not s or s == '-':
        return None
    m = re.match(r'(\d{1,2}):(\d{2})', s)
    if not m:
        return None
    return f"{int(m.group(1))}:{m.group(2)}"


def _t2m(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def _m2t(x):
    return f"{x // 60}:{x % 60:02d}"


# 全角→半角数字
_ZEN2HAN = str.maketrans('０１２３４５６７８９', '0123456789')

_MONTH_NAMES = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
    'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
    'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
}


def _han(s):
    """全角数字を半角に。"""
    return (s or '').translate(_ZEN2HAN)


def _month_name_to_num(name):
    return _MONTH_NAMES.get((name or '').strip().lower())


def _compress_dates(dates):
    """date のリストを連続区間ごとに [{'from','until'}, ...] へまとめる (飛び日対応)。"""
    if not dates:
        return []
    ds = sorted(set(dates))
    ranges = []
    start = prev = ds[0]
    for d in ds[1:]:
        if d == prev + timedelta(days=1):
            prev = d
        else:
            ranges.append((start, prev))
            start = prev = d
    ranges.append((start, prev))
    return [{'from': a.isoformat(), 'until': b.isoformat()} for a, b in ranges]


def _parse_header_period(text):
    """「2026年8月8日から8月16日までの期間は」→ (year, (from_month, from_day), (until_month, until_day))。

    見つからなければ None。年・月の文脈を得るために使う。
    """
    t = _han(text)
    m = re.search(
        r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*から\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日',
        t,
    )
    if not m:
        return None
    y, sm, sd, em, ed = (int(g) for g in m.groups())
    return y, (sm, sd), (em, ed)


def _apply_periods_from_daily_table(text):
    """日別運行表 (「N日 … 特別ダイヤ運行」) を1行ずつ読み、特別ダイヤ該当日だけを集約する。

    これが最も堅牢。☆サマリ行の区切り記号 (、 . , ～ から) の揺れに依存せず、
    通常運行・土日祝ダイヤの日は自動的に除外されるため飛び日も正しく反映される。
    """
    hdr = _parse_header_period(text)
    if not hdr:
        return []
    year, (start_month, _sd), (_em, _ed) = hdr
    cur_month = start_month
    prev_day = None
    special_dates = []
    for raw in text.splitlines():
        line = _han(raw)
        # 行頭が「(N月) N日」で始まる日別行だけを対象にする (☆行やヘッダ行は弾く)
        m = re.match(r'\s*(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日', line)
        if not m:
            continue
        day = int(m.group(2))
        if m.group(1):
            cur_month = int(m.group(1))
        elif prev_day is not None and day < prev_day:
            # 月をまたいだ (日が前の行より小さくなった) → 翌月へ繰り上げ
            cur_month = cur_month % 12 + 1
        prev_day = day
        # 「特 別 ダ イ ヤ 運 行」のような字間スペースを潰して判定
        despaced = re.sub(r'\s', '', raw)
        if '特別ダイヤ' in despaced:
            try:
                special_dates.append(date(year, cur_month, day))
            except ValueError:
                pass  # 不正な日付は無視
    return _compress_dates(special_dates)


def _expand_day_list(chunk, year, month):
    """'8,9,11～15' / '8.9.11~15' / '2から6' のような日リストを date 群に展開する。"""
    dates = []
    for tok in re.split(r'[,\.、\s]+', chunk.strip()):
        if not tok:
            continue
        rng = re.match(r'^(\d{1,2})\s*(?:[~～\-–]|から)\s*(\d{1,2})$', tok)
        if rng:
            a, b = int(rng.group(1)), int(rng.group(2))
            for d in range(a, b + 1):
                try:
                    dates.append(date(year, month, d))
                except ValueError:
                    pass
        elif re.match(r'^\d{1,2}$', tok):
            try:
                dates.append(date(year, month, int(tok)))
            except ValueError:
                pass
    return dates


def _apply_periods_from_summary(text):
    """☆サマリの英語行「Aug 8,9,11～15,2026」「May 2～6,2026」から適用日を抽出する (フォールバック)。"""
    t = _han(text)
    m = re.search(r'([A-Za-z]{3,9})\.?\s+([\d,\.、~～\-–\s]+?)\s*,?\s*(\d{4})\b', t)
    if m and _month_name_to_num(m.group(1)):
        month = _month_name_to_num(m.group(1))
        year = int(m.group(3))
        dates = _expand_day_list(m.group(2), year, month)
        if dates:
            return _compress_dates(dates)
    return []


def _apply_periods_from_header(text):
    """ヘッダの「YYYY年M月D日からM月D日まで」全期間を1区間として返す (最も粗いフォールバック)。"""
    hdr = _parse_header_period(text)
    if not hdr:
        return []
    year, (sm, sd), (em, ed) = hdr
    try:
        return [{
            'from': date(year, sm, sd).isoformat(),
            'until': date(year, em, ed).isoformat(),
        }]
    except ValueError:
        return []


def _extract_apply_periods(text):
    """本文から特別ダイヤの適用日を抽出し apply_periods を返す。

    優先順位 (堅牢な方から):
      1) 日別運行表の「特別ダイヤ運行」行を集約 (飛び日を正確に反映)
      2) ☆サマリの英語行 (Aug 8,9,11～15,2026 等) のリスト・レンジ表記
      3) ヘッダの全期間レンジ (粗い最終手段)

    Returns: list of {'from': 'YYYY-MM-DD', 'until': 'YYYY-MM-DD'}
    """
    for extractor in (
        _apply_periods_from_daily_table,
        _apply_periods_from_summary,
        _apply_periods_from_header,
    ):
        periods = extractor(text)
        if periods:
            return periods
    return []


def _segment_key_prefix(segment_id):
    """schedule_key の接頭辞。区間ごとにキーを分けるために使う。

    'shuttle_komatsu' → 'komatsu' / 'shuttle_tsurugi' → 'tsurugi'。
    """
    if segment_id and segment_id.startswith('shuttle_'):
        return segment_id[len('shuttle_'):]
    return segment_id or ''


def _guess_schedule_identity(segment_id, apply_periods):
    """区間と適用期間から schedule_key / label_ja / label_en の初期値を推定する。

    schedule_key は区間ごとに異なるよう接頭辞を付ける
    (例: komatsu_summer_2026 / tsurugi_summer_2026)。月から季節を推定。
    管理画面フォームの下書きとして使うだけで、ユーザーがそのまま編集できる。
    """
    if not apply_periods:
        return {}
    first = apply_periods[0]['from']  # 'YYYY-MM-DD'
    year = int(first[:4])
    month = int(first[5:7])
    if month in (7, 8, 9):
        season, label_ja, label_en = 'summer', '夏季特別ダイヤ', 'Summer Special'
    elif month in (12, 1):
        season, label_ja, label_en = 'year_end', '年末年始特別ダイヤ', 'Year-end / New-year Special'
    elif month in (4, 5):
        season, label_ja, label_en = 'gw', 'GW特別ダイヤ', 'Golden Week Special'
    else:
        season, label_ja, label_en = 'special', '特別ダイヤ', 'Special Schedule'
    prefix = _segment_key_prefix(segment_id)
    schedule_key = f'{prefix}_{season}_{year}' if prefix else f'{season}_{year}'
    return {'schedule_key': schedule_key, 'label_ja': label_ja, 'label_en': label_en}


# ----- 鶴来線特別ダイヤ -----

def _parse_tsurugi_special(pdf_path):
    """鶴来線特別ダイヤPDF (別紙1形式) を解析。

    Returns: (apply_periods, [outbound_trips, inbound_trips])
      outbound_trips/inbound_trips: list of trip times (8要素ずつ、推定込み)
    """
    apply_periods = []
    outbound_trips = []
    inbound_trips = []

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ''
        apply_periods = _extract_apply_periods(text)

        tables = page.extract_tables()
        if not tables:
            raise ValueError('no tables found in tsurugi special PDF')

        # 一番大きいテーブルを採用（サマリー表ではなく時刻表）
        tbl = max(tables, key=lambda t: len(t) * (len(t[0]) if t else 0))
        # 構造: 行=便、列=10列の停留所/方向
        # 列の意味:
        #   0: 野町駅(石川線上り)
        #   1: 新西金沢駅(石川線上り)
        #   2: 鶴来駅(石川線上り)
        #   3: 鶴来駅発(シャトルinbound)
        #   4: JAIST着(シャトルinbound)
        #   5: JAIST発(シャトルoutbound)
        #   6: 鶴来駅着(シャトルoutbound)
        #   7: 鶴来駅(石川線下り)
        #   8: 新西金沢駅(石川線下り)
        #   9: 野町駅(石川線下り)
        # ヘッダ行をスキップして時刻データだけ取る
        for row in tbl:
            if not row:
                continue
            cells = [(_normalize_time(c) if c else None) for c in row]
            # 時刻が4つ以上含まれていれば時刻データ行とみなす
            time_count = sum(1 for c in cells if c)
            if time_count < 4:
                continue
            # シャトル inbound: cells[3] (鶴来駅発), cells[4] (JAIST着)
            inb_dep = cells[3] if len(cells) > 3 else None
            inb_arr = cells[4] if len(cells) > 4 else None
            # シャトル outbound: cells[5] (JAIST発), cells[6] (鶴来駅着)
            out_dep = cells[5] if len(cells) > 5 else None
            out_arr = cells[6] if len(cells) > 6 else None

            if out_dep and out_arr:
                trip = _expand_with_offsets(out_dep, TSURUGI_OUTBOUND_OFFSETS)
                outbound_trips.append(trip)
            if inb_dep and inb_arr:
                trip = _expand_with_offsets(inb_dep, TSURUGI_INBOUND_OFFSETS)
                inbound_trips.append(trip)

    return apply_periods, outbound_trips, inbound_trips


def _expand_with_offsets(start_time, offsets):
    """先頭時刻 + 所要分パターン → 各停留所の時刻リスト"""
    base = _t2m(start_time)
    return [_m2t(base + off) for off in offsets]


# ----- 小松線特別ダイヤ -----

def _parse_komatsu_special(pdf_path):
    """小松線特別ダイヤPDF (別紙2形式) を解析。

    Returns: (apply_periods, outbound_trips, inbound_trips)
      outbound_trips/inbound_trips: list of [dep_time, arr_time] (2要素ずつ)
    """
    apply_periods = []
    outbound_trips = []
    inbound_trips = []

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ''
        apply_periods = _extract_apply_periods(text)

        tables = page.extract_tables()
        if not tables:
            raise ValueError('no tables found in komatsu special PDF')

        tbl = max(tables, key=lambda t: len(t) * (len(t[0]) if t else 0))
        # 構造:
        #   col0: 便番号 ('１便' 等), col1: 大学発, col2: 小松駅着, col3: 小松駅発, col4: 大学着
        for row in tbl:
            if not row or len(row) < 5:
                continue
            cells = [_normalize_time(c) for c in row]
            out_dep = cells[1]
            out_arr = cells[2]
            inb_dep = cells[3]
            inb_arr = cells[4]
            if out_dep and out_arr:
                outbound_trips.append([out_dep, out_arr])
            if inb_dep and inb_arr:
                inbound_trips.append([inb_dep, inb_arr])

    return apply_periods, outbound_trips, inbound_trips


# ----- 公開API -----

def parse_special(pdf_path, segment_id):
    """特別ダイヤPDFをパースして共通形式の dict を返す。

    Args:
      pdf_path: PDFファイルパス
      segment_id: 'shuttle_tsurugi' | 'shuttle_komatsu'

    Returns: parser_adapter._build_result と同じ形式
    """
    derived_fields = []  # PDFから取れず推定で埋めたフィールドの記録

    if segment_id == 'shuttle_tsurugi':
        apply_periods, out_trips, in_trips = _parse_tsurugi_special(pdf_path)
        routes = [
            {
                "id": "tsurugi_outbound",
                "name": "JAISTシャトル 鶴来線（大学 → 鶴来駅）",
                "short_name": "鶴来線 下り",
                "color": "#4CAF50",
                "stops": list(TSURUGI_OUTBOUND_STOPS),
                "schedules": {"default": out_trips},
            },
            {
                "id": "tsurugi_inbound",
                "name": "JAISTシャトル 鶴来線（鶴来駅 → 大学）",
                "short_name": "鶴来線 上り",
                "color": "#2196F3",
                "stops": list(TSURUGI_INBOUND_STOPS),
                "schedules": {"default": in_trips},
            },
        ]
        # 鶴来線特別ダイヤPDFには中間停留所(JAIST と 鶴来駅 の間の6駅)の時刻が
        # 載っていないため、通常ダイヤの所要分パターンで推定している
        derived_fields.append({
            'field': 'routes[*].schedules.default[*][1..6]',
            'description': '中間停留所（ハイテクセンター前/宮竹ヘルスロード/灯台笹/岩本/本鶴来/鶴来本町）の時刻',
            'reason': 'PDFにはJAIST発と鶴来駅着の時刻のみ記載。通常ダイヤの所要分パターン (out: +0,+1,+3,+4,+5,+8,+10,+13 / in: +0,+2,+3,+6,+7,+8,+10,+13 分) で推定',
        })
    elif segment_id == 'shuttle_komatsu':
        apply_periods, out_trips, in_trips = _parse_komatsu_special(pdf_path)
        routes = [
            {
                "id": "komatsu_outbound",
                "name": "JAISTシャトル 小松線（大学 → 小松駅）",
                "short_name": "小松線 下り",
                "color": "#FF9800",
                "stops": ["JAIST", "小松駅"],
                "schedules": {"default": out_trips},
            },
            {
                "id": "komatsu_inbound",
                "name": "JAISTシャトル 小松線（小松駅 → 大学）",
                "short_name": "小松線 上り",
                "color": "#E91E63",
                "stops": ["小松駅", "JAIST"],
                "schedules": {"default": in_trips},
            },
        ]
        # 小松線は始終点のみなので推定なし
    else:
        raise ValueError(f'special parser does not support segment: {segment_id}')

    if not apply_periods:
        valid_from = None
        valid_until = None
    else:
        valid_from = apply_periods[0]['from']
        valid_until = apply_periods[-1]['until']

    meta = {
        'valid_from': valid_from,
        'valid_until': valid_until,
        'apply_periods': apply_periods,
        'operator': 'JAISTシャトルバス',
        'note': '特別ダイヤ運行表（GW・連休等）',
    }
    # schedule_key / label_ja / label_en は管理画面フォームの下書きとして推定値を入れておく
    # (ユーザーがそのまま編集可能)。区間＋季節から区間ごとに異なるキーを付ける。
    meta.update(_guess_schedule_identity(segment_id, apply_periods))
    if derived_fields:
        meta['derived_fields'] = derived_fields

    return {
        'segment': segment_id,
        'kind': 'special',
        'meta': meta,
        'routes': routes,
    }
