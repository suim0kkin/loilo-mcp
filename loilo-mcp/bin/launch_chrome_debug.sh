#!/usr/bin/env bash
set -euo pipefail

PORT=9222
USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome/LoiLoDebugProfile"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "========================================================"
echo "🚀 ロイロノート解析用 Chrome デバッグセッション起動"
echo "デバッグポート: $PORT"
echo "プロファイル保存先: $USER_DATA_DIR"
echo "========================================================"

if lsof -i :$PORT >/dev/null 2>&1; then
  echo "⚠️  ポート $PORT は既に使用されています。既存のプロセスを使用します。"
  exit 0
fi

# バックグラウンドでChromeを起動
"$CHROME_BIN" \
  --remote-debugging-port=$PORT \
  --user-data-dir="$USER_DATA_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://loilonote.app/login" >/dev/null 2>&1 &

CHROME_PID=$!
echo "✅ Chrome (PID: $CHROME_PID) を起動しました。"
echo "💡 ブラウザでロイロノートにログインし、ノート画面を開いてください。"
