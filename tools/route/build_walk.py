#!/usr/bin/env python3
"""停留所の組ごとの徒歩の道のり public/data/route/walk.json を作る．

入力: public/data/route/stops.json の座標．OpenStreetMap（ODbL）の歩ける道を Overpass API で取得（tools/route/osm_walk_cache/ に保存．--refresh で再取得）．
方法: 直線 1300 m 以内の組を連結成分に分け，成分ごとの範囲の道路網（歩行者が通れる highway）を取得し，停留所を最寄りの道の点（60 m 以内）に結んで
      Dijkstra で道のり（m）を求める．道のりが 1500 m を超える組・道に結べない停留所は入れない（結べない停留所は unsnapped に挙げ，探索側が直線の近似を使う）．
出力: {"pairs": [{"a","b","m"(道のり m),"straight"(直線 m)}], "unsnapped": [...], "source": ...}（a<b の無向）．
"""
import json, math, os, sys, time, heapq, urllib.request, urllib.parse, hashlib
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')
CACHE = f'{HERE}/osm_walk_cache'
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
STRAIGHT_MAX, ROAD_MAX, SNAP_MAX = 1300, 1500, 60   # 画面の最大設定（徒歩 15 分・速い=分速 100 m）の道のり 1500 m に合わせる
WALKABLE = '^(footway|path|pedestrian|steps|living_street|residential|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|track|cycleway|road)$'

def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))

def fetch(bbox, refresh):
    q = f'[out:json][timeout:90];way[highway~"{WALKABLE}"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"]({bbox});out geom;'
    key = hashlib.md5(q.encode()).hexdigest()[:12]
    path = f'{CACHE}/{key}.json'
    if os.path.exists(path) and not refresh:
        return json.load(open(path))
    last = None
    for attempt in range(6):
        for m in MIRRORS:
            try:
                req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode(),
                                             headers={'User-Agent': 'dx-timetable-walk/1.0 (s2510070@jaist.ac.jp)', 'Accept': 'application/json'})
                d = json.load(urllib.request.urlopen(req, timeout=120))
                json.dump(d, open(path, 'w'))
                return d
            except Exception as e:
                last = e
        time.sleep(20 * (attempt + 1))
    raise SystemExit(f'Overpass 取得失敗: {last}')

def main():
    refresh = '--refresh' in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    stops = {k: (v['lat'], v['lon']) for k, v in json.load(open(f'{ROOT}/public/data/route/stops.json'))['stops'].items() if 'lat' in v}
    names = sorted(stops)
    par = {n: n for n in names}
    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    near = {n: [] for n in names}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if dist(stops[a], stops[b]) <= STRAIGHT_MAX:
                par[find(a)] = find(b); near[a].append(b); near[b].append(a)
    comps = {}
    for n in names:
        if near[n]: comps.setdefault(find(n), []).append(n)
    pairs, unsnapped = [], []
    for members in comps.values():
        # 範囲の広い成分は 1 回の取得が重いので，0.02×0.025 度の格子ごとに取得して道路を統合する（格子の縁は 0.012 度の余白で重ねる）
        tiles = {(math.floor(stops[n][0] / 0.02), math.floor(stops[n][1] / 0.025)) for n in members}
        ways = {}
        for (ty, tx) in sorted(tiles):
            bbox = f'{ty*0.02-0.012:.5f},{tx*0.025-0.012:.5f},{(ty+1)*0.02+0.012:.5f},{(tx+1)*0.025+0.012:.5f}'
            for w in fetch(bbox, refresh)['elements']:
                ways[w['id']] = w
        d = {'elements': list(ways.values())}
        nodes, adj = {}, {}
        def nid(p):
            return nodes.setdefault(p, len(nodes))
        for w in d['elements']:
            g = w.get('geometry') or []
            for p, q in zip(g, g[1:]):
                a = nid((p['lat'], p['lon'])); b = nid((q['lat'], q['lon']))
                l = dist((p['lat'], p['lon']), (q['lat'], q['lon']))
                adj.setdefault(a, []).append((b, l)); adj.setdefault(b, []).append((a, l))
        pts = list(nodes)
        snap = {}
        for n in members:
            best = min(range(len(pts)), key=lambda i: dist(stops[n], pts[i])) if pts else None
            if best is not None and dist(stops[n], pts[best]) <= SNAP_MAX:
                snap[n] = (best, dist(stops[n], pts[best]))
            else:
                unsnapped.append(n)
        for n in members:
            if n not in snap: continue
            s, sd = snap[n]
            D = {s: 0.0}; h = [(0.0, s)]
            while h:
                dd, u = heapq.heappop(h)
                if dd > D.get(u, 1e18) or dd > ROAD_MAX: continue
                for v, l in adj.get(u, []):
                    if dd + l < D.get(v, 1e18):
                        D[v] = dd + l; heapq.heappush(h, (dd + l, v))
            for o in near[n]:
                if o <= n or o not in snap: continue
                t, td = snap[o]
                if t in D:
                    m = D[t] + sd + td
                    if m <= ROAD_MAX:
                        pairs.append({'a': n, 'b': o, 'm': math.ceil(m), 'straight': round(dist(stops[n], stops[o]))})
    pairs.sort(key=lambda p: (p['a'], p['b']))
    out = {'version': 1, 'source': 'OpenStreetMap contributors (ODbL), Overpass API', 'speed_note': '分は planner が道のり÷歩く速さで求める',
           'pairs': pairs, 'unsnapped': sorted(set(unsnapped))}
    json.dump(out, open(f'{ROOT}/public/data/route/walk.json', 'w'), ensure_ascii=False, indent=1)
    print(len(pairs), 'pairs;', len(set(unsnapped)), 'unsnapped')
main()
