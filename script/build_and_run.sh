#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
PORT="${PORT:-3000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [ -x "$ROOT_DIR/.tools/node/bin/node" ]; then
  export PATH="$ROOT_DIR/.tools/node/bin:$PATH"
fi

stop_server() {
  local pids
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

health_check() {
  node -e "fetch('http://127.0.0.1:${PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

build_app() {
  npm run typecheck
}

launch_app() {
  npm run launch -- --port "$PORT" --auto-update-interval-ms 300000 "$@"
}

case "$MODE" in
  run)
    stop_server
    build_app
    launch_app
    ;;
  --debug|debug)
    stop_server
    build_app
    node --inspect ./src/cli/serve.js --port "$PORT" --auto-update-interval-ms 300000
    ;;
  --logs|logs)
    tail -f data/logs/server.log data/logs/server-error.log
    ;;
  --telemetry|telemetry)
    tail -f data/logs/auto_update_log.jsonl data/logs/decision_log.jsonl
    ;;
  --verify|verify)
    stop_server
    build_app
    launch_app --no-open
    sleep 1
    health_check
    echo "Bear Edge is healthy at http://127.0.0.1:${PORT}/dashboard"
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
