#!/usr/bin/env python3
"""route.html の地図の線の形 public/data/route/shapes.json を作る．

停留所の隣り合う組（時刻表の順）ごとに，実際の道・線路に沿った折れ線を持つ．
  バス: OSRM（OpenStreetMap の道で車の経路を求める公開サーバー）の 2 点間の経路（tools/route/osrm_cache/ に保存．check_lines.py と共通）
  鉄道: OSM（Overpass API．ODbL）の railway=rail の線路を辺とするグラフで，両端の駅の最寄りの点の間の最短経路（tools/route/osm_rail_cache/ に保存）
道に結べない組は入れない（地図側は直線にする）．出力: {"version":1,"legs":{"bus|A|B":[[lat,lon]...],"train|A|B":[...]}}（A→B の向きのみ．逆向きは地図側で反転）
停留所の名前は stops.json の名前（路線別の別名を適用した後）．
"""
import json, math, os, sys, time, heapq, urllib.request, urllib.parse, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_lines import dist, osrm, routes, norm, PUB
RAILCACHE = f'{HERE}/osm_rail_cache'
MIRRORS = ['https://z.overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter']
TILES = ['36.25,136.25,36.75,136.70', '36.58,136.62,36.72,136.80']   # 大聖寺〜倶利伽羅・石川線を含む範囲

def fetch_rail(refresh=False):
    os.makedirs(RAILCACHE, exist_ok=True)
    ways = {}
    for t in TILES:
        q = f'[out:json][timeout:180];way[railway=rail][!service]({t});out geom;'
        p = f'{RAILCACHE}/{hashlib.md5(q.encode()).hexdigest()[:12]}.json'
        if os.path.exists(p) and not refresh:
            d = json.load(open(p))
        else:
            d = None
            for attempt in range(8):
                for m in MIRRORS:
                    try:
                        req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode(),
                                                     headers={'User-Agent': 'dx-timetable-shapes/1.0 (s2510070@jaist.ac.jp)', 'Accept': 'application/json'})
                        d = json.load(urllib.request.urlopen(req, timeout=200)); break
                    except Exception as e:
                        print('Overpass', m, e, file=sys.stderr)
                if d: break
                time.sleep(20)
            if not d: raise SystemExit('Overpass 取得失敗')
            json.dump(d, open(p, 'w'))
        for w in d['elements']:
            ways[w['id']] = [(g['lat'], g['lon']) for g in w['geometry']]
    return list(ways.values())

