#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ -x "$PROJECT_DIR/.tools/node/bin/node" ]; then
  export PATH="$PROJECT_DIR/.tools/node/bin:$PATH"
fi

node "$PROJECT_DIR/src/cli/launch.js" --lan --no-open

echo
echo "Open the printed Bear Edge URL in Safari on your phone."
echo "Keep this Mac on the same Wi-Fi and leave the server running."
echo "Press Ctrl-C to stop the server."
read -r -p "Press Enter to close this window..." _
