# JAISTのりかえ

JAISTと周辺地域を結ぶ交通手段の時刻表・乗換案内Webアプリです。

## 対応路線

| 路線 | 区間 |
|---|---|
| JAISTシャトルバス 鶴来線 | JAIST ↔ 鶴来駅 |
| JAISTシャトルバス 小松線 | JAIST ↔ 小松駅 |
| 北陸鉄道 石川線 | 鶴来駅 ↔ 野町駅 |
| IRいしかわ鉄道 | 大聖寺駅 ↔ 金沢駅（南側）/ 金沢駅 ↔ 倶利伽羅駅（北側） |
| 小松空港連絡バス | 小松駅 ↔ 小松空港 |
| のみバス（能美市コミュニティバス） | 連携・観光・循環 全12系統 ※時刻表一覧のみ |

乗換ルート（JAIST → 小松駅 → 金沢駅、JAIST → 鶴来駅 → 金沢駅、JAIST → 小松空港 等）にも対応しています。

のみバスは時刻表一覧ページ（`timetable.html`）での閲覧のみの対応で、検索・乗換ルートには組み込まない方針です。

## 機能

- **検索**: ルート・出発/到着駅・日付（当日から7日先まで）を選択して便一覧を表示。次の便までのカウントダウン表示
- **日付指定**: 今日以外の日付を選ぶと、その日の日種別（平日/休日/祝日/特別ダイヤ）と適用ダイヤ版で全便を表示。未来日ではグレーアウト・「次発」「運行中」バッジ・カウントダウン・マップのバス位置は表示しない
- **詳細**: 選択した便のタイムライン表示（乗車駅・乗換駅・降車駅、待ち時間）
- **マップ**: Leafletによる経路表示、バス位置の表示（時刻表ベースのシミュレーション）
- **時刻表一覧**: 全路線（のみバス含む）の全便時刻表をテーブル形式で閲覧（`timetable.html`）
- **お気に入り**: ヘッダーの★ボタンからよく使うルートを保存・ワンタップ切替。localStorageに保存
- **表示設定**: ヘッダーの🌍|☀ボタンから言語（日本語/英語）とテーマ（ライト/ダーク）を切替。駅名・路線名・免責事項等を含む全テキストが切り替わる
- **チュートリアル**: 初回起動時にアプリの使い方を案内する4ページのガイドを表示。「このアプリについて」ページから再表示可能
- **PWA対応**: ホーム画面への追加に対応

## ページ構成

| ページ | パス | 内容 |
|---|---|---|
| メイン画面 | `index.html` | 検索・詳細・マップの3タブ構成 |
| このアプリについて | `about.html` | アプリ説明・免責事項・出典・ライセンス・チュートリアル再表示 |
| 時刻表一覧 | `timetable.html` | 路線別の全便時刻表テーブル |

## ディレクトリ構成

