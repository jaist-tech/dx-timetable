# 時刻表ソース監視 (`tools/watch/`)

公式ページの時刻表PDFの更新と，`public/data/manifest.json` の有効期間切れを自動検知するツール。
共有サーバーの cron（月・木 09:00，`run_local.sh`）が実行し，変化があればメールで通知する（Actions では動かさない。state.json の更新が dev と衝突し，SMTP の秘密情報を共有リポジトリに置くことになるため）。

## ローカルでの使い方

```bash
python3 tools/watch/watch.py                  # レポートを表示（state.json は更新しない）
python3 tools/watch/watch.py --update-state   # 今回の結果を state.json に保存
python3 tools/watch/watch.py --days 30        # 期限警告のしきい値を 30 日に
```

標準ライブラリのみで動作する（pdfplumber 等は不要）。

## 検知する事象

| 事象 | 判定方法 |
|---|---|
| PDF の新規掲載 | 監視ページ上のリンクが `state.json` にない |
| PDF の内容更新 | 同じURLで SHA-256 が変わった（Last-Modified も併記） |
| PDF の消失・リンク切れ | リンクがページから消えた／応答が PDF でない |
| データの期限切れ | manifest の regular に今日を覆うエントリがない（アプリは期限切れデータへフォールバックする） |
| 期限間近 | 21 日以内に全エントリが終了する |

HTML コメント（`<!-- -->`）内のリンクは「掲載されていない」とみなす。
JAIST のページは季節ダイヤ（GW・夏季・ほうらい祭り・年末年始）のリンクをコメントアウトで出し入れしているため，
コメントが外れた時点で「新規掲載」として検知される。

## 監視対象

| ソースID | ページ | 区間 |
|---|---|---|
| jaist_access | https://www.jaist.ac.jp/top/access/ | shuttle_komatsu, shuttle_tsurugi |
| hokutetsu_ishikawa | https://www.hokutetsu.co.jp/railway/ishikawasen/ | ishikawa_line |
| ir_ishikawa | https://www.ishikawa-railway.jp/timetable/ | ir_ishikawa |
| hokutetsu_airport | https://www.hokutetsu.co.jp/airport-bus | limo_komatsu |

| nomibus（のみバス） | https://www.city.nomi.ishikawa.jp/docs/1242.html（バス停一覧から約 140 ページ） | nomi_* の 13 区間 |

のみバスは `run_local.py` が `tools/nomibus/run.py --refresh` を実行する（条件付き GET で更新のあったページだけ再取得．
キャッシュ `tools/nomibus/cache/` はクローンに残る．初回は全ページ取得で約 8 分）。内容が変われば新しいバージョンのファイルと manifest を書く。

## 自動反映 (`apply.py`)

`watch.py` が `events.json`（新規・更新・期限切れ区間の未反映PDF）を書き，`apply.py` が PDF を取得して
パース → 整合性チェック → `public/data/` と manifest に書き込む。**push はしない**（人が差分を確認して push）。

```bash
python3 tools/watch/watch.py --update-state
uv run --with pdfplumber --with pandas python tools/watch/apply.py --dry-run   # チェックのみ
uv run --with pdfplumber --with pandas python tools/watch/apply.py             # 書き込み
git diff --stat public/data
```

石川線は平日・休日の 2 PDF を組にして読み取る（片方だけ更新されたときは state.json の相方を使う）。
自動で反映しないもの（レポートに「要手動」と出る）: 特別ダイヤ，整合性・検査に落ちたもの，既存の期間の内容が変わったもの（石川線を含む）。

## 検査 (`validate.py`)

取得→読み取り→JSON の各段で正常に動いているかを確かめる。`apply.py` は書き込む前に，`run_local.py` は commit する前（のみバスを含む全区間）に実行し，
落ちたものは commit せず「要手動」としてメールで理由を知らせる。

```bash
python3 tools/watch/validate.py            # 全ファイルと manifest を検査
python3 tools/watch/validate.py --changed  # git で変更されたファイルだけ
python3 -m unittest discover -s tools/watch -p 'test_*.py'   # 試験（過去のデータで通る・壊すと落ちる）
```

| 段 | 検査 |
|---|---|
| 取得 | PDF でない応答・リンク切れ・取得失敗（watch.py），robots.txt の禁止 |
| 読み取り | 例外，便 0 件の路線，路線の組・停留所の並びが直前のバージョンと違う，便数が 0.5〜2 倍の外 |
| JSON | 時刻の書式，便ごとの時刻数＝停留所数，便内の時刻が単調増加（日またぎは許す），有効期間の日付 |
| manifest | ファイルの実在，期間の重なり（エラー），切れ目・開いたままの旧エントリ（警告） |

公式の資料自体の誤りで落ちる既知の例は `validate.py` の `KNOWN_SOURCE_ANOMALY` に理由つきで登録する（現在 1 件: のみバス南回りの「松が岡 2 丁目」7:50）。

## 定期実行の監視

`run_local.py` は毎回の結果（成功・失敗と理由）をクローンの `.git/run_history.json` に残す。公式ページの取得失敗・のみバスの失敗・例外が **2 回続けて**起きたら
メール「定期実行が続けて失敗しています」を 1 回送る（回復すると解除）。cron 自体が動かない場合は自分では検知できない（記録が増えないだけ）。

## アクセスの配慮

- リクエスト間隔 3 秒，`robots.txt` を確認（禁止なら取得しない）
- 取得済み PDF は `If-None-Match` / `If-Modified-Since` の条件付き GET（未更新なら 304 で本体を転送しない）
- 実行は週 2 回（月・木）。ページ 4 件と掲載中 PDF のみ

## メールによる検知（やらない）

JAIST のメール（受信箱）を読んで改定を検知する案は，個人の受信箱に触れるため採用しない．検知は公式ページの監視のみ．

## 本番への反映の流れ

```
cron（月・木 09:00）→ run_local.py（手元のコード）: クローンを手元の dev から作り直し，watch→apply→validate
 → 変化があれば auto/timetable-日付 の新ブランチに commit（ここで止まる．push しない）
 → メール（プレビューの URL・差分・push のコマンド）→ あなた: 確認 → git push -u origin <ブランチ> → PR → merge
 → deploy.yml が public/ を GitHub Pages に公開（Pages の公開元は main のみ）
```

- 実行するコードは手元のリポジトリ（`~/project/dx-timetable`）の commit 済みの内容だけ．クローン `~/project/tmp/dx-timetable-watch` は手元から作り（origin＝手元，pushurl＝GitHub），リモートのコードは取得も実行もしない（cron がリモートの dev のコードを実行する危険は無い．`docs/dev-check.md` の要検証 1 件はこの流れでは起きない）
- プレビューは閲覧サーバー（8800）の `tmp/dx-timetable-watch/public/index.html`．変化が無い・反映できなかったときはブランチを作らず，要手動の行だけをメールする
- 同じ内容のメールは再送しない．確認して問題があれば何もせず，次の改定を待つ
- cron: `0 9 * * 1,4 ~/project/dx-timetable/tools/watch/run_local.sh`（ログ `~/project/tmp/dx-timetable-watch.log`）．2026-10-10 まで `run_local.sh` の cd が 1 階層多く一度も動いていなかった（修正済み）
