<!-- doc-kind: guide -->
# ブランチの分け方とマージの順番

dx-timetable は，時刻表のデータの更新と機能の追加を別のブランチで扱う．
main は GitHub Pages と Vercel に紐づくため，main へのマージ・push はユーザーが確認して承認する．

## ブランチ

| ブランチ | 起点 | 内容 | 触るファイル |
|---|---|---|---|
| `auto/timetable-日付` | main | 時刻表のデータと自動更新の仕組み（監視・解析・検査・のみバス取得・メール通知） | `public/data/manifest.json`，`public/data/regular/`，`tools/watch/`，`tools/nomibus/`，`tools/parsers/`，`tools/admin/parser_adapter.py` |
| `feature/route-search` | main | のみバスを含む経路検索（route.html・planner.js・運賃・地図・徒歩の乗換・試験・設計の文書） | `public/route.html`，`public/js/`，`public/css/`，`public/data/fares.json`，`public/data/routes.json`，`public/data/route/`，`public/data/geo/`，`tools/route/`，`tests/`，`docs/` |
| `dev` | main | 上の 2 つが混ざった従来のブランチ．消さずに残す（以後は新しい変更を入れない） | 両方 |

両ブランチが変更するファイルは `.gitignore` だけで，行の位置を離してあり衝突しない．
経路検索が読む `fares.json`・`stops.json`・`walk.json` などは機能のブランチだけが変更する．

## マージの順番

1. 時刻表のブランチと機能のブランチは，どちらを先にマージしてもよい．
2. 機能のブランチは時刻表のデータのファイルを変更しないため，後からマージしても main の新しい時刻表はそのまま残り，過去のデータには戻らない．
3. 両方をマージしたあと，`python3 tools/route/rebuild.py` を実行して座標表とデータのバージョン（`public/data/route/version.json`）を作り直し，変更があれば commit する．

手順 3 が要る理由は，`version.json` が時刻表のデータの内容から計算される値であるため．
機能のブランチが main に入った後は，時刻表の自動更新（`tools/watch/apply.py`）が反映のたびに `rebuild.py` を呼ぶため，この手順は不要になる．

## 時刻表の自動更新

- 共有サーバーの cron（月・木 09:00）が `tools/watch/run_local.sh` を実行する．
- 起点は手元の main で，変化があるときだけ `auto/timetable-日付` の新しいブランチを作って commit する（push しない）．
- ユーザーがプレビューで確認して push し，GitHub で main への PR を作り，承認してマージする．
- 手元の main が GitHub の main より古いと，古い起点でブランチが作られる．main を更新してから実行されるよう，ユーザーが main を取り込んだ後に確認する．
