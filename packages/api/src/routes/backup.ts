import {
  BACKUP_VERSION,
  type BackupManifest,
  backupManifestSchema,
  type RestoreResult,
} from "@sticker-collector/shared";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { album, epic, holding, ledger, occurrence, sticker, task, user } from "../db/schema";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

export const backupRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

backupRoutes.use("*", requireAuth);

/**
 * D1 binds at most 100 parameters per statement (see A-03). A restore inserts
 * whole rows, and a task row is 16 columns, so the safe chunk is small.
 */
const MAX_PARAMS = 100;

/**
 * D1's parameter ceiling applies to reads as much as writes: `IN (?, ?, …)`
 * with 200 ids is 200 variables, and the query is rejected outright. Every
 * scoped SELECT below goes through this.
 */
async function selectIn<T>(ids: string[], run: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += MAX_PARAMS) {
    results.push(...(await run(ids.slice(i, i + MAX_PARAMS))));
  }
  return results;
}

function chunkFor<T extends Record<string, unknown>>(rows: T[]): T[][] {
  if (rows.length === 0) return [];
  const columns = Math.max(1, Object.keys(rows[0] as object).length);
  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / columns));

  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += perStatement) chunks.push(rows.slice(i, i + perStatement));
  return chunks;
}

/**
 * GET /api/backup/manifest
 *
 * Every table this user owns, plus the keys of every image the data references.
 * The images are the irreplaceable half — originals are discarded on import —
 * so a data-only backup is not a backup (`architecture.md` §9). The client
 * fetches them and zips the lot.
 */
backupRoutes.get("/manifest", async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");

  const owner = await database
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!owner) return c.json({ error: "not found" }, 404);

  const [epics, tasks, albums] = await Promise.all([
    database.select().from(epic).where(eq(epic.userId, userId)),
    database.select().from(task).where(eq(task.userId, userId)),
    database.select().from(album).where(eq(album.userId, userId)),
  ]);

  // Occurrences, stickers and holdings hang off the rows above rather than off
  // the user, so they are scoped through their parents.
  const taskIds = tasks.map((row) => row.id);
  const albumIds = albums.map((row) => row.id);

  const occurrences = await selectIn(taskIds, (batch) =>
    database.select().from(occurrence).where(inArray(occurrence.taskId, batch)),
  );
  const stickers = await selectIn(albumIds, (batch) =>
    database.select().from(sticker).where(inArray(sticker.albumId, batch)),
  );
  const holdings = await selectIn(
    stickers.map((row) => row.id),
    (batch) => database.select().from(holding).where(inArray(holding.stickerId, batch)),
  );

  const entries = await database.select().from(ledger).where(eq(ledger.userId, userId));

  // Covers and stickers alike. Deduplicated: a derived edition shares keys with
  // its source, and the client fetches one copy of each.
  const imageKeys = [
    ...new Set([...albums.map((row) => row.coverKey), ...stickers.map((row) => row.imageKey)]),
  ];

  const body: BackupManifest = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    // Deliberately only the timezone. The passphrase hash and its KDF params are
    // credentials, and restoring them would defeat the recovery story they exist
    // to support.
    user: { timezone: owner.timezone },
    epics,
    tasks,
    occurrences,
    ledger: entries,
    albums,
    stickers,
    holdings,
    imageKeys,
  };
  return c.json(body);
});

/**
 * POST /api/backup/restore
 *
 * The same flow reversed — but only into an account that holds nothing.
 *
 * It cannot be otherwise. `ledger_no_delete` aborts every DELETE on the ledger,
 * so clearing it is impossible by design, and dropping the trigger to make a
 * restore work would trade the app's central invariant for a convenience. That
 * matches the spec's own recovery story anyway: a lost passphrase or an evicted
 * browser is restored into a *fresh* instance.
 *
 * Every row is given a **fresh id** and every reference rewritten to match, so a
 * backup restores into any database rather than only an empty one. `user_id`
 * becomes whoever is authenticated, which is what makes a backup portable
 * between deployments.
 */
