#!/usr/bin/env python3
"""のみバス公式ページ（tools/nomibus/cache）の地図マーカーから停留所の座標を抜き出し，
tools/route/official_coords.json に書く．マーカーは "name":"○○バス停","loc":[経度,緯度]．"""
import re, glob, json, os
HERE = os.path.dirname(__file__)
res = {}
for f in sorted(glob.glob(f'{HERE}/../nomibus/cache/*.html')):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\{"name":"([^"]+)","loc":\[([\d.]+),([\d.]+)\]', s):
        n = re.sub(r'(バス停|停留所)$', '', m[1]).strip()
        res.setdefault(n, []).append({'lat': float(m[3]), 'lon': float(m[2]), 'page': os.path.basename(f)})
json.dump(res, open(f'{HERE}/official_coords.json', 'w'), ensure_ascii=False, indent=1)
print(len(res), 'stops')
