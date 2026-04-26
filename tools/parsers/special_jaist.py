"""JAIST シャトルバス 特別ダイヤ用パーサー

対応フォーマット:
- GW_fix/5月連休鶴来線特別ダイヤ（別紙１） (1).pdf
- GW_fix/5月連休小松線特別ダイヤ（別紙２）.pdf

これらのPDFと同じ構造の特別ダイヤPDF専用。
"""

import re
import pdfplumber
import pandas as pd
from datetime import date


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


def _extract_apply_periods(text):
    """本文から「☆５月２日から６日の…」「May 2～6,2026」などを探して apply_periods を返す。

    Returns: list of {'from': 'YYYY-MM-DD', 'until': 'YYYY-MM-DD'}
    """
    # 1) 英語表記が確実: "May 2～6,2026" or "May 2~6,2026" or "May 2-6,2026"
    m = re.search(r'(\w+)\s+(\d{1,2})\s*[~～\-–]\s*(\d{1,2})\s*,?\s*(\d{4})', text)
    if m:
        month_name, d_from, d_until, year = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
        month = _month_name_to_num(month_name)
        if month:
            return [{
                'from': f"{year}-{month:02d}-{d_from:02d}",
                'until': f"{year}-{month:02d}-{d_until:02d}",
            }]

    # 2) 日本語の「☆Ｎ月Ｄ日から/～Ｄ日の…」
    text_han = text.translate(_ZEN2HAN)
    m = re.search(r'(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:から|~|～|-|–)\s*(\d{1,2})\s*日', text_han)
    if m:
        month, d_from, d_until = int(m.group(1)), int(m.group(2)), int(m.group(3))
        # 年は本文から探す
        y_match = re.search(r'(\d{4})\s*年', text_han)
        year = int(y_match.group(1)) if y_match else date.today().year
        return [{
            'from': f"{year}-{month:02d}-{d_from:02d}",
            'until': f"{year}-{month:02d}-{d_until:02d}",
        }]

    return []


def _month_name_to_num(name):
    table = {
        'Jan': 1, 'January': 1, 'Feb': 2, 'February': 2, 'Mar': 3, 'March': 3,
        'Apr': 4, 'April': 4, 'May': 5, 'Jun': 6, 'June': 6,
        'Jul': 7, 'July': 7, 'Aug': 8, 'August': 8, 'Sep': 9, 'September': 9,
        'Oct': 10, 'October': 10, 'Nov': 11, 'November': 11, 'Dec': 12, 'December': 12,
    }
    return table.get(name)


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
    if derived_fields:
        meta['derived_fields'] = derived_fields

    return {
        'segment': segment_id,
        'kind': 'special',
        'meta': meta,
        'routes': routes,
    }
