# dev の push と Vercel プレビューの手順

## 要約

dev を GitHub に push し，`public/` を Vercel に Basic 認証つきで配備すると，共同編集者に URL と合言葉を渡して意見をもらえる．組織のリポジトリを Vercel に連携せず CLI で配備するため，組織の権限は要らない．

| 項目 | 内容 |
|---|---|
| push 先 | `origin`（jaist-tech/dx-timetable）の `dev`（main への push ではないため GitHub Pages は更新されない） |
| 配備 | `tools/preview/deploy.sh`（Git の外のフォルダにコピーして `vercel deploy`） |
| 公開範囲 | URL を知り，合言葉を知る人だけ（Basic 認証．noindex） |

あなたの作業: 下の手順 1〜4 を共有サーバーのターミナルで実行し，URL と合言葉を共同編集者に伝える．

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

3. Basic 認証の合言葉を環境変数に設定する．先にプロジェクトを作るため，最初の配備はエラー（503 の画面）で構わない．

```bash
cd ~/project/dx-timetable
./tools/preview/deploy.sh
```

続けて，ユーザー名と合言葉を入力して設定する（入力は画面に出ない．2 回打つと置き換える）．

```bash
cd ~/project/tmp/dx-timetable-preview
printf 'ユーザー名: '; read -r U
printf '合言葉: '; read -rs P; echo
for n in BASIC_AUTH_USER BASIC_AUTH_PASS; do ~/.local/bin/vercel env rm "$n" production --yes >/dev/null 2>&1 || true; done
printf '%s' "$U" | ~/.local/bin/vercel env add BASIC_AUTH_USER production
printf '%s' "$P" | ~/.local/bin/vercel env add BASIC_AUTH_PASS production
```

4. 環境変数を反映して再配備し，認証が掛かっていることを確かめる．

```bash
cd ~/project/dx-timetable
./tools/preview/deploy.sh
curl -sI https://dx-timetable-preview.vercel.app/ | head -1
```

2 行目が `401` なら認証が有効（Vercel の URL は配備の出力の Production に表示される）．

## 更新するとき

dev に commit した後，手順 2（`git push`）と手順 4 の `./tools/preview/deploy.sh` を再実行する．

## 注意

- 配備されるのは `public/` の内容だけで，`tools/` や `tests/` は含まれない．
- Vercel の Hobby の無料枠でも使える．アカウントは `satom7f`（CLI のログイン済み）．
- 認証を外して誰でも見られるようにする場合は，公開前に security-audit の要否を確認する．
- プレビューを止めるときは `~/.local/bin/vercel remove dx-timetable-preview --yes` を実行する．
- main への merge（GitHub Pages の本番更新）は別の作業で，この手順には含まれない．
