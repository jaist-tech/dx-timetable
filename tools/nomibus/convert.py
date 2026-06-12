#!/usr/bin/env python3
"""中間JSON → public/data/regular/nomi_*.json に変換する。

各中間JSONは1テーブル分。これをルート単位（segment）にまとめて
既存フォーマット（ishikawa_line等と同じ構造）に変換する。

ファイル名: nomi_<segment>_<valid_from>_null.json
  valid_from は中間JSONの revision_date から自動取得する。
  全ページに revision_date がなければ FALLBACK_VALID_FROM を使う。

既存ファイルとの差分比較:
  内容が同じ場合は上書きしない（routes/schedules のみ比較、meta は除外）。
  内容が変わった場合は新しいファイル名で書き出す（古いファイルは残す）。
"""
import json
import os
import glob

INTERMEDIATE_DIR = os.path.join(os.path.dirname(__file__), "intermediate")
OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "public", "data", "regular"
)

# ADDED_AT / FALLBACK_VALID_FROM は run.py から上書きされる。直接実行時は固定値を使う。
ADDED_AT = "2026-06-07T00:00:00+09:00"
FALLBACK_VALID_FROM = "2026-03-14"

# 中間JSONのルート名+方向 → セグメントID・ルートID・表示名のマッピング
# day_type="all" は weekday/weekend 両方に同じスケジュールを入れる
ROUTE_MAP = [
    # (source_pages, segment_id, operator_note, routes_def)
    # routes_def: list of {id, name, direction_label, day_col}
    #   direction_label: 中間JSONのdirection_labelと一致させてテーブルを特定
    #   day_col: "weekday"|"weekend"|"all"（allは両方に同じデータを入れる）

    {
        "segment": "nomi_renkei_kitamawari",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "連携ルート（朝夕・北廻り）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1221"],
        "routes": [
            {"id": "nomi_kitamawari_to_jaist",   "name": "のみバス 連携（朝夕・北廻り）能美根上駅→先端大学",
             "direction_label": "先端大学方面",  "day": "all"},
            {"id": "nomi_kitamawari_from_jaist",  "name": "のみバス 連携（朝夕・北廻り）先端大学→能美根上駅",
             "direction_label": "能美根上駅方面", "day": "all"},
        ],
    },
    {
        "segment": "nomi_renkei_minamimawari",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "連携ルート（朝夕・南廻り）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1222", "1223"],
        "routes": [
            {"id": "nomi_minamimawari_to_jaist",   "name": "のみバス 連携（朝夕・南廻り）能美根上駅→先端大学",
             "direction_label": "先端大学方面",  "day": "weekday_weekend"},
            {"id": "nomi_minamimawari_from_jaist", "name": "のみバス 連携（朝夕・南廻り）先端大学→能美根上駅",
             "direction_label": "能美根上駅方面", "day": "weekday_weekend"},
        ],
    },
    {
        "segment": "nomi_renkei_nichu",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "連携ルート（日中）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1229"],
        "routes": [
            {"id": "nomi_nichu_to_jaist",   "name": "のみバス 連携（日中）能美根上駅→先端大学",
             "direction_label": "先端大学方面",  "day": "all"},
            {"id": "nomi_nichu_from_jaist", "name": "のみバス 連携（日中）先端大学→能美根上駅",
             "direction_label": "能美根上駅方面", "day": "all"},
        ],
    },
    {
        "segment": "nomi_renkei_teraiko",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "連携ルート（朝・寺井高校）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1226", "1227"],
        "routes": [
            {"id": "nomi_teraiko_to_school",   "name": "のみバス 連携（朝・寺井高校）能美根上駅→寺井中央",
             "direction_label": "寺井中央方面",  "day": "weekday_weekend"},
            {"id": "nomi_teraiko_from_school", "name": "のみバス 連携（朝・寺井高校）寺井中央→能美根上駅",
             "direction_label": "能美根上駅方面", "day": "weekday_weekend"},
        ],
    },
    {
        "segment": "nomi_kanko_matsui",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "観光ルート（松井ミュージアム行）。土日祝のみ運行。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1219"],
        "routes": [
            {"id": "nomi_matsui",   "name": "のみバス 観光ルート（松井ミュージアム行）",
             "direction_label": "", "day": "weekend_only", "caption_contains": "松井ミュージアム"},
        ],
    },
    {
        "segment": "nomi_kanko_tojimura",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "観光ルート（陶芸村・辰口温泉行）。土日祝のみ運行。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1219"],
        "routes": [
            {"id": "nomi_tojimura", "name": "のみバス 観光ルート（陶芸村・辰口温泉行）",
             "direction_label": "", "day": "weekend_only", "caption_contains": "陶芸村"},
        ],
    },
    {
        "segment": "nomi_junkan_negami",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（根上地区）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1231", "1232"],
        "routes": [
            {"id": "nomi_negami",   "name": "のみバス 循環ルート（根上地区）",
             "direction_label": "", "day": "weekday_weekend"},
        ],
    },
    {
        "segment": "nomi_junkan_terai",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（寺井地区）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1234", "1235"],
        "routes": [
            {"id": "nomi_terai",   "name": "のみバス 循環ルート（寺井地区）",
             "direction_label": "", "day": "weekday_weekend"},
        ],
    },
    {
        "segment": "nomi_junkan_iwamoto",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（岩本方面）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1237", "1238"],
        "routes": [
            {"id": "nomi_iwamoto",   "name": "のみバス 循環ルート（岩本方面）",
             "direction_label": "", "day": "weekday_weekend",
             "stop_code_prefix": "IW"},
        ],
    },
    {
        "segment": "nomi_junkan_takaza",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（高座方面）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1237", "1238"],
        "routes": [
            {"id": "nomi_takaza",   "name": "のみバス 循環ルート（高座方面）",
             "direction_label": "", "day": "weekday_weekend",
             "stop_code_prefix": "KO"},
        ],
    },
    {
        "segment": "nomi_junkan_nagaya",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（鍋谷方面）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1240", "1241"],
        "routes": [
            {"id": "nomi_nagaya",   "name": "のみバス 循環ルート（鍋谷方面）",
             "direction_label": "鍋谷方面", "day": "weekday_weekend"},
        ],
    },
    {
        "segment": "nomi_junkan_tsubono",
        "operator": "能美市コミュニティバス（のみバス）",
        "note": "循環ルート（坪野方面）。2026-03-14ダイヤ改正。運賃100円。",
        "source_pages": ["1240", "1241"],
        "routes": [
            {"id": "nomi_tsubono",   "name": "のみバス 循環ルート（坪野方面）",
             "direction_label": "坪野方面", "day": "weekday_weekend"},
        ],
    },
]


