#!/usr/bin/env python3
"""時刻表の更新後に，経路探索の派生データを作り直して試験を回す．

順序: 停留所の座標表 → データのバージョン → Node の試験．tools/watch/apply.py の反映後に呼ぶ．
終了コード: 試験に落ちたら 1．
"""
import os, subprocess, sys
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')
for s in ('build_stops.py', 'build_version.py'):
    subprocess.run([sys.executable, os.path.join(HERE, s)], check=True)
r = subprocess.run(['node', '--test', 'tests/planner.test.js'], cwd=ROOT)
sys.exit(1 if r.returncode else 0)
