import type { AlbumDraft } from "./albumDraft";

/**
 * The album draft, on disk in the browser.
 *
 * An album is sealed on creation, so until the POST lands the *entire*
 * arrangement — every price, every tier assignment, every uploaded key — exists
 * only in this tab. A refresh, a crashed tab or a phone that decided to reclaim
 * memory would otherwise take all of it. localStorage would technically do, but
 * IndexedDB survives eviction pressure better and does not block the main
 * thread while writing.
 *
 * There is exactly one draft. A second concurrent wizard is not a use case for
 * a single-user app, and pretending otherwise would mean a draft list UI that
 * nothing asks for.
 */
const DB_NAME = "sticker-collector";
const STORE = "drafts";
const DRAFT_KEY = "album-draft";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      })
      .catch(reject);
  });
}

export async function saveDraft(draft: AlbumDraft): Promise<void> {
  await run("readwrite", (store) => store.put(draft, DRAFT_KEY));
}

/**
 * The stored draft, or `null` when there is none.
 *
 * Anything unreadable is treated as "none". A half-written record from a tab
 * that died mid-save must not be able to crash the wizard on the way in — the
 * cost of discarding it is one lost draft, and the cost of throwing is a screen
 * the user cannot open at all.
 */
export async function loadDraft(): Promise<AlbumDraft | null> {
  try {
    const stored = await run<AlbumDraft | undefined>("readonly", (store) => store.get(DRAFT_KEY));
    return isDraft(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(DRAFT_KEY));
  } catch {
    // A draft that cannot be cleared is not worth failing a successful seal for.
  }
}

/** Structural check only — enough to know the record is a draft and not debris. */
function isDraft(value: unknown): value is AlbumDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<AlbumDraft>;
  return (
    typeof draft.title === "string" &&
    Array.isArray(draft.stickers) &&
    typeof draft.prices === "object" &&
    draft.prices !== null &&
    typeof draft.odds === "object" &&
    draft.odds !== null
  );
}
