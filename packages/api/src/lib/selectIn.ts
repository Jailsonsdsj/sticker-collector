/**
 * D1 binds at most 100 parameters per statement, and that ceiling applies to
 * **reads** as much as writes: `IN (?, ?, …)` with 120 ids is 120 variables and
 * the query is rejected outright with `too many SQL variables`.
 *
 * It is a real failure, not a theoretical one — the home screen's occurrence
 * window scopes itself by the user's live task ids, so the whole screen started
 * answering 500 on the day the ninety-ninth task was created. Nothing about the
 * request looks unusual, which is why the ceiling has to live in a helper
 * rather than in each caller's memory.
 *
 * `MAX_IDS` is 90, not 100: the callers below add their own binds — a date
 * range, a status, a user id — and a chunk sized exactly at the limit leaves no
 * room for them.
 */
const MAX_IDS = 90;

export async function selectIn<T>(
  ids: readonly string[],
  run: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const results: T[] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    results.push(...(await run([...ids.slice(i, i + MAX_IDS)])));
  }
  return results;
}

/** How many ids one statement may carry. Exported for the tests that prove the
 *  chunking happens at all. */
export const SELECT_IN_MAX_IDS = MAX_IDS;
