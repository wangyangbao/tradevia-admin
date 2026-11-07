#!/bin/zsh
set -e
cd -- "$(dirname -- "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if curl -fsS --max-time 2 http://127.0.0.1:5173 2>/dev/null | /usr/bin/grep -q 'Tradevia'; then
  open http://127.0.0.1:5173
  exit 0
fi
if ! command -v npm >/dev/null 2>&1; then
  printf '请先安装 Node.js 22.12 或更新版本，再重新打开。\nPlease install Node.js 22.12 or later.\n'
  read -r
  exit 1
fi
if [ ! -d node_modules ]; then npm install; fi
npm run dev -- --open
