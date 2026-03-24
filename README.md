# BusDX — JAISTバス案内

JAISTと周辺地域を結ぶ交通手段の時刻表・乗換案内Webアプリです。

## 対応路線

| 路線 | 区間 |
|---|---|
| JAISTシャトルバス 鶴来線 | JAIST ↔ 鶴来駅 |
| JAISTシャトルバス 小松線 | JAIST ↔ 小松駅 |
| 北陸鉄道 石川線 | 鶴来駅 ↔ 野町駅 |
| IRいしかわ鉄道 | 大聖寺駅 ↔ 金沢駅（南側）/ 金沢駅 ↔ 倶利伽羅駅（北側） |
| 小松空港連絡バス | 小松駅 ↔ 小松空港 |

乗換ルート（JAIST → 小松駅 → 金沢駅、JAIST → 鶴来駅 → 金沢駅、JAIST → 小松空港 等）にも対応しています。

## 機能

- **検索**: ルート・出発/到着駅を選択して便一覧を表示。次の便までのカウントダウン表示
- **詳細**: 選択した便のタイムライン表示（乗車駅・乗換駅・降車駅、待ち時間）
- **マップ**: Leafletによる経路表示、バス位置のリアルタイム表示（シミュレーション）
- **時刻表一覧**: 全路線の全便時刻表をテーブル形式で閲覧（`timetable.html`）
- **ダークテーマ**: ライト/ダーク切替対応。設定はlocalStorageに保存
- **PWA対応**: ホーム画面への追加に対応

## ページ構成

| ページ | パス | 内容 |
|---|---|---|
| メイン画面 | `index.html` | 検索・詳細・マップの3タブ構成 |
| このアプリについて | `about.html` | アプリ説明・免責事項・出典・ライセンス |
| 時刻表一覧 | `timetable.html` | 路線別の全便時刻表テーブル |

## ディレクトリ構成

```
bus_dx/
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
│   │   ├── app.js           # データ読込・初期化
│   │   ├── utils.js         # グローバル状態・時刻計算・乗換検索
│   │   ├── search.js        # 検索画面・便一覧
│   │   ├── status.js        # 詳細画面・タイムライン
│   │   └── map.js           # マップ画面（Leaflet）
│   ├── data/
│   │   ├── routes.json      # ルート定義・セグメント構成・乗換設定
│   │   ├── segments/        # 区間ごとの時刻表JSON
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
│   │   └── limo_komatsu.py      # 小松空港連絡バス
│   ├── output/              # 生成済みJSON（タイムスタンプ付き）
│   ├── run_all.py           # 全区間一括生成スクリプト
│   └── timetable_viewer.html # デバッグ用時刻表ビューア
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

### 1. PDFを配置

各交通機関の公式サイトから最新の時刻表PDFをダウンロードし、`tools/data/` に配置します。

| PDF | 入手元 |
|---|---|
| `shuttle_turugi*.pdf` | [JAIST アクセス情報](https://www.jaist.ac.jp/top/access/) |
| `shuttle_komatsu*.pdf` | 同上 |
| `ishikawa-line_timetable_weekday*.pdf` | [北陸鉄道 石川線](https://www.hokutetsu.co.jp/railway/ishikawasen/) |
| `ishikawa-line_timetable_weekend*.pdf` | 同上 |
| `IR_ishikawa*.pdf` | [IRいしかわ鉄道](https://www.ishikawa-railway.jp/timetable/) |
| `limo_komatsu*.pdf` | [小松空港リムジンバス](https://www.komatsu-airport.jp/) |

### 2. JSONを生成

```bash
cd tools
python3 run_all.py
```

`output/YYYYMMDD_HHMMSS/` に5つのJSONが生成されます。過去の出力は上書きされません。

依存ライブラリ:
```bash
pip install pdfplumber pandas
```

### 3. アプリに反映

生成されたJSONを `public/data/segments/` にコピーします。

```bash
cp tools/output/<最新フォルダ>/*.json public/data/segments/
```

### 4. デプロイ

`main` ブランチにpush → GitHub Actionsが自動デプロイ。

## デバッグモード

`public/js/utils.js` の `DEBUG_FORCE_RUNNING` を `true` にすると、選択中ルートの1/3付近の便が走行中の状態をシミュレーションできます。時計・カウントダウン・マップのバス位置が全てシミュレーション時刻に連動します。

## 時刻表ビューア（開発用）

`tools/timetable_viewer.html` で `tools/output/` 内の生成済みJSONを確認できます。

```bash
cd tools
python3 -m http.server 8080
# http://localhost:8080/timetable_viewer.html
```

公開版の時刻表一覧は `public/timetable.html`（`public/data/segments/` のJSONを読み込み）です。

## データ形式

### segments/*.json

各区間の時刻表データ。PDFから `tools/parsers/` のスクリプトで自動生成。

```json
{
  "meta": {
    "valid_from": "2026-04-01",
    "valid_until": "2026-04-24",
    "operator": "JAISTシャトルバス",
    "note": "..."
  },
  "routes": [
    {
      "id": "komatsu_outbound",
      "name": "小松線（大学 → 小松駅）",
      "stops": ["JAIST", "小松駅"],
      "schedules": {
        "weekday": [["6:45", "7:20"], ...],
        "weekend": [["6:45", "7:20"], ...]
      }
    }
  ]
}
```

### routes.json

ルート定義。セグメントの組み合わせで直通・乗換ルートを構成。

- `segment_files`: セグメント定義（JSONファイル、GeoJSONファイル、交通種別、方向マッピング）
- `direct_routes`: 単一セグメントの直通ルート
- `multi_routes`: 複数セグメントの乗換ルート（`from_stop`/`to_stop` で部分区間を指定可能）
- `walk_transfers`: 徒歩乗換の定義（例: 新西金沢駅 ↔ 西金沢駅）
- `geo_mappings`: GeoJSONのクリッピング設定

## 免責事項

- 本アプリはJAISTの公式サービスではありません
- 時刻表は公式PDFから自動抽出しており、誤りが含まれる可能性があります
- 小松空港→小松駅の時刻は推定値です
- マップ上の経路・停車位置は推測に基づきます
- 正確な運行情報は各交通機関の公式サイトをご確認ください

## 開発

[JAIST Techサークル](https://www.jaist.ac.jp/misc/circles/tech/)
