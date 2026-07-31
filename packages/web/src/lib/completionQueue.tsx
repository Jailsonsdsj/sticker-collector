import type { LocalDate } from "@sticker-collector/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Toast, ToastViewport } from "../components/ui";

/**
 * The undo window.
 *
 * "Completing is reversible for a few seconds — a misclick must not silently
 * pay coins" (prd/02-tasks.md §Enhancements). The important half of that is
 * **undo inside the window writes nothing**, which rules out the usual
 * optimistic-mutation-with-rollback: that issues the request immediately and
 * reverses it afterwards, leaving two ledger rows behind.
 *
 * So a completion is DEFERRED, not rolled back. The UI moves at once — the row
 * ticks, the balance rises — while the request waits out the window. Undo
 * clears the timer and the request never happens at all.
 *
 * The queue lives above the router so switching tabs mid-window cannot drop a
 * pending completion, and it flushes on unmount rather than discarding, because
 * silently losing someone's coins is worse than sending slightly early.
 */
/**
 * How long a completion stays reversible — and, because the toast IS the
 * window, how long the toast is on screen. There is one timer, not two.
 *
 * Shortened from 5s: five seconds of a banner sitting over the tab bar after
 * every single tick is a long time when you are completing several tasks in a
 * row, and the toasts stack. Three is still comfortably long enough to catch
 * the tap you did not mean — the case the window exists for — without the
 * reward turning into something you wait out.
 */
export const UNDO_WINDOW_MS = 3000;

export interface CompletionRef {
  taskId: string;
  scheduledOn: LocalDate;
}

interface Pending {
  ref: CompletionRef;
  title: string;
  coins: number;
}

interface QueueValue {
  /** Schedules a completion. The request fires when the window closes. */
  complete: (ref: CompletionRef, options: { title: string; coins: number }) => void;
  /** Cancels a scheduled completion. Nothing is ever sent. */
  cancel: (ref: CompletionRef) => void;
  isPending: (ref: CompletionRef) => boolean;
  /** Coins the wallet should already be showing, though the server has not been told. */
  pendingCoins: number;
}

const keyOf = (ref: CompletionRef) => `${ref.taskId} ${ref.scheduledOn}`;

const QueueContext = createContext<QueueValue | null>(null);

export function usePendingCompletions(): QueueValue {
  const value = useContext(QueueContext);
  if (!value) throw new Error("usePendingCompletions used outside CompletionQueueProvider");
  return value;
}

export function CompletionQueueProvider({
  children,
  onCommit,
}: {
  children: ReactNode;
  /** Issues the actual completion. Called once per occurrence, after the window. */
  onCommit: (ref: CompletionRef) => Promise<unknown>;
}) {
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Kept in a ref so the unmount flush below can read the latest queue without
  // re-registering — and therefore re-running — the cleanup on every change.
  const latest = useRef({ pending, onCommit });
  latest.current = { pending, onCommit };

  const forget = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
    setPending(({ [key]: _gone, ...rest }) => rest);
  }, []);

  const complete = useCallback<QueueValue["complete"]>((ref, { title, coins }) => {
    const key = keyOf(ref);
    if (timers.current.has(key)) return; // already scheduled; do not double-book

    setPending((prev) => ({ ...prev, [key]: { ref, title, coins } }));
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        setPending(({ [key]: _done, ...rest }) => rest);
        void latest.current.onCommit(ref);
      }, UNDO_WINDOW_MS),
    );
  }, []);

  const cancel = useCallback<QueueValue["cancel"]>((ref) => forget(keyOf(ref)), [forget]);

  const isPending = useCallback<QueueValue["isPending"]>((ref) => keyOf(ref) in pending, [pending]);

  // Flush, do not discard: the user ticked these and expects the coins.
  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      for (const item of Object.values(latest.current.pending)) {
        void latest.current.onCommit(item.ref);
      }
    };
  }, []);

  const items = Object.entries(pending);
  const pendingCoins = items.reduce((sum, [, item]) => sum + item.coins, 0);

  return (
    <QueueContext.Provider value={{ complete, cancel, isPending, pendingCoins }}>
      {children}
      <ToastViewport>
        {items.map(([key, item]) => (
          <Toast
            key={key}
            tone="earn"
            title={`+${item.coins} coins`}
            action={
              <Button variant="ghost" tone="lime" size="sm" onClick={() => forget(key)}>
                Undo
              </Button>
            }
          >
            {item.title}
          </Toast>
        ))}
      </ToastViewport>
    </QueueContext.Provider>
  );
}
