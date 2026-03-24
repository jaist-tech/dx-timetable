#!/usr/bin/env python3
"""全区間の時刻表PDFを読み込み、区間ごとにJSONを出力する

使い方:
    cd /home/ubuntu/bus_dx/tools
    python3 run_all.py

data/ に最新のPDFを配置してから実行してください。
output/<実行日時>/ にJSONが出力されます。
"""
import os
import sys
from datetime import datetime

# parsers/ をインポートできるようにする
sys.path.insert(0, os.path.dirname(__file__))

from parsers import shuttle_tsurugi, shuttle_komatsu, ishikawa_line, ir_ishikawa, limo_komatsu


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

PARSERS = [
    ("JAISTシャトル鶴来線", shuttle_tsurugi),
    ("JAISTシャトル小松線", shuttle_komatsu),
    ("北陸鉄道 石川線", ishikawa_line),
    ("IRいしかわ鉄道", ir_ishikawa),
    ("小松空港連絡バス", limo_komatsu),
]


def make_output_dir(base_dir):
    """output/<YYYYMMDD_HHMMSS>/ を作成。同名なら -2, -3 ... を付ける"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = os.path.join(base_dir, timestamp)

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        return output_dir

    # 同名が存在する場合（秒単位で同時実行された場合）
    for i in range(2, 100):
        candidate = f"{output_dir}-{i}"
        if not os.path.exists(candidate):
            os.makedirs(candidate)
            return candidate

    raise RuntimeError("出力ディレクトリを作成できませんでした")


def main():
    base_output_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(base_output_dir, exist_ok=True)

    output_dir = make_output_dir(base_output_dir)
    print(f"出力先: {output_dir}")
    print(f"データ: {DATA_DIR}")
    print()

    results = []
    for name, parser in PARSERS:
        print(f"[{name}]")
        try:
            output_path = parser.generate(DATA_DIR, output_dir)
            if output_path:
                results.append((name, output_path))
                print(f"  → {os.path.basename(output_path)}")
            else:
                print(f"  → スキップ（PDFなし）")
        except Exception as e:
            print(f"  → エラー: {e}")
        print()

    print("=" * 50)
    print(f"完了: {len(results)}/{len(PARSERS)} 区間を出力しました")
    print(f"出力先: {output_dir}")
    for name, path in results:
        print(f"  {name}: {os.path.basename(path)}")


if __name__ == "__main__":
    main()