def load_intermediate(source_pages, direction_label, stop_code_prefix=None, caption_contains=None):
    """指定ページ群・方向ラベル・(系統コードプレフィックス)に一致する中間JSONを返す。
    戻り値: { day_type: parsed_dict, ... }
      各 parsed_dict に revision_date キーがある場合がある。
    """
    results = {}  # day_type -> parsed dict
    for pid in source_pages:
        pattern = os.path.join(INTERMEDIATE_DIR, f"{pid}__*.json")
        for fp in sorted(glob.glob(pattern)):
            d = json.load(open(fp))
            if d["direction_label"] != direction_label:
                continue
            if stop_code_prefix:
                if not any(c.startswith(stop_code_prefix) for c in d.get("stop_codes", [])):
                    continue
            if caption_contains and caption_contains not in d.get("caption", ""):
                continue
            results[d["day_type"]] = d
    return results


def pick_valid_from(data_by_day):
    """中間JSONから revision_date を取得する。複数ある場合は最新を使う。"""
    dates = [d["revision_date"] for d in data_by_day.values() if d.get("revision_date")]
    return max(dates) if dates else None


def routes_equal(existing_path, new_routes):
    """既存ファイルの routes と new_routes を比較。同じなら True。
    meta（valid_from / added_at 等）は比較しない。"""
    if not os.path.exists(existing_path):
        return False
    try:
        old = json.load(open(existing_path, encoding="utf-8"))
        return old.get("routes") == new_routes
    except Exception:
        return False


