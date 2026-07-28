import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { user } from "../db/schema";

/**
 * The user's IANA timezone — what "today" means for them.
 *
 * Every date decision in the app resolves through this, never through the
 * server's clock (architecture.md §0.3).
 */
export async function timeZoneOf(database: Db, userId: string): Promise<string | null> {
  const rows = await database
    .select({ timeZone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.timeZone ?? null;
}
