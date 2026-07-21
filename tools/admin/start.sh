#!/bin/bash
# JAISTのりかえ - 管理者ツール起動スクリプト
# 使い方: bash tools/admin/start.sh
# 初回は .venv を自動作成して依存 (pdfplumber, pandas) をインストールします。
# 既存サーバが残っている場合は自動で掃除します。

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$HERE/../.." && pwd)"
VENV="$PROJECT_ROOT/.venv"
PYBIN="$VENV/bin/python"
REQ="$HERE/requirements.txt"

cd "$HERE"

# ---- venv の用意 (pdfplumber などをここに閉じ込める) ----
# 1) python 本体が無ければ venv を作成 (ensurepip が無い環境では --without-pip)
if [ ! -x "$PYBIN" ]; then
  echo "[admin] creating virtualenv at $VENV ..."
  python3 -m venv "$VENV" 2>/dev/null || { rm -rf "$VENV"; python3 -m venv --without-pip "$VENV"; }
fi

# 2) pip が無ければ ensurepip → get-pip.py の順でブートストラップ
if ! "$PYBIN" -m pip --version >/dev/null 2>&1; then
  echo "[admin] bootstrapping pip ..."
  "$PYBIN" -m ensurepip --upgrade >/dev/null 2>&1 || {
    curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$VENV/get-pip.py"
    "$PYBIN" "$VENV/get-pip.py"
  }
fi

# 3) 依存が揃っていなければインストール (requirements 追加時にも追従)
if ! "$PYBIN" -c "import pdfplumber, pandas" >/dev/null 2>&1; then
  echo "[admin] installing dependencies from requirements.txt ..."
  "$PYBIN" -m pip install -q -r "$REQ"
fi

# ---- Stale server cleanup ----
EXISTING_PID=$(ss -tlnp 2>/dev/null | awk '/127\.0\.0\.1:9001/ {match($0, /pid=([0-9]+)/, a); print a[1]}' | head -1)
if [ -n "$EXISTING_PID" ]; then
  echo "[admin] port 9001 is held by pid $EXISTING_PID, killing..."
  kill -9 "$EXISTING_PID" 2>/dev/null || true
  sleep 0.5
fi

echo "[admin] starting Python server on port 9001..."
echo "[admin] open: http://localhost:9001/"
exec "$PYBIN" server.py
