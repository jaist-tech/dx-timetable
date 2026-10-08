#!/usr/bin/env python3
"""データのバージョン public/data/route/version.json を作る．

planner.js は読み込み時にこの値を ?v= に付け，時刻表の更新後にブラウザが古い JSON を使い続けないようにする．
対象は経路探索が読む manifest・routes・holidays・fares・route/stops.json と，regular/・special/ の全ファイル．
"""
import glob, hashlib, json, os
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
D = os.path.join(ROOT, 'public', 'data')

files = [os.path.join(D, f) for f in ('manifest.json', 'routes.json', 'holidays.json', 'fares.json', 'route/stops.json')]
files += sorted(glob.glob(f'{D}/regular/*.json')) + sorted(glob.glob(f'{D}/special/*.json'))
h = hashlib.sha256()
for f in files:
    if not os.path.exists(f):
        continue
    h.update(os.path.relpath(f, D).encode())
    h.update(open(f, 'rb').read())
version = h.hexdigest()[:12]
out = os.path.join(D, 'route', 'version.json')
old = json.load(open(out)).get('version') if os.path.exists(out) else None
if old != version:
    json.dump({'version': version}, open(out, 'w'))
print('version', version, '(変更)' if old != version else '(変更なし)')
