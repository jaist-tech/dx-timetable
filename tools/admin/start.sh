#!/bin/bash
# JAISTのりかえ - 管理者ツール起動スクリプト
# 使い方: bash tools/admin/start.sh
# 既存サーバが残っている場合は自動で掃除します。

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# Stale server cleanup
EXISTING_PID=$(ss -tlnp 2>/dev/null | awk '/127\.0\.0\.1:9001/ {match($0, /pid=([0-9]+)/, a); print a[1]}' | head -1)
if [ -n "$EXISTING_PID" ]; then
  echo "[admin] port 9001 is held by pid $EXISTING_PID, killing..."
  kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 0.5
fi

echo "[admin] starting Python server on port 9001..."
echo "[admin] open: http://localhost:9001/"
exec python3 server.py
