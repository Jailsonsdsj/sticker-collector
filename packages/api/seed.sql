-- Sample data for local development (applied by scripts/seed.sh after migrations).
-- Inserted in FK-safe order: user -> album -> epic -> tasks (stickers come later,
-- from scripts/seed-images.mjs — see below).
-- image_key / cover_key are placeholders ONLY until scripts/seed-images.mjs runs:
-- seed.sh generates real JPEGs, stores them in local R2, and UPDATEs these rows to
-- the content-addressed keys. The key is the sha256 of the bytes, so it cannot be
-- written down here. Load this file through scripts/seed.sh, never on its own.
-- weekday mask bit semantics are defined by shared/recurrence.ts (T-01); any 0-127 is valid here.

-- one user, loginable with the DEV passphrase "sticker-dev" (local only).
-- auth_key_hash = base64(sha256(deriveAuthKey("sticker-dev", kdf_salt, 600000))) —
-- the same PBKDF2-SHA256 flow the browser runs (packages/shared/src/kdf.ts).
-- The salt is fixed so this credential is reproducible; regenerate all three values
-- together if you change the passphrase.
INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES
  ('user_local', 'pMs8n+YdPFcBtu0axJ1+HyzMOcBAo0NI5poUB5TbY6k=', 'U3RpY2tlckRldlNhbHQwMQ==', 600000, 'Europe/Lisbon', '2026-07-01T00:00:00Z');

-- one sealed album, locked (unlocked_at NULL). Odds sum to 100; prices rise by tier.
INSERT INTO album (
  id, user_id, title, description, cover_key,
  unlock_price, random_price,
  price_common, price_rare, price_epic, price_legendary,
  odds_common, odds_rare, odds_epic, odds_legendary,
  sealed_at, created_at
) VALUES (
  'album_forest', 'user_local', 'Forest Friends', 'A starter album of woodland creatures.', 'img/seed-cover-forest.jpg',
  200, 25,
  10, 30, 75, 200,
  60, 25, 12, 3,
  '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
);

-- The 12 sticker rows are NOT here. They are inserted by scripts/seed-images.mjs,
-- because their image_key is the sha256 of bytes that do not exist until it runs,
-- and `sticker_frozen` aborts every UPDATE on the table — so a sticker row has
-- exactly one chance to carry the right key. Same tier mix as before:
-- 6 common / 3 rare / 2 epic / 1 legendary, slots 0-11.

-- one epic, with the album as its coin goal.
INSERT INTO epic (id, user_id, title, accent, coin_goal_album_id, created_at) VALUES
  ('epic_health', 'user_local', 'Get Healthy', '#2f855a', 'album_forest', '2026-07-01T00:00:00Z');

-- 3 routines (weekday masks) + 2 one-offs (due_at). reward defaults to effort.
INSERT INTO task (
  id, user_id, epic_id, title, description, effort_minutes, reward_coins,
  priority, type, weekdays, starts_on, due_at, created_at
) VALUES
  ('task_run',    'user_local', 'epic_health', 'Morning run',     '3km around the park',  30, 30, 'medium', 'routine', 62,  '2026-07-01', NULL, '2026-07-01T00:00:00Z'),
  ('task_read',   'user_local', NULL,          'Read 20 pages',   NULL,                   30, 30, 'low',    'routine', 127, '2026-07-01', NULL, '2026-07-01T00:00:00Z'),
  ('task_tidy',   'user_local', 'epic_health', 'Tidy the desk',   NULL,                   15, 15, 'low',    'routine', 62,  '2026-07-01', NULL, '2026-07-01T00:00:00Z'),
  ('task_taxes',  'user_local', NULL,          'File Q3 taxes',   'Before the deadline',  90, 90, 'high',   'oneoff',  NULL, NULL,        '2026-07-31T17:00:00Z', '2026-07-01T00:00:00Z'),
  ('task_dentist','user_local', NULL,          'Book dentist',    NULL,                   15, 15, 'medium', 'oneoff',  NULL, NULL,        '2026-07-15T09:00:00Z', '2026-07-01T00:00:00Z');

-- Fifty days of history for "Read 20 pages" (weekday mask 127, so every day is
-- scheduled), and the ledger rows that paid for them.
--
-- Without this the wallet is zero and the sample data is unusable: the seeded
-- album costs 200 to unlock, so a fresh `pnpm seed` left nothing in the app
-- reachable. It also gives the reports screen something to draw.
--
-- Dates are relative to `now`, not written down, so every row stays in the past
-- however long from now the seed is run. A future-dated `done` row would be a
-- lie the whole occurrence model is built to avoid.
--
-- History starts TWO days back, not one. `date('now')` is UTC, while the app
-- reads "today" in the user's timezone — so with a westward offset the seed's
-- "yesterday" IS the user's today, and a fixture quietly becomes today's work.
-- Skipping a day puts every seeded completion beyond the reach of any offset.
--
-- The coin snapshot is 30 — the task's reward at the time — and the ledger is
-- the only place the balance exists (SUM(ledger)); there is no balance column
-- to keep in step.
INSERT INTO occurrence (id, task_id, scheduled_on, status, completed_at, reward_snapshot_coins)
WITH RECURSIVE day(n) AS (SELECT 2 UNION ALL SELECT n + 1 FROM day WHERE n < 51)
SELECT
  'occ_seed_' || n,
  'task_read',
  date('now', '-' || n || ' day'),
  'done',
  strftime('%Y-%m-%dT20:00:00Z', 'now', '-' || n || ' day'),
  30
FROM day;

INSERT INTO ledger (id, user_id, amount_coins, reason, occurrence_id, created_at)
SELECT
  'led_seed_' || o.id,
  'user_local',
  o.reward_snapshot_coins,
  'task_reward',
  o.id,
  o.completed_at
FROM occurrence o
WHERE o.id LIKE 'occ_seed_%';
