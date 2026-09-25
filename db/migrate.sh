#!/usr/bin/env bash
# Applies db/migrations/*.sql in order against $DATABASE_URL (defaults to the local
# docker-compose instance). Idempotent-ish: re-running against an already-migrated DB will
# fail loudly on the first CREATE TABLE, which is what you want during development.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://gbt:gbt_dev_only@localhost:5432/gbt}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in "$DIR"/migrations/*.sql; do
  echo "==> applying $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> creating app role"
# already applied via the loop above (0011_app_role.sql); kept idempotent, no-op if re-run.

echo "==> seeding demo data"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DIR/seed.sql"

echo "done."
