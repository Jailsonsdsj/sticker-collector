import type { Epic, EpicAccent, EpicStatus } from "@sticker-collector/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { album, epic, occurrence, task } from "../db/schema";

export type EpicRow = typeof epic.$inferSelect;

/**
 * The progress ratio, counting **one-off tasks only**.
 *
 * Routines are excluded because they never "finish" — including them would peg
 * every epic below 100% forever (prd/03-epics.md §Enhancements). Soft-deleted
 * tasks drop out of both sides.
 *
 * `COUNT(DISTINCT task.id)` on the done side, not `COUNT(*)`: an undated one-off
 * completed, re-opened and completed again on a different day leaves two rows,
 * and one task must never count twice.
 */
const PROGRESS_COLUMNS = {
  id: epic.id,
  title: epic.title,
  description: epic.description,
  accent: epic.accent,
  status: epic.status,
  coinGoalAlbumId: epic.coinGoalAlbumId,
  createdAt: epic.createdAt,
  oneOffTotal: sql<number>`COUNT(DISTINCT ${task.id})`,
  oneOffDone: sql<number>`COUNT(DISTINCT CASE WHEN ${occurrence.status} = 'done' THEN ${task.id} END)`,
};

function toEpic(row: {
  id: string;
  title: string;
  description: string | null;
  accent: string;
  status: string;
  coinGoalAlbumId: string | null;
  createdAt: string;
  oneOffTotal: number;
  oneOffDone: number;
}): Epic {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    accent: row.accent as EpicAccent,
    status: row.status as EpicStatus,
    coinGoalAlbumId: row.coinGoalAlbumId,
    createdAt: row.createdAt,
    oneOffTotal: Number(row.oneOffTotal),
    oneOffDone: Number(row.oneOffDone),
  };
}

function progressQuery(database: Db, userId: string) {
  return database
    .select(PROGRESS_COLUMNS)
    .from(epic)
    .leftJoin(task, and(eq(task.epicId, epic.id), eq(task.type, "oneoff"), isNull(task.deletedAt)))
    .leftJoin(occurrence, eq(occurrence.taskId, task.id))
    .where(eq(epic.userId, userId))
    .groupBy(epic.id);
}

export async function listEpics(database: Db, userId: string): Promise<Epic[]> {
  return (await progressQuery(database, userId)).map(toEpic);
}

export async function getEpic(database: Db, userId: string, id: string): Promise<Epic | null> {
  const rows = await progressQuery(database, userId).having(eq(epic.id, id));
  const row = rows[0];
  return row ? toEpic(row) : null;
}

/** True when the album exists and belongs to this user — so a bad coin goal
 *  returns 400 rather than a foreign-key 500. */
export async function ownsAlbum(database: Db, userId: string, albumId: string): Promise<boolean> {
  const rows = await database
    .select({ id: album.id })
    .from(album)
    .where(and(eq(album.id, albumId), eq(album.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
