#!/usr/bin/env bash
#
# verify-triggers.sh — prove the F-03 database invariants actually fire, and that
# they fire *selectively*. A trigger that blocks everything is as broken as one
# that blocks nothing.
#
# Seeds a disposable fixture chain in the LOCAL D1 database (IDs are unique per
# run, so re-running never collides and never touches your existing local data),
# then:
#   * asserts every FORBIDDEN mutation is rejected (5 triggers, 2 CHECKs, 2 NOT NULLs)
#   * asserts every PERMITTED mutation still succeeds (append ledger, selective
#     album update, first snapshot write)
#
# Usage:  bash scripts/verify-triggers.sh
# Exit:   0 = every assertion held, 1 = at least one invariant is wrong.
#
set -uo pipefail
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
TS="2026-07-23T00:00:00Z"
RUN="vt_$(date +%s)_$$"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
FAILURES=0

run() { "$WRANGLER" d1 execute "$DB" --local --command "$1" >"$TMP" 2>&1; }

# strip ANSI + non-printables, then pull the DB's own rejection reason.
reason() {
  sed $'s/\x1b\\[[0-9;]*m//g' "$TMP" \
    | tr -cd '\11\12\15\40-\176' \
    | grep -iE 'SQLITE_|constraint failed|is (immutable|append-only|write-once)' \
    | head -1 \
    | sed -E 's/^[^[]*\[ERROR\][^A-Za-z]*//'
}

reject() { # $1 desc, $2 sql — must be rejected (non-zero exit)
  if run "$2"; then
    printf '  FAIL  %s\n        -> SUCCEEDED but should have been rejected\n' "$1"
    FAILURES=$((FAILURES + 1))
  else
    printf '  PASS  %s\n        rejected: %s\n' "$1" "$(reason)"
  fi
}

accept() { # $1 desc, $2 sql — must succeed (zero exit)
  if run "$2"; then
    printf '  PASS  %s\n' "$1"
  else
    printf '  FAIL  %s\n        -> REJECTED but should have succeeded:\n' "$1"
    sed 's/^/        /' "$TMP"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Ensuring local schema is present (0001_init)..."
"$WRANGLER" d1 migrations apply "$DB" --local >/dev/null 2>&1 || true

echo "Seeding fixture chain ($RUN)..."
# One atomic command: user -> album(sealed) -> sticker -> task -> occurrences -> ledger.
if ! run "
INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at)
 VALUES ('${RUN}_user','h','s',600000,'UTC','${TS}');
INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,
 price_common,price_rare,price_epic,price_legendary,
 odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at)
 VALUES ('${RUN}_album','${RUN}_user','A','img/c.jpg',100,10, 5,10,20,50, 60,25,12,3,'${TS}','${TS}');
INSERT INTO sticker (id,album_id,image_key,tier,slot_index)
 VALUES ('${RUN}_sticker','${RUN}_album','img/s.jpg','common',0);
INSERT INTO task (id,user_id,title,effort_minutes,reward_coins,priority,type,created_at)
 VALUES ('${RUN}_task','${RUN}_user','T',30,30,'medium','oneoff','${TS}');
INSERT INTO occurrence (id,task_id,scheduled_on,status,completed_at,reward_snapshot_coins)
 VALUES ('${RUN}_occ_set','${RUN}_task','2026-07-23','done','${TS}',30);
INSERT INTO occurrence (id,task_id,scheduled_on,status)
 VALUES ('${RUN}_occ_null','${RUN}_task','2026-07-24','pending');
INSERT INTO ledger (id,user_id,amount_coins,reason,created_at)
 VALUES ('${RUN}_ledger','${RUN}_user',30,'task_reward','${TS}');
"; then
  echo "SEED FAILED — cannot verify triggers:"
  sed 's/^/  /' "$TMP"
  exit 1
fi

echo
echo "FORBIDDEN — every one must be rejected:"
reject "ledger UPDATE                (ledger_no_update)" \
  "UPDATE ledger SET amount_coins=999 WHERE id='${RUN}_ledger';"
reject "ledger DELETE                (ledger_no_delete)" \
  "DELETE FROM ledger WHERE id='${RUN}_ledger';"
reject "sealed album random_price    (album_sealed_frozen)" \
  "UPDATE album SET random_price=999 WHERE id='${RUN}_album';"
reject "occurrence snapshot overwrite (occurrence_snapshot_write_once)" \
  "UPDATE occurrence SET reward_snapshot_coins=999 WHERE id='${RUN}_occ_set';"
reject "sticker UPDATE               (sticker_frozen)" \
  "UPDATE sticker SET slot_index=5 WHERE id='${RUN}_sticker';"
reject "album INSERT odds sum = 99   (CHECK album_odds_sum_100)" \
  "INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,price_common,price_rare,price_epic,price_legendary,odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at) VALUES ('${RUN}_a99','${RUN}_user','A','img/c.jpg',100,10,5,10,20,50,60,25,12,2,'${TS}','${TS}');"
reject "album INSERT odds = NULL     (NOT NULL on odds_*)" \
  "INSERT INTO album (id,user_id,title,cover_key,unlock_price,random_price,price_common,price_rare,price_epic,price_legendary,odds_common,odds_rare,odds_epic,odds_legendary,sealed_at,created_at) VALUES ('${RUN}_anull','${RUN}_user','A','img/c.jpg',100,10,5,10,20,50,NULL,NULL,NULL,NULL,'${TS}','${TS}');"
reject "holding INSERT quantity = 0  (CHECK holding_quantity_min_1)" \
  "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES ('${RUN}_h0','${RUN}_sticker',0,'${TS}');"
reject "holding INSERT quantity = NULL (NOT NULL on quantity)" \
  "INSERT INTO holding (id,sticker_id,quantity,first_acquired_at) VALUES ('${RUN}_hnull','${RUN}_sticker',NULL,'${TS}');"

echo
echo "PERMITTED — every one must succeed:"
accept "ledger append (new row)" \
  "INSERT INTO ledger (id,user_id,amount_coins,reason,album_id,created_at) VALUES ('${RUN}_ledger2','${RUN}_user',-100,'album_unlock','${RUN}_album','${TS}');"
accept "sealed album non-economic UPDATE (unlocked_at) *" \
  "UPDATE album SET unlocked_at='${TS}' WHERE id='${RUN}_album';"
accept "occurrence first snapshot write (was NULL)" \
  "UPDATE occurrence SET status='done', completed_at='${TS}', reward_snapshot_coins=30 WHERE id='${RUN}_occ_null';"

echo
echo "* album.sealed_at is NOT NULL (albums are sealed on create), so an 'unsealed"
echo "  album' cannot exist. Updating a NON-economic column on a SEALED album is the"
echo "  meaningful equivalent: it proves album_sealed_frozen fires only on price/odds"
echo "  columns, not on every UPDATE."
echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
  exit 0
fi
echo "${FAILURES} CHECK(S) FAILED"
exit 1
