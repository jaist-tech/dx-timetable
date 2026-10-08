#!/usr/bin/env python3
"""停留所の座標表 public/data/route/stops.json を作る．

入力: public/data/geo/*.geojson（既存の駅・停留所の点）と
      tools/route/osm_busstops_snapshot.json（OpenStreetMap の bus_stop．Overpass で取得，ODbL）．
名前が完全に一致し，OSM の候補が 1 つだけのものだけ採用する．複数候補・不一致は座標なしにし，
unconfirmed に挙げる（人の確認が要る）．
"""
import glob, json, re, collections, os, datetime
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

osm = collections.defaultdict(list)
for e in json.load(open(f'{os.path.dirname(__file__)}/osm_busstops_snapshot.json'))['elements']:
    n = e.get('tags', {}).get('name')
    if n: osm[n].append((e['lat'], e['lon'], e['id']))
for n in sorted(names):
    if n in stops: continue
    c = osm.get(n, [])
    if len(c) == 1:
        stops[n] = {'lat': round(c[0][0], 6), 'lon': round(c[0][1], 6), 'source': f'osm:node/{c[0][2]}'}

unconfirmed = sorted(n for n in names if n not in stops)
# 同じ場所への徒歩の乗換（routes.json の transfers のほか，ここで足すもの）．確認が済んだものだけ入れる
links = []
out = {'version': 1, 'updated': datetime.date.today().isoformat(),
       'note': 'source=geojson は既存の経路データ，osm は OpenStreetMap（ODbL）の bus_stop で名前が一意のもの．unconfirmed は座標なし',
       'stops': dict(sorted(stops.items())), 'links': links, 'unconfirmed': unconfirmed,
       'ambiguous_osm': sorted(n for n in names if len(osm.get(n, [])) > 1)}
json.dump(out, open(f'{ROOT}/public/data/route/stops.json', 'w'), ensure_ascii=False, indent=1)
print(len(names), 'places;', len(stops), 'with coords;', len(unconfirmed), 'unconfirmed')
