import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * The typed query builder, per architecture.md §1.
 *
 * Auth and `spend()` predate this and stay on raw D1 statements: `spend()`'s
 * balance guard lives inside its SQL `WHERE` and must remain legible (§4.3),
 * and rewriting working auth buys nothing. Everything from T-03 onward is
 * Drizzle — partial updates over thirteen columns are exactly where
 * hand-assembled SQL strings go wrong.
 */
export function db(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof db>;
