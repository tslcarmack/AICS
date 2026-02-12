#!/bin/sh
set -e

echo "==> Running Prisma migrations..."
cd /app/apps/server
npx prisma migrate deploy
echo "==> Migrations complete."

echo "==> Starting server..."
cd /app
exec "$@"
