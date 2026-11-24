#!/bin/bash
# cron から呼ぶ入口（月・木 09:00）: 0 9 * * 1,4 ~/project/dx-timetable/tools/watch/run_local.sh
# リポジトリのルート（このファイルの 2 つ上）で，手元のコードの run_local.py を実行する
cd "$(dirname "$0")/../.." || exit 1
exec ~/.local/bin/uv run --with pdfplumber --with pandas python tools/watch/run_local.py "$@" >> ~/project/tmp/dx-timetable-watch.log 2>&1
