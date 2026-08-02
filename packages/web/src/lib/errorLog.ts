/**
 * What went wrong, kept where the user can read it back.
 *
 * A failed request used to surface only where a screen happened to catch it —
 * a form said "could not save" and everything else said nothing at all. This is
 * the other half: every failure is recorded once, at the only place a fetch is
 * written, and two things read it. A popup, for right now, and a list in
 * Settings, for "it did that again yesterday".
 *
 * Kept in `localStorage` because the interesting failures happen on a phone
 * that is not attached to a debugger. Surviving a reload is the entire point —
 * an in-memory log is empty by the time anyone thinks to look at it.
 */
export interface ApiErrorEntry {
  /** Milliseconds since the epoch. Rendered in the user's own timezone. */
  at: number;
  method: string;
  path: string;
  /** 0 when the request never reached the server at all. */
  status: number;
  message: string;
}

const STORAGE_KEY = "sc_error_log";

/**
 * How many are kept.
 *
 * A ring, not a growing list: a failing poll can produce hundreds in a minute,
 * and a storage quota exceeded while logging an error is a comedy nobody
 * needs. The newest fifty answer every question this log is for.
 */
export const ERROR_LOG_LIMIT = 50;

type Listener = (entries: ApiErrorEntry[]) => void;

const listeners = new Set<Listener>();

export function listErrors(): ApiErrorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ApiErrorEntry[]) : [];
  } catch {
    // Unreadable or unparseable — a corrupt log is not worth a crash on a
    // screen the user opened *because* something was already broken.
    return [];
  }
}

export function recordError(entry: Omit<ApiErrorEntry, "at"> & { at?: number }): ApiErrorEntry {
  const full: ApiErrorEntry = { at: entry.at ?? Date.now(), ...entry };
  // Newest first: the list is read from the top, and so is the ring's cut.
  const next = [full, ...listErrors()].slice(0, ERROR_LOG_LIMIT);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Full or disabled. The listeners still fire, so the popup still appears —
    // losing the history is better than losing the alert.
  }

  for (const listener of listeners) listener(next);
  return full;
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: an unwritable store had nothing in it either.
  }
  for (const listener of listeners) listener([]);
}

/** Fires on every new failure, with the whole log. Returns an unsubscribe. */
export function onError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
