# 経路検索（route.html / planner.js）の仕様と連携

## 要約

のみバスを含む全路線から任意の 2 停留所間の経路を探す新ページ `route.html` と，画面に依存しない探索部 `public/js/planner.js` を追加した．既存の検索・詳細・マップの画面と探索は変えていない．入口は `about.html` のカード 1 つ．マップアプリは URL 引数か `Planner.plan()` で使える．

| 項目 | 状態 |
|---|---|
| 探索 | RAPTOR（乗車回数ごとの最早到着）を出発時刻ごとに繰り返す．5 条件（合計時間・乗換回数・待ち時間・乗車時間・金額）の並べ替え，乗換上限（0〜5・無制限），徒歩の乗換，出発／到着指定 |
| 試験 | `node --test tests/planner.test.js`（12 件）．全探索との突合 150 組一致．既存 6 経路の旧探索の結果は，新探索で全件説明できる（7 組） |
| 速度（Node） | 探索 1 回 約 6〜10 ms（スマホ実機は未計測） |
| 金額の条件 | `data/fares.json`（`docs/fares.md`．大人・現金・片道）を読んで有効．のみバス同士の乗継は 2 本目を無料として計算．区間の運賃が未登録（空港バスの途中停留所どうし等）の経路は金額なし |
| 徒歩の乗換 | 座標のある停留所の組（190 中 53）と `routes.json` の徒歩の乗換だけ．残り 137 停留所の座標は未確認 |

あなたの作業: `route.html` を開いて使い勝手を確かめる（閲覧サーバーの URL は完了の付箋）．

## 1 ファイル

| 場所 | 内容 |
|---|---|
| `public/route.html`・`css/route.css`・`js/route.js` | 画面（入力・結果・日英・直近の検索の記憶） |
| `public/js/planner.js` | 探索部．ブラウザは `window.Planner`，Node は `require` |
| `public/data/route/stops.json` | 停留所の座標・徒歩の乗換（`tools/route/build_stops.py` で生成） |
| `public/data/fares.json` | 運賃表（別タスクで収集．無ければ金額の条件は無効） |
| `public/js/selection-memory.js` | 既存画面の直近の選択の記憶（30 分以内だけ復元） |
| `tests/planner.test.js` | Node の自動試験 |

時刻表は既存の `manifest.json`・`regular/`・`special/` をそのまま読むため，時刻表の更新（`tools/watch`）に自動で追従する．

## 2 マップアプリからの使い方

### A URL 引数

```
route.html?from=JAIST&to=金沢駅&date=2026-10-10&arrive=18:30&prio=time&auto=1
```

`from`・`to` は停留所名か `緯度,経度`（座標は徒歩 15 分以内の近い 5 停留所を候補にする）．`depart=HH:MM` または `arrive=HH:MM`，`prio=time|transfers|wait|ride|fare`．

### B JS の部品

```js
const net = await Planner.load('https://<配信元>/data/');   // 時刻表・座標・運賃を取得（CORS 可の配信元）
await net.ensureDate('2026-10-10');
const res = Planner.plan(net, {
  date: '2026-10-10', from: {lat: 36.44, lon: 136.59}, to: '金沢駅',
  arrive: '18:30', priority: 'time', maxTransfers: 3,
  walk: {enabled: true, maxMin: 5, speed: 80},
});
```

結果は `{apiVersion: 1, date, count, journeys: [{dep, arr, depStr, arrStr, total, transfers, wait, ride, walk, fare, legs: [...]}]}`．分は 0 時からの整数（24 時超あり）．`legs` の要素は `{type:'trip', routeId, routeName, from, to, dep, arr, stops:[{name,time}]}` または `{type:'walk', from, to, minutes, dep, arr}`．形を変えるときは `apiVersion` を上げる．

## 3 探索の決め方（既存との違い）

- 出発指定は，出発地で乗れる便の出発時刻ごとに探索して候補を集め，出発が遅く・到着が早く・乗換が少ないものに劣る候補を除く（既存の「最も遅い便を選ぶ逆向き探索」とは違い，全候補から並べ替える）．
- 並べ替えは辞書式（選んだ条件→合計時間→乗換回数→金額→出発が遅い順）．
- 乗換が 1 回増えて 3 分以上縮まない候補は，既定では除く（詳細設定で解除）．
- 乗換の最小時間は `routes.json` の `transfers`（既定 5 分）．徒歩の乗換は徒歩の分＋余裕 2 分．徒歩は 1 回の乗換につき 1 区間（連続する徒歩はつながない）．
- 停車する停留所の組が違う便（通過便）は別の系統として扱う（最早の便が目的地に止まらない場合の誤りを防ぐ）．
- のみバスの「(折り返し)」は同じ停留所に名寄せ．他路線との名寄せは名前の完全一致（能美根上駅・鶴来駅・岩本・灯台笹・小松駅・野々市駅）．JAIST↔先端大学（徒歩 3 分）と西金沢↔新西金沢は `routes.json` の徒歩の乗換．

## 4 既知の制約（未対応）

- のみバス 137 停留所の座標が未確認（OSM と名前が一意に一致した分だけ採用）．座標が無い停留所は，徒歩の乗換と座標指定の出発地の候補に入らない．
- 「先端大学前」と JAIST の関係，「岩本」「灯台笹」の同一性（のみバスとシャトルの同名停留所を同じ場所として扱っている）は現地の確認が要る．
- 徒歩の道のりは直線距離×1.3÷速さの近似（OSM の歩行者経路の事前計算は未実装）．
- 金額は大人の現金・片道（IC・学割・定期は含まない）．金額を重視する並べ替えは候補の中から選ぶ．
- 待ちの上限（既定 120 分）は，各停留所の最早到着だけを残す探索と組み合わさるため，「最早の到着では接続便まで上限を超えるが，後の到着なら収まる」経路は返さないことがある（上限を「無制限」にすると返る）．
- 待ち時間・乗車時間・金額を重視する並べ替えは，出発時刻ごとの最早到着の候補の中から選ぶ（それらの最小値を直接は探索しない）．
- 終発後の翌日の便は探索しない（既存と同じ）．
