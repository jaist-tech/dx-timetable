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

のみバスは `tools/nomibus/run.py --fetch --dry-run` をワークフロー内で実行して差分を確認する。

## 自動反映 (`apply.py`)

`watch.py` が `events.json`（新規・更新・期限切れ区間の未反映PDF）を書き，`apply.py` が PDF を取得して
パース → 整合性チェック → `public/data/` と manifest に書き込む。**push はしない**（人が差分を確認して push）。

```bash
python3 tools/watch/watch.py --update-state
uv run --with pdfplumber --with pandas python tools/watch/apply.py --dry-run   # チェックのみ
uv run --with pdfplumber --with pandas python tools/watch/apply.py             # 書き込み
git diff --stat public/data
```

自動で反映しないもの（レポートに「要手動」と出る）: 特別ダイヤ，石川線（2 PDF），整合性エラーのもの。
（新規ファイルは `git add -N` 済みのため含まれる）。

## アクセスの配慮

- リクエスト間隔 3 秒，`robots.txt` を確認（禁止なら取得しない）
- 取得済み PDF は `If-None-Match` / `If-Modified-Since` の条件付き GET（未更新なら 304 で本体を転送しない）
- 実行は週 2 回（月・木）。ページ 4 件と掲載中 PDF のみ

## メールによる検知（やらない）

JAIST のメール（受信箱）を読んで改定を検知する案は，個人の受信箱に触れるため採用しない．検知は公式ページの監視のみ．

## 本番への反映の流れ

```
cron（月・木 09:00）→ run_local.py: origin/dev（無ければ main）から dev を作り watch→apply→commit
 → メール（差分・push のコマンド）→ あなた: git push -u origin dev → dev→main の PR → 確認 → merge
 → deploy.yml が public/ を GitHub Pages に公開（Pages の公開元は main のみ）
```

cron の登録: `0 9 * * 1,4 ~/project/dx-timetable/tools/watch/run_local.sh`（クローンは `~/project/tmp/dx-timetable-watch`，ログは `~/project/tmp/dx-timetable-watch.log`）。
同じ内容のメールは再送しない。「要手動」の行は `tools/admin/` で PDF を追加する。
