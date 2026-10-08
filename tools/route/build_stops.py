#!/usr/bin/env python3
"""停留所の座標表 public/data/route/stops.json を作る．

入力: public/data/geo/*.geojson（既存の駅・停留所の点），tools/route/official_coords.json と
      tools/route/osm_busstops_snapshot.json（OpenStreetMap の bus_stop．Overpass で取得，ODbL）．
優先順: 既存 geojson > のみバス公式ページの座標 > OSM．名前が一致し，候補が 200 m 以内にまとまるもの（向かい合う 2 本は平均）だけ採用する．離れた複数候補・不一致は座標なしにし，
unconfirmed に挙げる（人の確認が要る）．
"""
import glob, json, re, collections, os, datetime, math
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
norm = lambda s: re.sub(r'\(折り返し\)', '', s).strip()

names = set()
for f in glob.glob(f'{ROOT}/public/data/regular/*.json'):
    for r in json.load(open(f))['routes']:
        names |= {norm(s) for s in r['stops']}

stops = {}
for f in glob.glob(f'{ROOT}/public/data/geo/*.geojson'):
    for ft in json.load(open(f))['features']:
        if ft['geometry']['type'] != 'Point': continue
        n = ft['properties'].get('name')
        lon, lat = ft['geometry']['coordinates'][:2]
        if n in names and n not in stops:
            stops[n] = {'lat': round(lat, 6), 'lon': round(lon, 6), 'source': 'geojson'}

HERE = os.path.dirname(__file__)
dist = lambda a, b: math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 90000)  # m（この緯度の近似）
centroid = lambda c: (sum(x[0] for x in c) / len(c), sum(x[1] for x in c) / len(c))
close = lambda c: max(dist(a, b) for a in c for b in c) <= 200  # 上り下りの向かい合う 2 本は同じ停留所とみなす

# のみバス公式ページの地図マーカー（extract_official_coords.py が作る）
official = json.load(open(f'{HERE}/official_coords.json'))
for n in sorted(names):
    if n in stops or n not in official: continue
    c = [(x['lat'], x['lon']) for x in official[n]]
    if close(c):
        lat, lon = centroid(c)
        stops[n] = {'lat': round(lat, 6), 'lon': round(lon, 6), 'source': 'official:' + official[n][0]['page']}

# OSM．名前は「(のみバス)」「（のみバス）」と英語表記の括弧を除いて比べる
osm_norm = lambda s: re.sub(r'[(（]のみバス[)）]|[(（][^)）]*[A-Za-z][^)）]*[)）]', '', s).strip()
osm = collections.defaultdict(dict)
for e in json.load(open(f'{HERE}/osm_busstops_snapshot.json'))['elements']:
    t = e.get('tags', {})
    for k in ('name', 'name:ja'):
        if t.get(k): osm[osm_norm(t[k])][e['id']] = (e['lat'], e['lon'])
for n in sorted(names):
    if n in stops: continue
    c = osm.get(n, {})
    if c and close(list(c.values())):
        lat, lon = centroid(list(c.values()))
        stops[n] = {'lat': round(lat, 6), 'lon': round(lon, 6), 'source': 'osm:node/' + '+'.join(str(i) for i in sorted(c))}

unconfirmed = sorted(n for n in names if n not in stops)
# 同じ場所への徒歩の乗換（routes.json の transfers のほか，ここで足すもの）．確認が済んだものだけ入れる
links = []
out = {'version': 1, 'updated': datetime.date.today().isoformat(),
       'note': 'source=geojson は既存の経路データ，official はのみバス公式ページの地図の座標，osm は OpenStreetMap（ODbL）の bus_stop．unconfirmed は座標なし',
       'stops': dict(sorted(stops.items())), 'links': links, 'unconfirmed': unconfirmed,
       'ambiguous_osm': sorted(n for n in names if len(osm.get(n, {})) > 1 and not close(list(osm[n].values())))}
json.dump(out, open(f'{ROOT}/public/data/route/stops.json', 'w'), ensure_ascii=False, indent=1)
print(len(names), 'places;', len(stops), 'with coords;', len(unconfirmed), 'unconfirmed')
