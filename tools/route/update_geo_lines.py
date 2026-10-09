#!/usr/bin/env python3
"""マップのタブが使う public/data/geo/*.geojson の線（LineString）を，実際の線路・道に沿った線に置き換える．Point（停留所）は変えない．

元の線は粗く，停留所から数百 m〜1.4 km 離れていた（IR 小松〜金沢・石川線・小松空港連絡バス）．shapes.json（build_shapes.py の出力）の区間をつなぐ．
置き換える対象: komatsu_kanazawa（IR 小松→金沢），tsurugi_shinnishikanazawa_nomachi（石川線 鶴来→野町），komatsu_airport（小松駅→小松空港）．
jaist_komatsu は実際の経路が未確認，jaist_tsurugi は OSM の路線と最大 72 m の差のため変えない．実行: python3 tools/route/update_geo_lines.py
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_lines import routes, norm, PUB
TARGETS = [('komatsu_kanazawa', 'ir_ishikawa_down_south', 'train', '小松駅', '金沢駅'),
           ('tsurugi_shinnishikanazawa_nomachi', 'ishikawa_upbound', 'train', '鶴来駅', '野町駅'),
           ('komatsu_airport', 'limo_komatsu_to_airport', 'bus', '小松駅', '小松空港')]

def main():
    legs = json.load(open(f'{PUB}/route/shapes.json'))['legs']
    stops = json.load(open(f'{PUB}/route/stops.json'))['stops']
    for f, rid, kind, a, b in TARGETS:
        al = {'野々市駅': '野々市駅（北鉄）'} if rid.startswith('ishikawa') else {}
        names = [n for n in (al.get(n, n) for n in norm(routes()[rid]['stops'])) if n in stops]
        names = names[names.index(a):names.index(b) + 1]
        pts = [[stops[names[0]]['lat'], stops[names[0]]['lon']]]
        for x, y in zip(names, names[1:]):
            seg = legs.get(f'{kind}|{x}|{y}') or (legs.get(f'{kind}|{y}|{x}') or [])[::-1]
            pts += seg[1:] if seg else [[stops[y]['lat'], stops[y]['lon']]]
        pts.append([stops[b]['lat'], stops[b]['lon']])   # 道に結べる最寄りの点が停留所から離れていても終点は停留所
        path = f'{PUB}/geo/{f}.geojson'
        g = json.load(open(path))
        for x in g['features']:
            if x['geometry']['type'] == 'LineString':
                x['geometry']['coordinates'] = [[round(p[1], 5), round(p[0], 5)] for p in pts]
        json.dump(g, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
        print(f, len(pts), '点')

if __name__ == '__main__':
    main()
