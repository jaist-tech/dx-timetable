# dev ブランチの正常性とセキュリティの点検（2026-10-09）

## 要約

dev（main との差分 24 commit・52 ファイル）に，merge を止める問題は見つからなかった．運賃の過大表示（IR の乗継）など 5 件は直して dev に commit 済み．

| 観点 | 結果 |
|---|---|
| 試験（`tests/planner.test.js`） | 16 件 pass（運賃の試験を 1 件追加） |
| データ検査（`tools/watch/validate.py`） | エラー 0・警告 3（manifest の切れ目．下記） |
| 画面（4 ページ × 幅 360/768/1280 × 明暗） | 横はみ出し 0・コンソールエラー 0・HTTP 失敗 0 |
| セキュリティ | XSS 無し・外部読み込みは Leaflet（SRI あり）・OSM タイル・Google Fonts のみ・秘密情報の値の混入無し |
| security-audit | ユーザー本人の実行待ち（`/security-audit quick`．モデルからは呼べない） |

あなたの作業: ターミナルで `/security-audit quick` を実行し，結果を貼る．merge と push はしていない．

## 直したもの（dev に commit）

| # | 内容 | 場所 |
|---|---|---|
| 1 | IR・石川線を続けて乗る経路の運賃が合算（過大）だった．通しの区間で引く（加賀温泉→津幡 1150→1130 円）．試験を追加 | `public/js/planner.js` `journeyFare` |
| 4 | 地図を開いたまま再検索すると Leaflet の map が残る | `public/js/route.js` `search` |
| 3 | 新旧ファイルの混在時に `restoreLastSelection` 未定義で止まる | `public/js/app.js` |
| 7 | 入力に `$&` を含むと文言が崩れる | `public/js/i18n.js` `t()` |
| 9 | 試験のコメントの実行コマンドが誤り | `tests/planner.test.js` |

## 未対応と変えない点

未対応（理由）:
- manifest の切れ目: limo は 10-24，shuttle_komatsu は 10-31 までで，以後・7〜8 月は前のダイヤを使う．公式の新ダイヤの公開待ちで `tools/watch` が検知する．期限切れ日の注記表示は未実装．
- #5 `net.day()` が不完全な日を保存する（ensureDate 失敗時のみ）．#6 徒歩で終わる経路は目的地到着と数えない（仕様の可能性．`docs/route-planner.md` に未記載）．#10 `run.py` の日付の逆転．#11 `watch.py` の PDF 取得先のホスト確認．いずれも低．

変えないと決めた点:
- #3 のうち `MapIcons` の守り: 同じ配備で配信され，ブラウザが再検証するため．
- #8 個人のメールアドレス・作業パスが `tools/watch/run_local.py`・`tools/check/` に入っている（秘密情報の値は無い）: 公開リポジトリのため環境変数化が望ましいが，本人の判断が要る．
- #9 deploy.yml が試験を走らせない: main の運用方針の判断．

## 確かめた手順・出典

- reviewer（Claude）によるコードレビュー．Codex は使っていない（理由: 代替の reviewer で足りると判断．付箋に記録）．
- 画面検査は scratchpad の Playwright スクリプト（Chrome for Testing）．URL 引数に `<img onerror>` と `<script>` を入れて実行されないことを確認．
- 既存画面（検索・詳細・マップ）の差分は `index.html`・`app.js`・`map.js` の小変更のみで，マップの記号以外の動作変更は無い．