```
dx-timetable/
├── public/                  # Webアプリ本体（GitHub Pagesで配信）
│   ├── index.html           # メイン画面
│   ├── about.html           # アプリ情報・免責事項
│   ├── timetable.html       # 時刻表一覧ページ
│   ├── css/                 # スタイルシート
│   │   ├── base.css         # 共通スタイル・ダークテーマ定義
│   │   ├── search.css       # 検索タブ
│   │   ├── status.css       # 詳細タブ
│   │   └── map.css          # マップタブ
│   ├── js/                  # JavaScript
│   │   ├── debug.js         # デバッグ用の時刻固定スイッチ（全ページ共通）
│   │   ├── i18n.js          # 多言語対応（翻訳辞書・駅名翻訳・言語切替）
│   │   ├── app.js           # データ読込（表示日に応じたダイヤ版解決）・初期化
│   │   ├── utils.js         # グローバル状態・時刻計算・乗換検索
│   │   ├── search.js        # 検索画面・便一覧・日付選択
│   │   ├── status.js        # 詳細画面・タイムライン
│   │   └── map.js           # マップ画面（Leaflet）
│   ├── data/
│   │   ├── routes.json      # ルート定義・セグメント構成・乗換設定
│   │   ├── manifest.json    # 時刻表ファイルの索引（ローダーが参照する真実のソース）
│   │   ├── regular/         # 通常ダイヤファイル（区間+期間ごと）
│   │   ├── special/         # 特別ダイヤファイル（GW・お盆等）
│   │   ├── holidays.json    # 祝日リスト（休日ダイヤ判定）
│   │   └── geo/             # 経路GeoJSON（マップ表示用）
│   ├── img/                 # アイコン画像
│   └── manifest.json        # PWA設定
├── tools/                   # 時刻表データ生成ツール
│   ├── data/                # 元データPDF
│   ├── parsers/             # 区間別PDFパーサー
│   │   ├── shuttle_tsurugi.py   # 鶴来線
│   │   ├── shuttle_komatsu.py   # 小松線
│   │   ├── ishikawa_line.py     # 北陸鉄道 石川線
│   │   ├── ir_ishikawa.py       # IRいしかわ鉄道
│   │   ├── limo_komatsu.py      # 小松空港連絡バス
│   │   └── special_jaist.py     # JAISTシャトル特別ダイヤ（GW等）
│   ├── nomibus/             # のみバス時刻表更新ツール（能美市サイトから取得）
│   ├── output/              # 生成済みJSON（タイムスタンプ付き）
│   ├── run_all.py           # 全区間一括生成スクリプト（旧構造用）
│   ├── timetable_viewer.html # デバッグ用時刻表ビューア
│   └── admin/               # 管理者用ローカルツール（PDF→追加/編集/削除のGUI）
│       ├── start.sh
│       ├── server.py
│       ├── parser_adapter.py
│       ├── check_commit.py
│       ├── index.html
│       ├── app.js
│       ├── style.css
│       └── README.md
├── server.js                # ローカル開発用HTTPサーバー
├── .github/workflows/
│   └── deploy.yml           # GitHub Pages自動デプロイ
└── README.md
```

## デプロイ

### GitHub Pages

`main` ブランチにpushすると、GitHub Actionsが `public/` フォルダをGitHub Pagesに自動デプロイします。

**初回設定**: リポジトリの Settings → Pages → Build and deployment で Source を **GitHub Actions** に変更してください。

デプロイ後のURL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

### ローカル開発

```bash
node server.js
# http://localhost:9000 でアクセス
```

## 時刻表データの更新手順

### 推奨: 管理者ツール経由

`tools/admin/` のローカルツールを使うと、PDFをドロップしてプレビュー→整合性チェック→`regular/`/`special/` への書き込み + manifest 更新までGUIで完結する。

```bash
bash tools/admin/start.sh
# ブラウザで http://localhost:9001/ を開く
```

詳細は [tools/admin/README.md](tools/admin/README.md) を参照。

主な機能:
- PDFドラッグ&ドロップ → 自動パース → メタデータ編集 → 整合性チェック → 追加
- 登録済みファイルの一覧・閲覧・編集・削除
- 特別ダイヤ（GW等）の追加対応 (JAISTシャトル鶴来線・小松線のみ)
- ゴーストエントリ（manifest にあるが実体無し）の検出と修復

依存ライブラリ:
```bash
pip install pdfplumber pandas
```

### 入手元PDF

各交通機関の公式サイトから最新の時刻表PDFをダウンロードする。

