# dev の push と Vercel プレビューの手順

## 要約

dev を GitHub の origin に push すると，Vercel の既存のプロジェクト dx-timetable（GitHub 連携済み）がブランチごとのプレビューの URL を発行する．別の Vercel プロジェクトや配備スクリプトは要らない．

| 項目 | 内容 |
|---|---|
| push 先 | `origin`（jaist-tech/dx-timetable）の `dev`（main への push ではないため GitHub Pages は更新されない） |
| 配備 | Vercel の GitHub 連携が自動で行う |
| 閲覧する URL | Vercel のダッシュボードのプロジェクト dx-timetable の Deployments で，ブランチ dev のプレビューを開く |

あなたの作業: 下の手順 1〜2 を共有サーバーのターミナルで実行し，ダッシュボードで dev のプレビューの URL を確認する．

## 手順

1. 共有サーバーのターミナルで，dev の状態を確認する．

```bash
cd ~/project/dx-timetable
git status -sb
git log --oneline origin/main..dev | wc -l
```

2. dev を push する（初回は origin に dev が無いため `-u` を付けて作る）．

```bash
cd ~/project/dx-timetable
git push -u origin dev
```

## 注意

- 手順を作る前に，Vercel の既存の連携を `~/.local/bin/vercel project ls` かダッシュボードで確かめる．
  - 2026-10-14 に連携済みのプロジェクトがあるのに重複するプロジェクトを作ったため，削除した．
- main への merge（GitHub Pages の本番更新）は別の作業で，この手順には含まれない．
