<!-- doc-kind: manual -->
# ブランチの push と Vercel プレビューの手順

## 要約

:::message
main 以外のブランチを GitHub の origin（jaist-tech/dx-timetable）に push すると，Vercel の既存のプロジェクト dx-timetable（GitHub 連携済み）がブランチごとのプレビューの URL を発行する．別の Vercel プロジェクトや配備スクリプトは要らない．

| 項目 | 内容 |
|---|---|
| push 先 | `origin` の作業ブランチ（`feature/…` か `auto/timetable-日付`）．main ではないため GitHub Pages は更新されない |
| 配備 | Vercel の GitHub 連携が自動で行う |
| 閲覧する URL | PR に付く Vercel のコメントか，Vercel のダッシュボードのプロジェクト dx-timetable の Deployments に出る |

あなたの作業: 下の手順 1〜3 を共有サーバーのターミナルで実行し，表示された URL をブラウザで開く．
:::

## 手順

1. 共有サーバーのターミナルで，ブランチの状態を確認する（例は `feature/route-search`）．

```bash
cd ~/project/dx-timetable
git status -sb
git log --oneline origin/main..feature/route-search | wc -l
```

2. ブランチを push する（初回は `-u` を付けて origin にブランチを作る）．

```bash
cd ~/project/dx-timetable
git push -u origin feature/route-search
```

3. PR を作った後，Vercel のコメントからプレビューの URL を取り出す（`番号` は PR の番号）．

```bash
gh pr view 番号 --repo jaist-tech/dx-timetable --json comments --jq '.comments[].body' | grep -o -E 'https://[^ )"]*vercel\.app' | sort -u
```

## 注意

- URL は `https://dx-timetable-git-ブランチ名-satos-projects.vercel.app` の形になり，ブランチ名の `/` は `-` に置き換わる．
  - 例として，`auto/timetable-20261109` のプレビューは `https://dx-timetable-git-auto-timetable-20261109-satos-projects.vercel.app` だった．
- 手順を作る前に，Vercel の既存の連携を `~/.local/bin/vercel project ls` かダッシュボードで確認する．
  - 2026-10-14 に連携済みのプロジェクトがあるのに重複するプロジェクトを作ったため，削除した．
- 従来はブランチ `dev` を push してプレビューを見ていたが，`dev` は 2026-11-24 に削除した．
- main への merge（GitHub Pages の本番更新）は別の作業で，この手順には含まれない．
