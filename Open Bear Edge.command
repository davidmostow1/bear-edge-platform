#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ -x "$PROJECT_DIR/.tools/node/bin/node" ]; then
  export PATH="$PROJECT_DIR/.tools/node/bin:$PATH"
fi

node "$PROJECT_DIR/src/cli/launch.js"

echo
echo "Bear Edge launch complete. You can close this window after the dashboard opens."