backupRoutes.post("/restore", idempotency, async (c) => {
  const database = db(c.env);
  const userId = c.get("userId");

  const parsed = backupManifestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "not a backup file", issues: parsed.error.issues }, 400);
  }

  const existing = await database
    .select({ id: ledger.id })
    .from(ledger)
    .where(eq(ledger.userId, userId))
    .limit(1);
  const existingTasks = await database
    .select({ id: task.id })
    .from(task)
    .where(eq(task.userId, userId))
    .limit(1);

  if (existing.length > 0 || existingTasks.length > 0) {
    // A clear refusal, not a trigger abort five statements later.
    return c.json(
      {
        error:
          "This account already holds data. A restore replaces everything, and the ledger is append-only — restore into a fresh account instead.",
      },
      409,
    );
  }

  const manifest = parsed.data;

  /**
   * Every row gets a **new id**, and every reference is rewritten to match.
   *
   * Keeping the original ids seems tidier and is a trap: a backup restored into
   * a database that still holds anything with those ids — another account, a
   * partially seeded instance — collides on the primary key and the whole
   * restore aborts. Remapping makes a restore work against any database, and
   * nothing user-visible depends on an id.
   */
  const remap = new Map<string, string>();
  const idFor = (original: unknown): string => {
    const key = String(original);
    const existing = remap.get(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    remap.set(key, fresh);
    return fresh;
  };
  /** A reference that may legitimately be null (an unassigned epic, say). */
  const refTo = (original: unknown): string | null =>
    original === null || original === undefined ? null : idFor(original);

  // Ids are minted parent-first so a child's reference resolves to the same
  // new id its parent was given.
  const epics = manifest.epics.map((row) => ({ ...row, id: idFor(row.id), userId }));
  const tasks = manifest.tasks.map((row) => ({
    ...row,
    id: idFor(row.id),
    userId,
    epicId: refTo(row.epicId),
  }));
  const albums = manifest.albums.map((row) => ({
    ...row,
    id: idFor(row.id),
    userId,
    derivedFromAlbumId: refTo(row.derivedFromAlbumId),
  }));
  const stickers = manifest.stickers.map((row) => ({
    ...row,
    id: idFor(row.id),
    albumId: idFor(row.albumId),
  }));
  const occurrences = manifest.occurrences.map((row) => ({
    ...row,
    id: idFor(row.id),
    taskId: idFor(row.taskId),
  }));
  const holdings = manifest.holdings.map((row) => ({
    ...row,
    id: idFor(row.id),
    stickerId: idFor(row.stickerId),
  }));
  const entries = manifest.ledger.map((row) => ({
    ...row,
    id: idFor(row.id),
    userId,
    occurrenceId: refTo(row.occurrenceId),
    albumId: refTo(row.albumId),
    stickerId: refTo(row.stickerId),
  }));

  // Parents before children: epic → task → occurrence, album → sticker →
  // holding. The ledger references occurrences, so it lands last.
  const statements = [
    ...chunkFor(epics).map((rows) => database.insert(epic).values(rows as never)),
    ...chunkFor(tasks).map((rows) => database.insert(task).values(rows as never)),
    ...chunkFor(occurrences).map((rows) => database.insert(occurrence).values(rows as never)),
    ...chunkFor(albums).map((rows) => database.insert(album).values(rows as never)),
    ...chunkFor(stickers).map((rows) => database.insert(sticker).values(rows as never)),
    ...chunkFor(holdings).map((rows) => database.insert(holding).values(rows as never)),
    ...chunkFor(entries).map((rows) => database.insert(ledger).values(rows as never)),
  ];

  if (statements.length > 0) {
    // One batch: a half-restored account is worse than a failed restore.
    await database.batch(statements as unknown as Parameters<typeof database.batch>[0]);
  }

  await database.update(user).set({ timezone: manifest.user.timezone }).where(eq(user.id, userId));

  const body: RestoreResult = {
    restored: {
      epics: manifest.epics.length,
      tasks: manifest.tasks.length,
      occurrences: manifest.occurrences.length,
      ledger: manifest.ledger.length,
      albums: manifest.albums.length,
      stickers: manifest.stickers.length,
      holdings: manifest.holdings.length,
    },
  };
  return c.json(body, 201);
});
