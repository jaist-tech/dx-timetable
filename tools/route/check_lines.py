#!/usr/bin/env python3
"""地図の線の点検．路線ごとに，停留所を時刻表の順に結んだ線が実際の道・線路の形からどれだけ外れるかを測る．

route.html の地図は停留所の座標を直線で結ぶ（journey-map.js）．ここでは，その直線の長さと，OSRM（OpenStreetMap の道で車の経路を求める公開サーバー）の
道のりを区間ごとに比べ，道のりが直線の 1.5 倍を超える区間（直線では実際の道とかけ離れる）や，座標の無い停留所を挙げる．
出力: 標準出力に表，--json で結果を保存．OSRM の応答は tools/route/osrm_cache/（git 管理外）に保存する．
"""
import json, math, os, sys, time, glob, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
PUB = f'{HERE}/../../public/data'
CACHE = f'{HERE}/osrm_cache'

def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))

def osrm(coords):
    """coords: [(lat,lon)...] → (道のり m, [(lat,lon)...])．応答はキャッシュする"""
    os.makedirs(CACHE, exist_ok=True)
    s = ';'.join(f'{lo:.6f},{la:.6f}' for la, lo in coords)
    key = __import__('hashlib').md5(s.encode()).hexdigest()[:16]
    p = f'{CACHE}/{key}.json'
    if os.path.exists(p):
        d = json.load(open(p))
    else:
        url = f'https://router.project-osrm.org/route/v1/driving/{s}?overview=full&geometries=geojson'
        req = urllib.request.Request(url, headers={'User-Agent': 'dx-timetable-linecheck/1.0 (s2510070@jaist.ac.jp)'})
        d = json.load(urllib.request.urlopen(req, timeout=60))
        json.dump(d, open(p, 'w')); time.sleep(1.2)
    if d.get('code') != 'Ok':
        return None, []
    r = d['routes'][0]
    return r['distance'], [(c[1], c[0]) for c in r['geometry']['coordinates']]

def routes():
    man = json.load(open(f'{PUB}/manifest.json'))
    out = {}
    for fam, lst in man['regular'].items():
        f = sorted(lst, key=lambda x: x['valid_from'])[-1]['file']
        for r in json.load(open(f'{PUB}/regular/{f}'))['routes']:
            out[r['id']] = r
    return out

def main():
    stops = {k: (v['lat'], v['lon']) for k, v in json.load(open(f'{PUB}/route/stops.json'))['stops'].items() if 'lat' in v}
    res = []
    aliases = json.load(open(f'{PUB}/routes.json')).get('place_aliases', {})   # 路線別の別名（野々市駅の IR と北鉄）
    for rid, r in routes().items():
        al = next((v for k, v in aliases.items() if rid.startswith(k.split('_')[0] + '_')), {})
        names = [al.get(n, n) for n in r['stops']]
        if rid.startswith(('ir_', 'ishikawa_')):
            kind = 'train'
        else:
            kind = 'bus'
        miss = [n for n in names if n not in stops]
        known = [n for n in names if n in stops]
        straight = sum(dist(stops[a], stops[b]) for a, b in zip(known, known[1:]))
        row = {'id': rid, 'kind': kind, 'n': len(names), 'missing': miss, 'straight_m': round(straight), 'legs': []}
        if kind == 'bus' and len(known) >= 2:
            # 区間ごとに OSRM（2 点ずつ）で道のりを測る
            for a, b in zip(known, known[1:]):
                d, _ = osrm([stops[a], stops[b]])
                s = dist(stops[a], stops[b])
                row['legs'].append({'a': a, 'b': b, 'straight': round(s), 'road': None if d is None else round(d)})
            row['road_m'] = round(sum(l['road'] or l['straight'] for l in row['legs']))
        res.append(row)
        print(rid, kind, 'n=%d 座標なし=%d 直線=%dm 道のり=%s' % (len(names), len(miss), straight, row.get('road_m')), flush=True)
    if '--json' in sys.argv:
        json.dump(res, open(sys.argv[sys.argv.index('--json') + 1], 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
