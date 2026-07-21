"""管理者ツールの整合性チェック + commit 処理"""

import os
import re
import json
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUBLIC_DATA = os.path.join(PROJECT_ROOT, 'public', 'data')
JST = timezone(timedelta(hours=9))

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^\d{1,2}:\d{2}$')
KEY_RE = re.compile(r'^[a-z0-9_]+$')

# カテゴリ定義
CAT_BASIC = '基本情報'
CAT_PERIOD = '期間'
CAT_META = 'メタデータ'
CAT_DATA = '時刻表データ'
CAT_DUP = '重複チェック'

# 特別ダイヤを追加できる区間（JAISTシャトルのみ）
SPECIAL_SUPPORTED_SEGMENTS = ('shuttle_tsurugi', 'shuttle_komatsu')


# ---------- check ----------

def check_payload(payload, manifest):
    """payload が valid な追加候補かをチェックする。

    payload: { segment, kind, meta, routes }
    Returns: {
      'errors':   [{'category','msg','hint'}, ...],
      'warnings': [{'category','msg','hint'}, ...],
      'passes':   [{'category','msg'}, ...],
      'overlaps': [...],
    }
    """
    errors = []
    warnings = []
    passes = []
    overlaps = []

    segment = payload.get('segment')
    kind = payload.get('kind')
    meta = payload.get('meta') or {}
    routes = payload.get('routes') or []

    def add_pass(cat, msg):
        passes.append({'category': cat, 'msg': msg})

    def add_err(cat, msg, hint=''):
        errors.append({'category': cat, 'msg': msg, 'hint': hint})

    def add_warn(cat, msg, hint=''):
        warnings.append({'category': cat, 'msg': msg, 'hint': hint})

    # ===== 基本情報 =====
    if not segment:
        add_err(CAT_BASIC, '区間 (segment) が指定されていません',
                '区間ドロップダウンから選択してください')
    else:
        add_pass(CAT_BASIC, f'区間: {segment}')

    if kind not in ('regular', 'special'):
        add_err(CAT_BASIC, f'種別 (kind) が不正: {kind!r}',
                '種別は通常 (regular) または 特別 (special) を選んでください')
    else:
        kind_jp = '通常ダイヤ (regular)' if kind == 'regular' else '特別ダイヤ (special)'
        add_pass(CAT_BASIC, f'種別: {kind_jp}')

    # 特別ダイヤは JAIST シャトルのみ対応
    if kind == 'special' and segment and segment not in SPECIAL_SUPPORTED_SEGMENTS:
        add_err(CAT_BASIC,
                f'特別ダイヤは {segment} に対応していません',
                'JAIST シャトル (shuttle_tsurugi または shuttle_komatsu) のみ特別ダイヤを追加できます')

    # ===== 期間 (regular) =====
    if kind == 'regular':
        vf = meta.get('valid_from')
        vu = meta.get('valid_until')
        if not vf:
            add_err(CAT_PERIOD, '開始日 (valid_from) が空です',
                    'YYYY-MM-DD 形式で入力してください (例: 2026-04-01)')
        elif not DATE_RE.match(vf):
            add_err(CAT_PERIOD, f'開始日 (valid_from) の形式が不正: {vf!r}',
                    'YYYY-MM-DD 形式で入力してください (例: 2026-04-01)')
        else:
            add_pass(CAT_PERIOD, f'開始日: {vf} (形式OK)')

        if vu is None or vu == '':
            add_pass(CAT_PERIOD, '終了日: なし (=次の改正まで継続)')
        elif not DATE_RE.match(vu):
            add_err(CAT_PERIOD, f'終了日 (valid_until) の形式が不正: {vu!r}',
                    'YYYY-MM-DD 形式で入力するか、空欄 (=終了未定) にしてください')
        elif vf and DATE_RE.match(vf) and vu < vf:
            add_err(CAT_PERIOD, f'終了日 ({vu}) が開始日 ({vf}) より前になっています',
                    '日付の順序を確認してください')
        else:
            add_pass(CAT_PERIOD, f'終了日: {vu} (開始日以降)')

    # ===== 期間 (special) =====
    if kind == 'special':
        ap = meta.get('apply_periods') or []
        if not ap:
            add_err(CAT_PERIOD, '適用期間 (apply_periods) が空です',
                    '少なくとも1つの期間を「+ 期間を追加」で入れてください')
        else:
            ap_ok = True
            for i, p in enumerate(ap):
                pf = p.get('from')
                pu = p.get('until')
                if not pf or not DATE_RE.match(pf):
                    add_err(CAT_PERIOD, f'適用期間[{i}].from の形式が不正: {pf!r}',
                            'YYYY-MM-DD 形式で入力してください')
                    ap_ok = False
                    continue
                if not pu or not DATE_RE.match(pu):
                    add_err(CAT_PERIOD, f'適用期間[{i}].until の形式が不正: {pu!r}',
                            'YYYY-MM-DD 形式で入力してください')
                    ap_ok = False
                    continue
                if pu < pf:
                    add_err(CAT_PERIOD, f'適用期間[{i}]: until ({pu}) が from ({pf}) より前',
                            '日付の順序を確認してください')
                    ap_ok = False
                else:
                    add_pass(CAT_PERIOD, f'適用期間[{i}]: {pf} 〜 {pu} (形式OK)')
            if ap_ok and len(ap) > 1:
                add_pass(CAT_PERIOD, f'適用期間: {len(ap)}個の期間 (飛び飛び対応)')

        df = meta.get('display_from')
        du = meta.get('display_until')
        if df:
            if not DATE_RE.match(df):
                add_err(CAT_PERIOD, f'表示開始日 (display_from) の形式が不正: {df!r}',
                        'YYYY-MM-DD 形式で入力するか、空欄 (=apply_periodsの最初と同じ) にしてください')
            else:
                add_pass(CAT_PERIOD, f'表示開始日: {df} (タブ表示開始)')
        else:
            add_pass(CAT_PERIOD, '表示開始日: 空欄 (=適用期間の開始日と同じ)')
        if du:
            if not DATE_RE.match(du):
                add_err(CAT_PERIOD, f'表示終了日 (display_until) の形式が不正: {du!r}',
                        'YYYY-MM-DD 形式で入力するか、空欄 (=apply_periodsの最後と同じ) にしてください')
            else:
                add_pass(CAT_PERIOD, f'表示終了日: {du} (タブ消去)')
        else:
            add_pass(CAT_PERIOD, '表示終了日: 空欄 (=適用期間の終了日と同じ)')

    # ===== メタデータ (special専用) =====
    if kind == 'special':
        sk = meta.get('schedule_key')
        if not sk:
            add_err(CAT_META, '識別キー (schedule_key) が空です',
                    '英小文字・数字・アンダースコアで識別キーを入力してください (例: gw_2026)')
        elif not KEY_RE.match(sk):
            add_err(CAT_META, f'識別キー (schedule_key) は英小文字・数字・アンダースコアのみ: {sk!r}',
                    '例: gw_2026, summer_2026, year_end_2026')
        else:
            add_pass(CAT_META, f'識別キー: {sk} (形式OK)')

        lj = meta.get('label_ja')
        if not lj:
            add_err(CAT_META, '日本語ラベル (label_ja) が空です',
                    'タブに表示する日本語ラベルを入力してください (例: GW特別ダイヤ)')
        else:
            add_pass(CAT_META, f'日本語ラベル: {lj}')

        if meta.get('label_en'):
            add_pass(CAT_META, f'英語ラベル: {meta["label_en"]}')
        else:
            add_pass(CAT_META, '英語ラベル: 空欄 (=英語表示時はschedule_keyにフォールバック)')

    # ===== 時刻表データ =====
    if not routes:
        add_err(CAT_DATA, 'routes が空です',
                'PDFのパースが失敗している可能性があります。区間や種別を再確認してください')
    else:
        add_pass(CAT_DATA, f'ルート数: {len(routes)}')
        for ri, route in enumerate(routes):
            rid = route.get('id') or f'(route#{ri})'
            stops = route.get('stops') or []
            schedules = route.get('schedules') or {}
            if not stops:
                add_err(CAT_DATA, f'{rid}: stops が空です',
                        'PDFから停留所が抽出できていません。パーサーまたはPDFを確認してください')
            else:
                add_pass(CAT_DATA, f'{rid}: 停留所 {len(stops)}駅')
            for day_key, trips in schedules.items():
                if not isinstance(trips, list):
                    add_err(CAT_DATA, f'{rid}.schedules.{day_key}: 配列ではありません',
                            'パーサーの出力形式を確認してください')
                    continue
                bad_count = 0
                bad_reason = None
                for ti, trip in enumerate(trips):
                    if not isinstance(trip, list):
                        bad_count += 1
                        bad_reason = '便がリスト型でない'
                        continue
                    if len(trip) != len(stops):
                        bad_count += 1
                        bad_reason = f'便の長さ ({len(trip)}) が停留所数 ({len(stops)}) と不一致'
                        continue
                    for cell in trip:
                        if cell is None or cell == '':
                            continue
                        if not TIME_RE.match(str(cell)):
                            bad_count += 1
                            bad_reason = f'時刻形式が不正: {cell!r}'
                            break
                if bad_count > 0:
                    add_err(CAT_DATA,
                            f'{rid}.schedules.{day_key}: {bad_count}件の不正な便 ({bad_reason})',
                            '時刻は H:MM 形式、各便の長さは停留所数と一致が必要')
                else:
                    add_pass(CAT_DATA, f'{rid}.schedules.{day_key}: {len(trips)}便 (形式OK)')

    # ===== 重複チェック =====
    if segment and kind in ('regular', 'special'):
        existing = (manifest.get(kind, {}) or {}).get(segment, [])
        candidate_periods = _payload_periods(payload)
        for entry in existing:
            entry_periods = _entry_periods(entry, kind)
            for cp in candidate_periods:
                for ep in entry_periods:
                    if _periods_overlap(cp, ep):
                        overlaps.append({
                            'with': entry.get('file', '(fallback_to entry)'),
                            'candidate': cp,
                            'existing': ep,
                        })
        if overlaps:
            for o in overlaps:
                base_msg = f"既存ファイル {o['with']} と期間が重複: 新={_fmt_period(o['candidate'])} 既={_fmt_period(o['existing'])}"
                if kind == 'special':
                    add_err(CAT_DUP, base_msg,
                            '特別ダイヤは同区間内で期間が重ならないようにしてください。'
                            '既存ファイルを削除するか、新ダイヤの期間を調整してください')
                else:
                    add_warn(CAT_DUP, base_msg,
                             'ローダーは適用日に応じて自動で1つ選びます (期限切れフォールバック)。'
                             '意図しない重複なら既存ファイル または 新ダイヤの期間を見直してください')
        else:
            add_pass(CAT_DUP, '同区間内で期間重複なし')

        # schedule_key は同一区間内で一意でなければならない (special のみ)。
        # フロントは schedules[schedule_key] に時刻表を格納するため (public/js/app.js
        # buildSegments)、同区間で重複すると後勝ちで一方が上書きされ、期間が重ならなくても
        # 時刻が壊れる。期間の重なりチェックとは別に必要。
        if kind == 'special':
            sk = meta.get('schedule_key')
            reserved = {'weekday', 'weekend', 'default'}
            if sk and KEY_RE.match(sk):
                if sk in reserved:
                    add_err(CAT_META,
                            f'識別キー (schedule_key) に予約語は使えません: {sk!r}',
                            '通常ダイヤ用のキー (weekday / weekend / default) と衝突します。別のキーにしてください')
                dup_files = [e.get('file', '(fallback_to entry)') for e in existing
                             if e.get('schedule_key') == sk]
                if dup_files:
                    add_err(CAT_DUP,
                            f'識別キー {sk!r} が同区間の既存ダイヤと重複: {", ".join(dup_files)}',
                            '同じ区間内では schedule_key を一意にしてください '
                            '(区間をまたぐ重複は可)。重複すると一方の時刻表が上書きされます')
                else:
                    add_pass(CAT_DUP, f'識別キー {sk!r}: 同区間内で重複なし')

    return {
        'errors': errors,
        'warnings': warnings,
        'passes': passes,
        'overlaps': overlaps,
    }


