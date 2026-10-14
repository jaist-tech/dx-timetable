# dev の push と Vercel プレビューの手順

## 要約

dev を GitHub に push し，`public/` を Vercel に認証なしで配備すると，URL を知る人が閲覧できる．組織のリポジトリを Vercel に連携せず CLI で配備するため，組織の権限は要らない．

| 項目 | 内容 |
|---|---|
| push 先 | `origin`（jaist-tech/dx-timetable）の `dev`（main への push ではないため GitHub Pages は更新されない） |
| 配備 | `tools/preview/deploy.sh`（Git の外のフォルダにコピーして `vercel deploy --prod`） |
| 公開範囲 | URL を知る人だけ（認証なし．noindex で検索には出さない） |

あなたの作業: 下の手順 1〜3 を共有サーバーのターミナルで実行し，表示された URL を共同編集者に伝える．

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

3. 配備して，認証なしで開けることを確かめる．

```bash
cd ~/project/dx-timetable
./tools/preview/deploy.sh
curl -sI https://dx-timetable-preview.vercel.app/ | head -1
```

2 行目が `200` なら共同編集者も開ける．共同編集者に渡す URL は `https://dx-timetable-preview.vercel.app/` である（出力の Production の行に表示される）．

## Vercel の保護について

Vercel の標準の保護（Vercel Authentication）は，配備ごとの URL（例: `…-abc123.vercel.app`）にログインを求める場合がある．
Hobby プランでは Production のドメインは保護の対象外であるため，`--prod` で配備して上の URL を渡せば，共同編集者は Vercel のアカウントなしで見られる．
根拠は [Deployment Protection on Vercel](https://vercel.com/docs/security/deployment-protection) の Hobby の記述である．
もし 3 の `curl` が 401 や 403 なら，Vercel のダッシュボードのプロジェクト設定 Deployment Protection で Vercel Authentication を無効にする．

## 更新するとき

dev に commit した後，手順 2（`git push`）と手順 3 の `./tools/preview/deploy.sh` を再実行する．

## 注意

- 配備されるのは `public/` の内容だけで，`tools/` や `tests/` は含まれない．
- Vercel は Hobby の無料枠で使え，CLI は `satom7f` のアカウントでログイン済みである．
- 公開されるのは `public/` の内容で，秘密情報・個人情報は含まれないことを 2026-10-14 に確認した．
- プレビューを止めるときは `~/.local/bin/vercel remove dx-timetable-preview --yes` を実行する．
- main への merge（GitHub Pages の本番更新）は別の作業で，この手順には含まれない．
