import { sha256Base64 } from "./crypto";

// Auth rate limit: 10 attempts per 15-minute window per hashed IP (architecture.md §4.4).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Atomically records one attempt and reports whether the caller is now over the
// limit. The check lives inside the SQL upsert (INSERT … ON CONFLICT … RETURNING),
// so concurrent requests cannot race past the cap — same shape as spend() (§4.3).
export async function recordAuthAttempt(
  db: D1Database,
  ip: string,
  now: number = Date.now(),
): Promise<{ overLimit: boolean; count: number }> {
  const windowStart = Math.floor(now / WINDOW_MS);
  const ipHash = await sha256Base64(new TextEncoder().encode(ip));

  const row = await db
    .prepare(
      `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(ipHash, windowStart)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return { overLimit: count > MAX_ATTEMPTS, count };
}