def build_schedules(day_spec, data_by_day):
    """day_spec に従い schedules{weekday, weekend} を組み立てる。
    day_spec:
      "all"              → weekday/weekend ともに同じデータ（"all"キーを使用）
      "weekday_weekend"  → それぞれ別ページから取得
      "weekday_only"     → weekday のみ（weekendはweekdayと同じにフォールバック）
      "weekend_only"     → weekend のみ
    """
    def trips_to_schedules(d):
        """trips（便×バス停）を schedules（バス停×便）に転置する。
        既存フォーマット: schedules[day] = [ [stop0_trip0, stop0_trip1,...], [stop1_trip0,...] ]
        ただし既存実装では schedules[day] = [ trip0_times_array, trip1_times_array ]（便ごとの配列）
        → ishikawa_line.json を再確認して合わせる
        実際のフォーマットは trips[便idx] = [stops...] なのでそのまま使う"""
        return d["trips"]

    schedules = {}
    if day_spec == "all":
        src = data_by_day.get("all")
        if src:
            schedules["weekday"] = trips_to_schedules(src)
            schedules["weekend"] = trips_to_schedules(src)
    elif day_spec == "weekday_weekend":
        wd = data_by_day.get("weekday")
        we = data_by_day.get("weekend")
        schedules["weekday"] = trips_to_schedules(wd) if wd else []
        schedules["weekend"] = trips_to_schedules(we) if we else []
    elif day_spec == "weekday_only":
        wd = data_by_day.get("weekday")
        if wd:
            schedules["weekday"] = trips_to_schedules(wd)
            schedules["weekend"] = trips_to_schedules(wd)
    elif day_spec == "weekend_only":
        we = data_by_day.get("weekend")
        if we:
            schedules["weekend"] = trips_to_schedules(we)
            # weekdayは空（土日祝のみ運行）
            schedules["weekday"] = []
    return schedules


def get_stops(data_by_day, direction_label):
    """stops配列を取得。全日データ優先、なければweekday、なければweekend。"""
    for key in ("all", "weekday", "weekend"):
        if key in data_by_day:
            return data_by_day[key]["stops"]
    return []


def convert():
    """中間JSONを読んで nomi_*.json を生成する。

    戻り値: list of (fname, n_routes, status)
      status: "written" | "unchanged" | "skipped"
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []

    for seg_def in ROUTE_MAP:
        segment = seg_def["segment"]
        routes_out = []
        revision_dates = []

        for r in seg_def["routes"]:
            prefix = r.get("stop_code_prefix")
            cap_contains = r.get("caption_contains")
            data_by_day = load_intermediate(seg_def["source_pages"], r["direction_label"], prefix, cap_contains)
            if not data_by_day:
                print(f"  WARNING: データなし: segment={segment}, dir={r['direction_label']}")
                continue

            rd = pick_valid_from(data_by_day)
            if rd:
                revision_dates.append(rd)

            stops = get_stops(data_by_day, r["direction_label"])
            schedules = build_schedules(r["day"], data_by_day)

            routes_out.append({
                "id": r["id"],
                "name": r["name"],
                "stops": stops,
                "schedules": schedules,
            })

        if not routes_out:
            # データなし = 廃止路線の可能性。既存ファイルは触らず、呼び出し側に判断させる。
            print(f"  SKIP (no data): {segment}")
            results.append((None, 0, "skipped", segment))
            continue

        # valid_from: 中間JSONの最新 revision_date。なければ FALLBACK_VALID_FROM。
        valid_from = max(revision_dates) if revision_dates else FALLBACK_VALID_FROM

        # 既存ファイルと routes が同じか確認（valid_from ごとのファイル名で検索）
        seg_short = segment.replace("nomi_", "")
        existing_files = sorted(glob.glob(os.path.join(OUTPUT_DIR, f"nomi_{seg_short}_*_null.json")))

        # 最新の既存ファイルと内容比較
        newest_existing = existing_files[-1] if existing_files else None
        if newest_existing and routes_equal(newest_existing, routes_out):
            fname = os.path.basename(newest_existing)
            print(f"  変更なし: {fname}")
            results.append((fname, len(routes_out), "unchanged", segment))
            continue

        fname = f"nomi_{seg_short}_{valid_from}_null.json"
        fpath = os.path.join(OUTPUT_DIR, fname)
        out = {
            "meta": {
                "valid_from": valid_from,
                "valid_until": None,
                "operator": seg_def["operator"],
                "note": seg_def["note"],
                "added_at": ADDED_AT,
            },
            "routes": routes_out,
        }
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        status = "new_version" if newest_existing else "written"
        print(f"  書き出し: {fname} ({len(routes_out)} routes){' [新バージョン]' if status == 'new_version' else ''}")
        results.append((fname, len(routes_out), status, segment))

    written = [r for r in results if r[2] in ("written", "new_version")]
    unchanged = [r for r in results if r[2] == "unchanged"]
    skipped = [r for r in results if r[2] == "skipped"]
    print(f"\n完了: 書き出し {len(written)} / 変更なし {len(unchanged)} / スキップ {len(skipped)} セグメント")
    return results


if __name__ == "__main__":
    convert()