def _fmt_period(period_tuple):
    f, u = period_tuple
    return f"{f}〜{u or '(終了未定)'}"


def _payload_periods(payload):
    """候補ペイロードから [(from, until), ...] を抽出"""
    kind = payload.get('kind')
    meta = payload.get('meta') or {}
    if kind == 'regular':
        vf = meta.get('valid_from')
        vu = meta.get('valid_until')
        return [(vf, vu)] if vf else []
    if kind == 'special':
        return [(p.get('from'), p.get('until')) for p in (meta.get('apply_periods') or [])]
    return []


def _entry_periods(entry, kind):
    if kind == 'regular':
        return [(entry.get('valid_from'), entry.get('valid_until'))]
    if kind == 'special':
        return [(p.get('from'), p.get('until')) for p in entry.get('apply_periods', [])]
    return []


def _periods_overlap(p1, p2):
    f1, u1 = p1
    f2, u2 = p2
    if not f1 or not f2:
        return False
    end1 = u1 or '9999-12-31'
    end2 = u2 or '9999-12-31'
    return f1 <= end2 and f2 <= end1


# ---------- commit ----------

def commit_payload(payload, manifest):
    segment = payload['segment']
    kind = payload['kind']
    meta = dict(payload.get('meta') or {})
    routes = payload.get('routes') or []

    now_iso = datetime.now(JST).isoformat(timespec='seconds')
    meta['added_at'] = now_iso

    if kind == 'regular':
        from_str = meta.get('valid_from')
        until_str = meta.get('valid_until') if meta.get('valid_until') else 'null'
    else:
        ap = meta.get('apply_periods') or []
        from_str = ap[0]['from']
        until_str = ap[-1]['until']
    fname = f"{segment}_{from_str}_{until_str}.json"

    sub_dir = 'regular' if kind == 'regular' else 'special'
    out_dir = os.path.join(PUBLIC_DATA, sub_dir)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, fname)

    if os.path.exists(out_path):
        raise FileExistsError(f'同名ファイルが既に存在: {sub_dir}/{fname}')

    doc = {
        'meta': meta,
        'routes': routes,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')

    manifest_path = os.path.join(PUBLIC_DATA, 'manifest.json')
    if 'regular' not in manifest:
        manifest['regular'] = {}
    if 'special' not in manifest:
        manifest['special'] = {}

    entry = _build_manifest_entry(kind, fname, meta)
    manifest[kind].setdefault(segment, []).append(entry)

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')

    return {
        'data_file': os.path.relpath(out_path, PROJECT_ROOT),
        'manifest_file': os.path.relpath(manifest_path, PROJECT_ROOT),
    }


# ---------- delete ----------

def delete_entry(kind, file):
    """ファイル + manifest エントリを削除する。
    実体ファイルが無い (ゴースト) でも manifest からは除去する。

    Returns: { 'file_removed': bool, 'manifest_removed': bool }
    """
    out_path = os.path.join(PUBLIC_DATA, kind, file)
    file_removed = False
    if os.path.exists(out_path):
        os.remove(out_path)
        file_removed = True

    # manifest 更新
    manifest_path = os.path.join(PUBLIC_DATA, 'manifest.json')
    with open(manifest_path) as f:
        manifest = json.load(f)
    manifest_removed = False
    if kind in manifest:
        for segment, entries in list(manifest[kind].items()):
            new_entries = [e for e in entries if e.get('file') != file]
            if len(new_entries) != len(entries):
                manifest_removed = True
                if new_entries:
                    manifest[kind][segment] = new_entries
                else:
                    del manifest[kind][segment]
    if manifest_removed:
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write('\n')

    return {
        'file_removed': file_removed,
        'manifest_removed': manifest_removed,
    }


# ---------- update ----------

# 編集可なメタデータフィールド（regular/special共通 + 種別ごと）
EDITABLE_META_COMMON = {'operator', 'note', 'label_ja', 'label_en'}
EDITABLE_META_REGULAR = {'valid_from', 'valid_until'}
EDITABLE_META_SPECIAL = {'apply_periods', 'display_from', 'display_until'}


def update_entry(kind, file, meta_updates):
    """既存ファイルのメタデータを部分更新する (上書き)。
    routes / schedule_key / segment / added_at は変更不可。
    updated_at が現在時刻で自動付与される。
    必要に応じてファイル名と manifest エントリも更新する。

    Returns: { 'data_file': ..., 'manifest_file': ..., 'renamed_from': ... }
    """
    if kind not in ('regular', 'special'):
        raise ValueError(f'invalid kind: {kind}')

    src_path = os.path.join(PUBLIC_DATA, kind, file)
    if not os.path.exists(src_path):
        raise FileNotFoundError(f'{kind}/{file}')

    with open(src_path, encoding='utf-8') as f:
        doc = json.load(f)
    meta = dict(doc.get('meta') or {})

    # 編集不可フィールドが指定されていたら拒否
    forbidden = {'schedule_key', 'segment', 'added_at', 'updated_at',
                 'routes', 'schedules', 'derived_fields'}
    bad = forbidden & set(meta_updates.keys())
    if bad:
        raise ValueError(f'これらのフィールドは編集できません: {sorted(bad)}')

    # 種別に許可されたフィールドのみ受け付ける
    allowed = EDITABLE_META_COMMON | (EDITABLE_META_REGULAR if kind == 'regular' else EDITABLE_META_SPECIAL)
    for k in meta_updates:
        if k not in allowed:
            raise ValueError(f'種別 {kind} で編集できないフィールド: {k}')

    # 上書き
    for k, v in meta_updates.items():
        # 空文字列は None として扱う (任意フィールドのクリア)
        if v == '':
            v = None
        meta[k] = v

    meta['updated_at'] = datetime.now(JST).isoformat(timespec='seconds')

    # 期間が変わったらファイル名も合わせる
    if kind == 'regular':
        from_str = meta.get('valid_from')
        until_str = meta.get('valid_until') if meta.get('valid_until') else 'null'
    else:
        ap = meta.get('apply_periods') or []
        if not ap:
            raise ValueError('apply_periods が空です')
        from_str = ap[0]['from']
        until_str = ap[-1]['until']

    # segment はファイル名から取れないので manifest から逆引き
    manifest_path = os.path.join(PUBLIC_DATA, 'manifest.json')
    with open(manifest_path) as f:
        manifest = json.load(f)
    segment = None
    for seg, entries in (manifest.get(kind) or {}).items():
        for e in entries:
            if e.get('file') == file:
                segment = seg
                break
        if segment:
            break
    if not segment:
        raise ValueError(f'manifest に {kind}/{file} のエントリが見つかりません')

    new_fname = f"{segment}_{from_str}_{until_str}.json"
    dst_path = os.path.join(PUBLIC_DATA, kind, new_fname)

    # 別ファイルにリネームする場合、衝突チェック
    renamed_from = None
    if new_fname != file:
        if os.path.exists(dst_path):
            raise FileExistsError(f'リネーム先ファイルが既に存在: {kind}/{new_fname}')
        renamed_from = file

    # 整合性チェック (新ペイロードを構築して check_payload に通す)
    # 重複検査では「現在のエントリ自身」を除外したい
    payload = {
        'segment': segment,
        'kind': kind,
        'meta': meta,
        'routes': doc.get('routes') or [],
    }
    # manifest から自分のエントリを一時的に除外してチェック
    manifest_for_check = json.loads(json.dumps(manifest))  # deep copy
    if kind in manifest_for_check and segment in manifest_for_check[kind]:
        manifest_for_check[kind][segment] = [
            e for e in manifest_for_check[kind][segment] if e.get('file') != file
        ]
    results = check_payload(payload, manifest_for_check)
    if results['errors']:
        raise ValueError('整合性チェック失敗: ' + '; '.join(e['msg'] for e in results['errors']))

    # 保存
    doc['meta'] = meta
    if renamed_from:
        os.remove(src_path)
    with open(dst_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')

    # manifest 更新
    new_entry = _build_manifest_entry(kind, new_fname, meta)
    for seg_key, entries in (manifest.get(kind) or {}).items():
        if seg_key != segment:
            continue
        for i, e in enumerate(entries):
            if e.get('file') == file:
                entries[i] = new_entry
                break
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')

    return {
        'data_file': os.path.relpath(dst_path, PROJECT_ROOT),
        'manifest_file': os.path.relpath(manifest_path, PROJECT_ROOT),
        'renamed_from': renamed_from,
    }


def _build_manifest_entry(kind, fname, meta):
    """manifest 用のエントリ dict を meta から作る (commit と update で共有)"""
    if kind == 'regular':
        return {
            'file': fname,
            'valid_from': meta.get('valid_from'),
            'valid_until': meta.get('valid_until'),
        }
    entry = {
        'file': fname,
        'apply_periods': meta.get('apply_periods'),
        'schedule_key': meta.get('schedule_key'),
        'label_ja': meta.get('label_ja'),
    }
    if meta.get('label_en'):
        entry['label_en'] = meta.get('label_en')
    if meta.get('display_from'):
        entry['display_from'] = meta.get('display_from')
    if meta.get('display_until'):
        entry['display_until'] = meta.get('display_until')
    return entry
