# dx-timetable のエージェント向け規則

## main ブランチ

- main は GitHub Pages と Vercel に紐づくため，main へのマージ・更新・push は必ずユーザーの確認と承認を取ってから行う．
- main 以外のブランチの作成と，jaist-tech/dx-timetable への push は，ユーザーが頼んだ範囲で行ってよい．

## ブランチの分け方

- 時刻表のデータと自動更新の仕組みの変更は `auto/timetable-日付` のブランチに入れ，機能の変更は `feature/…` のブランチに入れる．
- 1 つのブランチに両方を混ぜない．分け方とマージの順番は `docs/branch-workflow.md` に書いてある．
