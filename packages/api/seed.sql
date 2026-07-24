-- Sample data for local development (applied by scripts/seed.sh after migrations).
-- Inserted in FK-safe order: user -> album -> stickers -> epic -> tasks.
-- image_key / cover_key are placeholders; real content-addressed R2 upload is A-02.
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

-- 12 stickers, slots 0-11, tier mix 6 common / 3 rare / 2 epic / 1 legendary.
INSERT INTO sticker (id, album_id, image_key, tier, slot_index) VALUES
  ('stk_forest_00', 'album_forest', 'img/seed-forest-00.jpg', 'common',    0),
  ('stk_forest_01', 'album_forest', 'img/seed-forest-01.jpg', 'common',    1),
  ('stk_forest_02', 'album_forest', 'img/seed-forest-02.jpg', 'common',    2),
  ('stk_forest_03', 'album_forest', 'img/seed-forest-03.jpg', 'common',    3),
  ('stk_forest_04', 'album_forest', 'img/seed-forest-04.jpg', 'common',    4),
  ('stk_forest_05', 'album_forest', 'img/seed-forest-05.jpg', 'common',    5),
  ('stk_forest_06', 'album_forest', 'img/seed-forest-06.jpg', 'rare',      6),
  ('stk_forest_07', 'album_forest', 'img/seed-forest-07.jpg', 'rare',      7),
  ('stk_forest_08', 'album_forest', 'img/seed-forest-08.jpg', 'rare',      8),
  ('stk_forest_09', 'album_forest', 'img/seed-forest-09.jpg', 'epic',      9),
  ('stk_forest_10', 'album_forest', 'img/seed-forest-10.jpg', 'epic',     10),
  ('stk_forest_11', 'album_forest', 'img/seed-forest-11.jpg', 'legendary', 11);

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
