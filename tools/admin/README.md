# 管理者ツール (`tools/admin/`)

時刻表データを GUI で追加・閲覧するためのローカルツール。
PDF をドロップしてプレビュー → 整合性チェック → 確認後に `public/data/` へ書き込む流れ。

## 起動

```bash
bash tools/admin/start.sh
```

ブラウザで http://localhost:9001/ を開く。Ctrl+C で停止。

> ポート 9001 が他プロセスで使われていた場合は自動で kill して再起動する。

## 動作環境

- Python 3.13（`http.server`、`pdfplumber`、`pandas`）
- 標準ライブラリベース。Flask 等は不使用。

## ディレクトリ構成

```
tools/admin/
├── start.sh           # 起動スクリプト
├── server.py          # Python サーバ (port 9001)
├── parser_adapter.py  # 既存パーサーへのアダプタ
├── check_commit.py    # 整合性チェック + ファイル書き込み / 編集 / 削除
├── index.html         # UI
├── app.js             # フロント処理
├── style.css          # スタイル
└── README.md          # このファイル
```

書き込み対象:

```
public/data/
├── manifest.json      # ローダーが見る索引
├── regular/           # 通常ダイヤファイル
└── special/           # 特別ダイヤファイル
```

## 使い方

### 新規追加タブ

1. PDF をドロップエリアに投入（または「ファイル選択」）
2. パーサーが PDF から自動抽出:
   - 区間（ファイル名から推定）
   - 種別 regular / special（ファイル名から推定）
   - `valid_from` / `valid_until` または `apply_periods`
   - 停留所と時刻表本体
3. メタデータ編集欄で必要な項目を入力（特に **special** の場合）:
   - **schedule_key** (必須): 例 `gw_2026`
   - **label_ja** (必須): 例 `GW特別ダイヤ`
   - **label_en**: 英語ラベル
   - **display_from / display_until**: タブ表示期間（任意、空欄なら apply_periods と同じ）
4. 「**チェック実行**」ボタンを押下:
   - エラーがある場合: 修正してから再チェック
   - 警告だけ / エラーなし: 「**データを追加**」ボタンが有効化
5. 「**データを追加**」ボタンを押下:
   - 該当ファイルが `public/data/regular/` または `public/data/special/` に書き出される
   - `manifest.json` に新エントリが追加される
   - `meta.added_at` には現在時刻 (JST, ISO 8601) が自動付与
6. 変更を本番に反映するには `git add` → `git commit` → `git push`

### 登録一覧タブ

- 左ペイン: 登録済みファイル一覧
  - フィルタ: 種別 (regular / special) / 区間 / 有効性 (現在有効 / 将来 / 期限切れ)
  - 各ファイル項目には期間と種別が表示される
  - **ゴーストエントリ警告**: manifest にあるが実体ファイルが無いエントリは赤バッジ + 上部にバナーで警告
- 右ペイン: 選択したファイルの詳細
  - メタデータ表
  - 推定で補完したフィールドがあれば警告表示（PDF外データ）
  - 時刻表プレビュー（行=便、列=停留所）
  - 生 JSON は折りたたみで全文確認可
  - **編集ボタン / 削除ボタン**

### 編集機能

詳細画面の「編集」ボタンから既存ファイルのメタデータを部分更新できる。

| 編集可フィールド | 編集不可フィールド |
|---|---|
| `valid_from` / `valid_until` (regular) | `schedule_key` |
| `apply_periods` (special) | `segment` |
| `display_from` / `display_until` | `added_at` |
| `label_ja` / `label_en` | `routes` / `schedules` (時刻表本体) |
| `operator` / `note` | |

- 保存時に `meta.updated_at` に現在時刻 (JST) が自動付与される
- 期間 (`valid_*` または `apply_periods`) を変更するとファイル名が自動でリネームされ、manifest も追従する
- 整合性チェックは新規追加と同じロジック（自分自身は除外して期間重複検査）
- 時刻表本体や schedule_key を変えたい場合は **削除→新規追加** で対応する

### 削除機能

詳細画面の「削除」ボタンから個別ファイルを削除できる。

- 確認ダイアログに対象ファイル名と内容（特別ダイヤならラベルと適用期間、通常ダイヤなら期間）を表示
- ファイル削除 + manifest からエントリ除去を一括実行
- **ゴーストエントリ** (manifest にあるが実体ファイルが無い) も同じUIから「manifest から除去」できる
  - データ挿入ミスで手動でファイルを消してしまった等のケースを修復する用途

