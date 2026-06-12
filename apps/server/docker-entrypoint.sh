#!/bin/sh
set -e

echo "[entrypoint] applying prisma migrations..."
i=0
until bunx prisma migrate deploy --schema /app/apps/server/prisma/schema.prisma; do
  i=$((i+1))
  if [ "$i" -ge 15 ]; then
    echo "[entrypoint] db unreachable after 15 attempts, aborting" >&2
    exit 1
  fi
  echo "[entrypoint] db not ready, retry $i/15 in 2s..."
  sleep 2
done
echo "[entrypoint] migrations applied"

exec "$@"
