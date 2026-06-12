# のみバス時刻表更新ツール (`tools/nomibus/`)

能美市コミュニティバス（のみバス）の時刻表を
能美市公式サイトのバス停一覧ページ（https://www.city.nomi.ishikawa.jp/docs/1242.html）から取得し、
`public/data/regular/nomi_*.json` と `manifest.json` を更新するツール。
出典として表示する公式案内ページは https://www.city.nomi.ishikawa.jp/docs/1760.html 。

のみバスは**時刻表一覧ページ（`timetable.html`）のみの対応**で、
検索・乗換ルートには組み込まない方針（`routes.json` の `segment_files[]` には登録しない）。

## 基本的な使い方

```bash
cd tools/nomibus
python3 run.py
```

変更があれば `public/data/` に書き出される。その後 git で反映する。

```bash
git diff public/data/
git add public/data/manifest.json public/data/regular/nomi_*.json
git commit -m "update nomibus timetable YYYY-MM-DD"
git push
```

## オプション

| オプション | 説明 |
|---|---|
| (なし) | キャッシュを再利用。ネットアクセスしない(= 高速)。 |
| `--fetch` | キャッシュを破棄して全ページを再取得する。**ダイヤ改正後にだけ使う**。 |
| `--dry-run` | manifest 更新のみスキップ（実験用） |

## バージョン管理の仕組み

### 時刻表が変わった場合

`run.py` はサイトの更新日（`<time datetime="YYYY-MM-DD">`）を自動取得し、
既存ファイルと内容を比較する。

- **変更なし** → 何もしない（manifest も触らない）
- **内容が変わった** → 新ファイル（`nomi_<segment>_<改正日>_null.json`）を生成し、
  旧ファイルの `valid_until` を「実行日の前日」に自動設定してから manifest に追加する

アプリは `pickRegularEntry()` で `valid_from ≤ 表示日 ≤ valid_until` を満たす
最新ファイルを自動選択するため、古いファイルを削除しなくても新ファイルが読まれる。

### 路線が増えた場合

1. `convert.py` の `ROUTE_MAP` に新セグメントを追記
2. `timetable.html` の `JSON_FILES[]` にエントリを追加
3. `i18n.js` に表示名（`timetable.route.nomi_*`）と停留所名の翻訳を追加
4. `python3 run.py` を実行

※ 時刻表一覧のみの対応のため、`routes.json` への登録は不要。

### 路線が廃止された場合

1. `convert.py` の `ROUTE_MAP` から該当セグメントを削除
2. `timetable.html` の `JSON_FILES[]` から削除
3. `i18n.js` から削除
4. `python3 run.py` を実行

   → `ROUTE_MAP` にないセグメントは「データなし (skipped)」と表示され、
   manifest の該当エントリの `valid_until` が自動的に昨日の日付に設定される。
   古いファイル自体は残るが、アプリが読まなくなる。

## ダイヤ改正時の手順

1. 公式サイトで改正内容を確認する（新路線・廃止路線・時刻変更など）
2. 路線の増減がある場合は上記「路線が増えた/廃止された場合」の手順に従い各ファイルを編集
3. `python3 run.py --fetch` を実行（全ページ再取得 → パース → 変換）
   - 時刻変更があれば新バージョンのファイルが自動生成される
   - manifest の旧エントリに `valid_until` が自動設定される
4. `git diff public/data/` で変更内容を確認
5. git commit / push

## ディレクトリ構成

```
tools/nomibus/
├── run.py           # メインスクリプト（これだけ実行すれば OK）
├── crawl.py         # Step 1: 市サイトを巡回して HTML をキャッシュ
├── parse.py         # Step 2: HTML → 中間JSON（intermediate/）
├── convert.py       # Step 3: 中間JSON → public/data/regular/nomi_*.json
├── cache/           # キャッシュ済みHTML（git 管理外）
├── intermediate/    # 中間JSON（git 管理外）
└── README.md
```

`cache/` と `intermediate/` は git 管理外。`--fetch` 以外では `cache/` に残ったHTMLを再利用する。

## 処理の流れ

```
crawl.py  ─────→  cache/<page_id>.html  (能美市サイトから1回だけ取得)
parse.py  ─────→  intermediate/<page_id>__<table_idx>.json
convert.py ────→  public/data/regular/nomi_*.json
run.py    ─────→  manifest.json を更新
```

### Step 1: crawl.py

- 索引ページ(1242) → バス停ページ → 時刻表ページの順に辿る
- 既にキャッシュされたページはスキップ（何度実行しても安全）
- 1リクエストごとに3秒待機（サーバ負荷対策）

### Step 2: parse.py

- 各HTMLから `<table>` を抽出し、停留所・時刻・day_type（平日/土日祝/全日）をパース
- `intermediate/<page_id>__<n>.json` として出力

### Step 3: convert.py

- `ROUTE_MAP` 定義に従い中間JSONをセグメント単位にまとめる
- `nomi_<segment>_<valid_from>_<valid_until>.json` として出力

## 路線(セグメント)の追加・変更

`convert.py` の `ROUTE_MAP` リストを編集する。

```python
{
    "segment": "nomi_<新セグメント名>",
    "operator": "能美市コミュニティバス（のみバス）",
    "note": "説明文。",
    "source_pages": ["<時刻表ページID>"],
    "routes": [
        {
            "id": "nomi_<ルートID>",
            "name": "のみバス <表示名>",
            "direction_label": "",     # 複数方向があれば "先端大学方面" 等
            "day": "weekday_weekend",  # 下表参照
        },
    ],
},
```

`day` の値:

| 値 | 意味 |
|---|---|
| `"all"` | 全日同一ダイヤ（【全日】表記のページ） |
| `"weekday_weekend"` | 平日・土日祝で別ダイヤ |
| `"weekday_only"` | 平日のみ運行（土日祝は weekday と同じ便でフォールバック） |
| `"weekend_only"` | 土日祝のみ運行（平日は空） |

ROUTE_MAP に追加したら、さらに以下も更新する:

- `public/timetable.html` — `JSON_FILES[]` にエントリを追加
- `public/js/i18n.js` — `timetable.route.nomi_<segment>` を ja/en 両方に追加

（時刻表一覧のみの対応のため `public/data/routes.json` への登録は不要）

## 注意事項

- `--fetch` は約8〜10分かかる（145ページ × 3秒待機）
- キャッシュがあれば `python3 run.py` は数秒で完了する
- `cache/` は `.gitignore` に追加しても良い（大きくなるため）
- 廃止路線は `ROUTE_MAP` から削除し、`manifest.json` の当該エントリに `valid_until` を設定する