def rail_graph(ways):
    adj, pos = {}, {}
    for g in ways:
        ids = [(round(a, 6), round(b, 6)) for a, b in g]
        for a, b in zip(ids, ids[1:]):
            if a == b: continue
            d = dist(a, b)
            adj.setdefault(a, []).append((b, d)); adj.setdefault(b, []).append((a, d))
    # 複線は上り・下りが別の線として入り，渡り線が無い所で別の連結成分になる．12 m 以内の別の線の点どうしを（余分な距離を足して）つなぐ
    grid = {}
    for n in adj: grid.setdefault((int(n[0] * 3000), int(n[1] * 3000)), []).append(n)
    for (gx, gy), lst in grid.items():
        for dx in (0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy < 0: continue
                for a in lst:
                    for b in grid.get((gx + dx, gy + dy), []):
                        if a < b or dx or dy:
                            if a != b and dist(a, b) <= 12 and all(v != b for v, _ in adj[a]):
                                adj[a].append((b, dist(a, b) + 60)); adj[b].append((a, dist(a, b) + 60))
    return adj

def rail_path(adj, nodes, a, b, snap=150):
    def nearest(p):
        best, bd = None, snap
        for n in nodes:
            if abs(n[0] - p[0]) > 0.003 or abs(n[1] - p[1]) > 0.004: continue
            d = dist(n, p)
            if d < bd: best, bd = n, d
        return best
    s, t = nearest(a), nearest(b)
    if not s or not t: return None
    D, prev, h = {s: 0}, {}, [(0, s)]
    while h:
        d, u = heapq.heappop(h)
        if u == t: break
        if d > D[u]: continue
        for v, w in adj[u]:
            if d + w < D.get(v, 1e18):
                D[v] = d + w; prev[v] = u; heapq.heappush(h, (d + w, v))
    if t not in D: return None
    path = [t]
    while path[-1] != s: path.append(prev[path[-1]])
    return [a] + path[::-1] + [b], D[t]

def simplify(pts, tol=4):
    """Douglas-Peucker（tol は m）"""
    if len(pts) < 3: return pts
    k = math.cos(pts[0][0] * math.pi / 180)
    xy = [((p[1]) * k * 111320, p[0] * 110574) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    while st:
        i, j = st.pop()
        ax, ay = xy[i]; bx, by = xy[j]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        md, mi = -1, -1
        for m in range(i + 1, j):
            d = abs((xy[m][0] - ax) * dy - (xy[m][1] - ay) * dx) / L
            if d > md: md, mi = d, m
        if md > tol: keep[mi] = True; st += [(i, mi), (mi, j)]
    return [p for p, k_ in zip(pts, keep) if k_]

def main():
    stops = {k: (v['lat'], v['lon']) for k, v in json.load(open(f'{PUB}/route/stops.json'))['stops'].items() if 'lat' in v}
    aliases = json.load(open(f'{PUB}/routes.json')).get('place_aliases', {})
    adj = rail_graph(fetch_rail('--refresh' in sys.argv)); nodes = list(adj)
    legs, miss, ratios = {}, [], []
    for rid, r in routes().items():
        kind = 'train' if rid.startswith(('ir_', 'ishikawa_')) else 'bus'
        al = next((v for k, v in aliases.items() if rid.startswith(k.split('_')[0] + '_')), {})
        names = [n for n in (al.get(n, n) for n in norm(r['stops'])) if n in stops]   # 座標のある停留所だけ（地図側も同じ）
        for a, b in zip(names, names[1:]):
            key = f'{kind}|{a}|{b}'
            if key in legs or a == b or (kind == 'train' and f'{kind}|{b}|{a}' in legs): continue   # 鉄道は往復で同じ線路（地図側で反転）
            if kind == 'train':
                rp = rail_path(adj, nodes, stops[a], stops[b])
                if not rp: miss.append(key); continue
                pts, d = rp
            elif rid.startswith('komatsu_'):
                # JAIST↔小松駅のシャトルは OSM に路線が無く，OSRM（最短の道）とは別の道を通る既存の経路（geo/jaist_komatsu.geojson）を使う（実際の経路は未確認．docs/route-planner.md）
                g = [(c[1], c[0]) for c in next(x for x in json.load(open(f'{PUB}/geo/jaist_komatsu.geojson'))['features'] if x['geometry']['type'] == 'LineString')['geometry']['coordinates']]
                if dist(g[0], stops[a]) > dist(g[-1], stops[a]): g = g[::-1]
                pts, d = [stops[a]] + g + [stops[b]], 0
            else:
                d, pts = osrm([stops[a], stops[b]])
                if d is None: miss.append(key); continue
            ratios.append((key, d / max(dist(stops[a], stops[b]), 1)))   # komatsu は d=0（比に入らない）
            legs[key] = [[round(p[0], 5), round(p[1], 5)] for p in simplify(pts)]
    json.dump({'version': 1, 'note': 'bus=OSRM（OSM の道），train=OSM の線路．A→B の向き', 'legs': legs}, open(f'{PUB}/route/shapes.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('区間', len(legs), '結べず', len(miss), miss[:20])
    for k, v in sorted(ratios, key=lambda x: -x[1])[:15]: print('  遠回り', k, round(v, 2))

if __name__ == '__main__':
    main()
