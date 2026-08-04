#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ -x "$PROJECT_DIR/.tools/node/bin/node" ]; then
  export PATH="$PROJECT_DIR/.tools/node/bin:$PATH"
fi

BEAR_EDGE_OPERATOR_TOKEN= node "$PROJECT_DIR/src/cli/launch.js" --lan --no-open

echo
echo "Open the printed Bear Edge URL in Safari on your phone."
echo "Keep this Mac on the same Wi-Fi and leave the server running."
echo "This launcher starts Bear Edge as a detached background process."
echo "This phone launch uses a process-scoped bootstrap instead of the configured long-lived operator credential."
echo "If the bootstrap is lost, stop the server process explicitly and launch again."
read -r -p "Press Enter to close this window..." _