## 整合性チェックのルール

| 項目 | regular | special | レベル |
|---|---|---|---|
| `valid_from` 必須 | ✅ | (apply_periodsで代替) | エラー |
| `valid_until` ≥ `valid_from` (null除く) | ✅ | - | エラー |
| 日付フォーマット (YYYY-MM-DD) | ✅ | ✅ | エラー |
| `apply_periods` 1つ以上、各期間で from ≤ until | - | ✅ | エラー |
| `schedule_key` (英小文字+数字+_) | - | ✅ | エラー |
| `label_ja` 必須 | - | ✅ | エラー |
| `routes` 非空、各 trip の長さが stops と一致 | ✅ | ✅ | エラー |
| 時刻フォーマット (`H:MM` または `HH:MM`) | ✅ | ✅ | エラー |
| 同区間内で期間重複 | 警告のみ（追加可） | エラー（追加不可） | regular: 警告 / special: エラー |

**重複ポリシーの違い**: regular は `pickRegularEntry` ローダーが「期限切れフォールバック」で確定的に1つ選ぶため警告のみ。special は同じ日に2つ該当する優先順位が決まらないため拒否。

## 対応している区間

| 区間 | 通常ダイヤ | 特別ダイヤ |
|---|---|---|
| `shuttle_tsurugi` | ✅ | ✅ |
| `shuttle_komatsu` | ✅ | ✅ |
| `ir_ishikawa` | ✅ | ❌ |
| `ishikawa_line` | ❌ (2PDF必要) | ❌ |
| `limo_komatsu` | ✅ | ❌ |

- **`ishikawa_line`**: 平日PDFと休日PDFの2ファイルが必要なため、現状の1PDFアップロード方式では非対応。コマンドラインから `tools/run_all.py` で生成すること。
- **特別ダイヤ**: JAIST シャトル (`shuttle_tsurugi` / `shuttle_komatsu`) のみ対応。他区間の特別ダイヤは仕様として扱わない。
  - 対応PDFフォーマット: `JAIST Shuttle 連休特別ダイヤ運行表`（GW_fix の別紙1/別紙2 と同形式）
  - UI: 種別 = special を選択すると、区間プルダウンで非対応区間が disabled になる
  - サーバ側でも `parser_adapter.py` と `check_commit.py` で二重に弾く

## API エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/` | UI HTML |
| GET | `/app.js`, `/style.css` | 静的ファイル |
| GET | `/api/manifest` | 現在の `manifest.json` |
| GET | `/api/files` | 登録ファイル一覧 (各エントリに `ghost: true/false` を付与) |
| GET | `/api/file?kind=...&file=...` | 個別ファイル中身 |
| POST | `/api/parse` | PDF アップロード → パース |
| POST | `/api/check` | 整合性チェックのみ実行 |
| POST | `/api/commit` | チェック + ファイル書き込み + manifest 更新 |
| POST | `/api/update` | 既存ファイルのメタデータ部分更新 (上書き保存、`updated_at` 自動付与) |
| POST | `/api/delete` | ファイル削除 + manifest からエントリ除去 (ゴーストでも実行可) |

## トラブルシューティング

### `OSError: [Errno 98] Address already in use`

別の管理者ツールが残っている。`start.sh` は自動で kill するが、効かない場合は:

```bash
ss -tlnp | grep 9001
kill -9 <PID>
```

### 区間が誤判定される

ファイル名から推定しているため、変則的な名前だと外れる場合がある。
パース後の編集フォームで「区間」プルダウンから手動修正可。

### 特別ダイヤPDFのフォーマットが違う

`tools/parsers/special_jaist.py` のパーサーは GW_fix の PDF と同じフォーマット専用。
新しいフォーマットの特別ダイヤを扱うには、パーサーを追加・拡張する必要がある。

## デプロイの流れ

このツールは **ローカル専用**。本番反映は git 経由:

```bash
# admin ツールで追加した後
git status                    # public/data/ の変更を確認
git diff public/data/manifest.json
git add public/data/manifest.json public/data/regular/<新ファイル> public/data/special/<新ファイル>
git commit -m "add special schedule for ..."
git push
# GitHub Pages に自動デプロイされる
```
