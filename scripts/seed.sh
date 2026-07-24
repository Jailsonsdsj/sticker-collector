#!/usr/bin/env bash
#
# seed.sh — reset the LOCAL D1 database and load sample data.
#
# Wipes local D1 state, re-applies every migration (schema + invariant triggers),
# loads packages/api/seed.sql, and prints a row-count summary so a schema drift
# that breaks an insert fails loudly rather than silently.
#
# Usage:  pnpm seed   (or: bash scripts/seed.sh)
# WARNING: this destroys any existing local D1 data. It never touches remote.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# wrangler needs Node >= 20.19 / 22. If the active node is older and nvm is
# available, switch to the repo's .nvmrc node.
node_major="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "${node_major:-0}" -lt 22 ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null 2>&1 || true
fi

export CLOUDFLARE_TELEMETRY_DISABLED=1
DB="sticker-collector"
WRANGLER="./node_modules/.bin/wrangler"

echo "Resetting local D1 ($DB)..."
rm -rf .wrangler/state/v3/d1

echo "Applying migrations (schema + triggers)..."
"$WRANGLER" d1 migrations apply "$DB" --local >/dev/null

echo "Loading sample data..."
"$WRANGLER" d1 execute "$DB" --local --file packages/api/seed.sql >/dev/null

echo "Verifying (row counts):"
# Single-row SELECT with scalar subqueries — D1 rejects wide compound SELECTs.
# Plain table output; wrangler renders it, no JSON parsing to go wrong.
"$WRANGLER" d1 execute "$DB" --local --command "
  SELECT
    (SELECT COUNT(*) FROM user)                          AS users,
    (SELECT COUNT(*) FROM epic)                          AS epics,
    (SELECT COUNT(*) FROM task WHERE type = 'routine')   AS routines,
    (SELECT COUNT(*) FROM task WHERE type = 'oneoff')    AS oneoffs,
    (SELECT COUNT(*) FROM album)                         AS albums,
    (SELECT COUNT(*) FROM sticker)                       AS stickers;
"

echo "Local D1 seeded."