| PDF | 入手元 |
|---|---|
| `shuttle_turugi*.pdf` | [JAIST アクセス情報](https://www.jaist.ac.jp/top/access/) |
| `shuttle_komatsu*.pdf` | 同上 |
| `ishikawa-line_timetable_weekday*.pdf` | [北陸鉄道 石川線](https://www.hokutetsu.co.jp/railway/ishikawasen/) |
| `ishikawa-line_timetable_weekend*.pdf` | 同上 |
| `IR_ishikawa*.pdf` | [IRいしかわ鉄道](https://www.ishikawa-railway.jp/timetable/) |
| `limo_komatsu*.pdf` | [北陸鉄道 空港連絡バス](https://www.hokutetsu.co.jp/airport-bus#station_airport) |

### のみバス（Web取得）

のみバスはPDFではなく能美市公式サイトから取得する。`tools/nomibus/` の更新ツールで `regular/nomi_*.json` と manifest の更新まで自動で行う:

```bash
cd tools/nomibus
python3 run.py            # 変更があった場合のみ public/data/ を更新
python3 run.py --fetch    # ダイヤ改正後はキャッシュを破棄して再取得
```

詳細は [tools/nomibus/README.md](tools/nomibus/README.md) を参照。公式案内ページ: https://www.city.nomi.ishikawa.jp/docs/1760.html

### 補助: コマンドラインから一括生成 (run_all.py)

`ishikawa_line` のように2PDF必要な区間など、管理者ツール非対応のものはコマンドラインから:

```bash
cd tools
python3 run_all.py
```

`tools/output/YYYYMMDD_HHMMSS/` に旧構造の JSON が生成される。新構造 (`regular/`+`special/`+`manifest.json`) には自動反映されないため、手動で配置する必要がある。

### 祝日リストの更新

`public/data/holidays.json` に、対象年の祝日を `YYYY-MM-DD` 形式で記載する。祝日は休日ダイヤ（weekend）として扱われる。振替休日・国民の休日も含めること。

### デプロイ

`main` ブランチに push → GitHub Actions が自動デプロイ。

```bash
git status                  # public/data/ の変更を確認
git diff public/data/manifest.json
git add public/data/
git commit -m "..."
git push
```

## デバッグモード

`public/js/debug.js` の `DEBUG_DATETIME` に日時文字列をセットすると、アプリ全体（index/timetable/about のすべての時計・便表示・カウントダウン・マップ・特別ダイヤ判定）がその時刻で動く。

```js
const DEBUG_DATETIME = '2026-05-03 12:00';  // GW期間中をシミュレート
const DEBUG_DATETIME = null;                  // 通常 (実時刻)
```

特別ダイヤや祝日の挙動、バスの走行表示などをテストするときに使う。本番デプロイ前に必ず `null` に戻すこと。

## 時刻表ビューア（開発用）

`tools/timetable_viewer.html` で `tools/output/` 内の生成済みJSONを確認できます。

```bash
cd tools
python3 -m http.server 8080
# http://localhost:8080/timetable_viewer.html
```

公開版の時刻表一覧は `public/timetable.html`（`manifest.json` 経由で `regular/` および `special/` のJSONを読み込み）。

## データ形式

### manifest.json (索引)

`public/data/manifest.json` は「どの日付にどのファイルを使うか」を示すルーティングテーブル。ローダーはまずこれを読み、表示日（通常は今日。日付選択時は選択日）に該当する `regular/`/`special/` ファイルだけを fetch する。日付選択で版の有効期間をまたぐと、その日付の版を選び直して追加フェッチする（取得済みファイルはキャッシュされる）。

```json
{
  "regular": {
    "shuttle_komatsu": [
      { "file": "shuttle_komatsu_2026-04-01_null.json",
        "valid_from": "2026-04-01",
        "valid_until": null }
    ]
  },
  "special": {
    "shuttle_komatsu": [
      { "file": "shuttle_komatsu_2026-05-02_2026-05-06.json",
        "apply_periods": [{ "from": "2026-05-02", "until": "2026-05-06" }],
        "display_from": "2026-04-26",
        "display_until": "2026-05-06",
        "schedule_key": "gw_2026",
        "label_ja": "GW特別ダイヤ",
        "label_en": "Golden Week Special" },
      { "fallback_to": "weekday",
        "apply_periods": [{ "from": "2026-04-29", "until": "2026-04-29" }] }
    ]
  }
}
```

- **regular**: 通常ダイヤ。`valid_from <= today <= valid_until` を満たすファイルが採用される。`valid_until: null` は終了未定。
- **special**: 特別ダイヤ。`apply_periods` のいずれかに今日が含まれれば採用。`fallback_to` エントリは file ではなく `weekday`/`weekend` に強制リダイレクトする（祝日扱いを覆したい日などに使用）。

ファイル選択ルール（regular。`today` は表示日）:
1. `valid_from <= today <= valid_until` のうち、`valid_from` が最新のもの
2. 該当が無ければ「`valid_from <= today` で `valid_until < today` のうち `valid_from` が最新のもの」（メンテ漏れ救済フォールバック）

### regular/*.json (通常ダイヤ)

```json
{
  "meta": {
    "valid_from": "2026-04-01",
    "valid_until": null,
    "operator": "JAISTシャトルバス",
    "note": "...",
    "added_at": "2026-04-26T04:41:01+09:00",
    "updated_at": "2026-04-26T10:00:00+09:00"
  },
  "routes": [
    {
      "id": "komatsu_outbound",
      "name": "JAISTシャトル 小松線（大学 → 小松駅）",
      "stops": ["JAIST", "小松駅"],
      "schedules": {
        "weekday": [["6:45", "7:20"], ...],
        "weekend": [["6:45", "7:20"], ...]
      }
    }
  ]
}
```

### special/*.json (特別ダイヤ)

```json
{
  "meta": {
    "apply_periods": [{ "from": "2026-05-02", "until": "2026-05-06" }],
    "display_from": "2026-04-26",
    "display_until": "2026-05-06",
    "schedule_key": "gw_2026",
    "label_ja": "GW特別ダイヤ",
    "label_en": "Golden Week Special",
    "operator": "JAISTシャトルバス",
    "note": "...",
    "added_at": "2026-04-26T04:41:01+09:00",
    "derived_fields": [...]
  },
  "routes": [
    {
      "id": "komatsu_outbound",
      "stops": ["JAIST", "小松駅"],
      "schedules": {
        "default": [["9:00", "9:35"], ...]
      }
    }
  ]
}
```

- `valid_from`/`valid_until` ではなく **`apply_periods`** で適用日を指定（飛び飛び対応）
- `display_from`/`display_until` で `timetable.html` のタブ表示期間を制御（適用前から告知タブを出す等）
- `schedule_key` は `getDayType()` の戻り値として使われ、`SEGMENTS[seg].<dir>.schedules[<key>]` に注入される
- `derived_fields` は PDF外で推定したフィールドの記録（鶴来線特別ダイヤの中間停留所時刻など）

ファイル名規約: `<segment>_<開始日>_<終了日>.json`（regular で終了日が null の場合は `null` を入れる）

### routes.json

ルート定義。セグメントの組み合わせで直通・乗換ルートを構成。

- `segment_files`: セグメント定義（JSONファイル、GeoJSONファイル、交通種別、方向マッピング）
- `direct_routes`: 単一セグメントの直通ルート
- `multi_routes`: 複数セグメントの乗換ルート（`from_stop`/`to_stop` で部分区間を指定可能）
- `transfers`: 乗換時間の定義（同一駅・徒歩乗換の両方を含む）
- `geo_mappings`: GeoJSONのクリッピング設定

### holidays.json

祝日リスト。`["2026-01-01", "2026-04-29", ...]` の YYYY-MM-DD 配列。`getDayType()` が祝日なら weekend ダイヤを採用する。区間別の例外（祝日だが特定区間だけ平日扱い）は `manifest.json` の `special.<seg>.fallback_to` で表現する。

## 免責事項

- 本アプリはJAISTおよび各交通機関（IRいしかわ鉄道・北陸鉄道等）の公式サービスではありません
- 時刻表データや経路情報には誤りが含まれる可能性があります。内容の正確性・最新性を保証するものではありません
- 本アプリの利用により生じたいかなる損害（乗り遅れ等を含む）についても、開発者は責任を負いかねます
- 正確な運行情報は各交通機関の公式サイトをご確認ください

## 開発

[JAIST Techサークル](https://www.jaist.ac.jp/misc/circles/tech/)
