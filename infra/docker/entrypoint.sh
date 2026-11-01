#!/bin/sh
# Role entrypoint for the one image. Usage: entrypoint.sh <web|api|worker|migrate|cli> [args]
set -eu
role="${1:-api}"
shift || true

case "$role" in
  api)     cd /app/api && exec node dist/main.js ;;
  worker)  cd /app/api && exec node dist/worker/main.js ;;
  web)     cd /app/web && exec node apps/web/server.js ;;
  migrate) cd /app/api && exec node_modules/.bin/prisma migrate deploy ;;
  cli)     cd /app/api && exec node dist/cli/main.js "$@" ;;
  *)       echo "Unknown role '$role'. Use web, api, worker, migrate or cli." >&2; exit 2 ;;
esac
