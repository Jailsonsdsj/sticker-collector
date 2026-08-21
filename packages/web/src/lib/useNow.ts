import { useEffect, useState } from "react";

/**
 * A clock that re-renders.
 *
 * Nothing else in this app re-renders because time passed — a day is resolved
 * once per render and that has been enough. The agenda is the first screen
 * where standing still is wrong: the marker for "now" would sit where it was
 * when the tab was opened, quietly claiming you are still in the nine o'clock
 * block at eleven.
 *
 * **A minute, not a second.** The grid's smallest unit is an hour row, so a
 * per-second tick would re-render sixty times to move nothing, on a phone, in
 * a tab that is often left open.
 *
 * Aligned to the next whole minute rather than sixty seconds from mount, so
 * the marker moves when the clock does instead of at some arbitrary offset.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const align = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), intervalMs);
      },
      intervalMs - (Date.now() % intervalMs),
    );

    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
