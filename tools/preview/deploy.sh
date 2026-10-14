#!/bin/sh
# public/ を Git の外のフォルダにコピーして Vercel に配備する（リポジトリ内で配備すると GitHub と自動連携するため）．
set -eu
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DST="${HOME}/project/tmp/dx-timetable-preview"
mkdir -p "$DST/site"
rsync -a --delete "$SRC/public/" "$DST/site/"
cp "$SRC/tools/preview/middleware.ts" "$SRC/tools/preview/vercel.json" "$DST/"
cd "$DST"
[ -d .vercel ] || ~/.local/bin/vercel link --yes --project dx-timetable-preview
~/.local/bin/vercel deploy --prod --yes
