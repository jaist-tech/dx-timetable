"""管理者ツール用パーサーアダプタ

各区間のパーサー（tools/parsers/*.py）を統一APIで呼び出す。
サーバから一時ファイルパス + segment ID を渡すと、共通形式の dict を返す。

戻り値 (dict):
  {
    'segment': str,                # 'shuttle_komatsu' 等
    'kind': 'regular' | 'special',
    'meta': {
      'valid_from': str|None,
      'valid_until': str|None,
      'operator': str|None,
      'note': str|None,
    },
    'routes': [...],               # 既存パーサーの出力そのまま
  }
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PARSERS_DIR = os.path.join(PROJECT_ROOT, 'tools', 'parsers')

# Make parsers/ importable
if PARSERS_DIR not in sys.path:
    sys.path.insert(0, PARSERS_DIR)


# Filename heuristics: keyword -> segment id
# 優先順位順に並べる（先に小松空港バスをチェック → "komatsu" 一般語より具体的）
SEGMENT_KEYWORDS = [
    (r'空港|airport|limo', 'limo_komatsu'),
    (r'IR(?:い|イ)?しかわ|ir[-_ ]?ishikawa|IR_ishikawa|IRいしかわ', 'ir_ishikawa'),
    (r'石川線|ishikawa[-_ ]?line|ishikawa-line|hokutetsu', 'ishikawa_line'),
    (r'鶴来|tsurugi|turugi', 'shuttle_tsurugi'),
    (r'小松線|shuttle[-_ ]?komatsu|komatsu', 'shuttle_komatsu'),
]

# Special schedule keywords
SPECIAL_KEYWORDS = [
    r'特別', r'臨時', r'GW', r'ＧＷ', r'お盆', r'年末年始', r'夏休み', r'冬休み',
    r'夏季', r'冬季', r'夏', r'盆',
    r'special', r'holiday', r'summer', r'winter',
]


def guess_segment_from_filename(filename):
    """ファイル名から区間を推定。該当なしなら None。"""
    for pat, seg in SEGMENT_KEYWORDS:
        if re.search(pat, filename, re.IGNORECASE):
            return seg
    return None


def guess_kind_from_filename(filename):
    """ファイル名から regular/special を推定。"""
    for pat in SPECIAL_KEYWORDS:
        if re.search(pat, filename, re.IGNORECASE):
            return 'special'
    return 'regular'


def parse_pdf(pdf_path, segment_id, kind='regular'):
    """指定区間の既存パーサーを呼んで共通形式に整形して返す。

    Args:
      pdf_path: PDFファイルの絶対パス
      segment_id: 'shuttle_komatsu' 等
      kind: 'regular' | 'special'

    Returns: dict
    """
    if kind == 'special':
        # 特別ダイヤは shuttle_tsurugi / shuttle_komatsu のみ対応 (special_jaist.py)。
        # 他の区間を要求された場合は special_jaist.parse_special が ValueError を投げる。
        if segment_id not in ('shuttle_tsurugi', 'shuttle_komatsu'):
            raise NotImplementedError(
                f"特別ダイヤは JAIST シャトル (shuttle_tsurugi / shuttle_komatsu) のみ対応です。"
                f" 区間 {segment_id!r} の特別ダイヤは未対応。"
            )
        from special_jaist import parse_special  # type: ignore
        return parse_special(pdf_path, segment_id)

    if segment_id == 'shuttle_komatsu':
        import shuttle_komatsu
        valid_from, valid_until, routes = shuttle_komatsu.extract_komatsu_data(pdf_path)
        return _build_result(
            segment='shuttle_komatsu', kind='regular',
            valid_from=valid_from, valid_until=valid_until,
            routes=routes,
            operator='JAISTシャトルバス',
            note='時刻が空欄の箇所は、通過または停車設定なしです。',
        )

    if segment_id == 'shuttle_tsurugi':
        import shuttle_tsurugi
        valid_from, valid_until, routes = shuttle_tsurugi.extract_tsurugi_data(pdf_path)
        return _build_result(
            segment='shuttle_tsurugi', kind='regular',
            valid_from=valid_from, valid_until=valid_until,
            routes=routes,
            operator='JAISTシャトルバス',
            note='時刻が空欄の箇所は、通過または停車設定なしです。',
        )

    if segment_id == 'ir_ishikawa':
        import ir_ishikawa
        valid_from, routes = ir_ishikawa.extract_ir_ishikawa(pdf_path)
        return _build_result(
            segment='ir_ishikawa', kind='regular',
            valid_from=valid_from, valid_until=None,
            routes=routes,
            operator='IRいしかわ鉄道',
            note='時刻が空欄の箇所は、通過または停車設定なしです。',
        )

    if segment_id == 'ishikawa_line':
        # 2PDF必要なため単発アップロードでは不可
        raise NotImplementedError(
            "石川線は平日PDF＋休日PDFの2ファイルが必要です。現状の管理者ツールは"
            "1PDFアップロード方式のみのため対応していません。コマンドラインから"
            "tools/run_all.py 経由で生成してください。"
        )

    if segment_id == 'limo_komatsu':
        import limo_komatsu
        return _parse_limo_komatsu(pdf_path)

    raise ValueError(f"unknown segment: {segment_id}")


def _parse_limo_komatsu(pdf_path):
    """小松空港連絡バスのパース。

    既存の limo_komatsu.py は generate() に処理が一体化しているため、
    本関数で必要部分だけ抽出する。
    """
    import re
    import pdfplumber
    import pandas as pd
    import limo_komatsu

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ''
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

    to_airport_trips = limo_komatsu.extract_to_airport(df0)
    to_airport_schedule = [trip["times"] for trip in to_airport_trips]

    from_airport_trips = limo_komatsu.extract_from_airport(df1, text)
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
            "stops": limo_komatsu.STOPS_TO_AIRPORT,
            "schedules": {
                "weekday": to_airport_schedule,
                "weekend": to_airport_schedule,
            },
        },
        {
            "id": "limo_komatsu_from_airport",
            "name": "小松空港連絡バス（小松空港 → 小松駅）",
            "short_name": "空港バス 空港発",
            "color": "#9C27B0",
            "stops": limo_komatsu.STOPS_FROM_AIRPORT,
            "schedules": {
                "weekday": from_airport_schedule,
                "weekend": from_airport_schedule,
            },
        },
    ]

    return _build_result(
        segment='limo_komatsu', kind='regular',
        valid_from=valid_from, valid_until=valid_until,
        routes=routes,
        operator='北陸鉄道',
        note='時刻が空欄の箇所は、通過または停車設定なしです。',
    )


def _build_result(segment, kind, valid_from, valid_until, routes, operator=None, note=None):
    def fmt_date(d):
        if d is None:
            return None
        if hasattr(d, 'isoformat'):
            return d.isoformat()
        return str(d)
    return {
        'segment': segment,
        'kind': kind,
        'meta': {
            'valid_from': fmt_date(valid_from),
            'valid_until': fmt_date(valid_until),
            'operator': operator,
            'note': note,
        },
        'routes': routes,
    }
