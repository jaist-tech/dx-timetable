"""運賃表 public/data/fares.json を生成する（値は公式ページ・PDF から手で確認した元データ）．

IR いしかわ鉄道の行列は，駅別運賃ページ（https://www.ishikawa-railway.jp/station/<駅>/?ctg=fare）の
取得結果 ir_matrix.json（引数 1）から作る．石川線の行列は公式の運賃表（画像）を目視で転記した下の値．
使い方: uv run tools/fares/build_fares.py ir_matrix.json
"""
import json, sys

CHECKED = "2026-10-09"

IR_ORDER = ["大聖寺","加賀温泉","動橋","粟津","小松","明峰","能美根上","小舞子","美川","加賀笠間","西松任","松任","野々市","西金沢","金沢","東金沢","森本","津幡","倶利伽羅"]

IS_ORDER = ["野町","西泉","新西金沢","押野","野々市","野々市工大前","馬替","額住宅前","乙丸","四十万","陽羽里","曽谷","道法寺","井口","小柳","日御子","鶴来"]
# 各行: その駅から後ろの駅までの運賃（円）．公式の運賃表（railway_fare-scaled.png）の転記
IS_ROWS = [
 [200,210,240,240,310,320,400,400,440,460,460,460,500,500,540,540],
 [200,230,230,290,320,370,370,440,440,460,460,490,500,540,540],
 [200,200,290,290,290,370,440,440,440,440,490,490,490,540],
 [200,200,290,290,290,370,370,370,440,440,440,490,540],
 [200,200,290,290,370,370,370,370,440,440,490,490],
 [200,200,290,290,370,370,370,440,440,440,490],
 [200,200,290,290,290,370,370,370,440,490],
 [200,290,290,290,290,370,370,370,440],
 [200,200,290,290,290,370,370,440],
 [200,200,200,290,290,290,370],
 [200,200,200,290,290,370],
 [200,200,290,290,370],
 [200,200,290,290],
 [200,200,290],
 [200,290],
 [200],
]

def sym(order, rows):
    n = len(order); m = {}
    for i, r in enumerate(rows):
        assert len(r) == n-1-i, (order[i], len(r))
        for k, v in enumerate(r):
            m.setdefault(order[i], {})[order[i+1+k]] = v
            m.setdefault(order[i+1+k], {})[order[i]] = v
    return m

def main(irfile):
    raw = json.load(open(irfile))
    for a in IR_ORDER:
        for b in IR_ORDER:
            if a != b:
                assert raw[a][b] == raw[b][a], (a, b, raw[a][b], raw[b][a])
    ir = {a+"駅": {b+"駅": raw[a][b] for b in IR_ORDER if b != a} for a in IR_ORDER}
    isk = sym(IS_ORDER, IS_ROWS)
    nm = lambda s: "野々市駅（北鉄）" if s == "野々市" else s + "駅"   # IR の野々市駅とは別の駅（routes.json の place_aliases）
    isk = {nm(a): {nm(b): v for b, v in row.items()} for a, row in isk.items()}
    out = {
      "meta": {"checked": CHECKED, "currency": "JPY", "passenger": "大人・普通運賃（現金・片道）",
               "note": "IC・学割・定期は含まない．各 segment の source に出典と確認日"},
      "segments": {
        "shuttle_komatsu": {"kind": "flat", "fare": 0, "source": "https://www.jaist.ac.jp/top/access/", "checked": CHECKED,
                            "note": "予約制の無料シャトルバス（学外の方は訪問先を通じて予約）"},
        "shuttle_tsurugi": {"kind": "flat", "fare": 0, "source": "https://www.jaist.ac.jp/top/access/", "checked": CHECKED,
                            "note": "無料．予約なし．乗車時に来学目的・学生証の確認をとる場合がある"},
        "limo_komatsu": {"kind": "table", "source": "https://www.hokutetsu.co.jp/airport-bus/guide/ ・ https://www.hokutetsu.co.jp/_wp/wp-content/uploads/2026/09/limo_komatsu-komatsu_20261001-1024.pdf",
                         "checked": CHECKED, "note": "2026-08-01 改定後．小松空港行きは乗車停留所ごとの空港までの運賃．小松空港発は小松駅まで 310 円（時刻表 PDF の記載）．途中の停留所どうしの運賃は公式資料に無い",
                         "pairs": {"小松駅>小松空港": 310, "西町>小松空港": 310, "浜田町>小松空港": 310,
                                   "桜木町>小松空港": 260, "城南町>小松空港": 260,
                                   "浮柳>小松空港": 190, "浮柳西>小松空港": 190,
                                   "小松空港>小松駅": 310}},
        "ishikawa_line": {"kind": "matrix", "source": "https://www.hokutetsu.co.jp/railway/guide/（運賃表の画像 railway_fare-scaled.png）",
                          "checked": CHECKED, "fares": isk},
        "ir_ishikawa_south": {"kind": "matrix", "source": "https://www.ishikawa-railway.jp/fare/index.html ・ 駅別運賃ページ（2026-03-14 改定）",
                              "checked": CHECKED, "note": "対象は大聖寺〜金沢〜倶利伽羅の 19 駅．往復で同額（検査済み）",
                              "fares": ir},
        "nomibus": {"kind": "flat", "fare": 100, "source": "https://www.city.nomi.ishikawa.jp/docs/1770.html（2022-04-01 更新）",
                    "checked": CHECKED, "note": "均一．乗継券（同じ日に，のみバス同士の乗継のとき 2 本目は無料．降車時に運転手へ申し出）．未就学児は保護者同伴で無料．回数券 11 枚 1,000 円．定期券あり"},
      },
    }
    json.dump(out, open("public/data/fares.json", "w"), ensure_ascii=False, indent=1)
    print("ok", len(json.dumps(out, ensure_ascii=False)))

main(sys.argv[1])
