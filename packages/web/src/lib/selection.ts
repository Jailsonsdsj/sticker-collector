import { useCallback, useMemo, useState } from "react";

/**
 * A set of selected ids, for the bulk actions.
 *
 * Selection is by **task**, not by row. Home rows are occurrences — one routine
 * appears on several days — while `bulk-delete` and `bulk-duplicate` take task
 * ids. Keying on the task means tapping Monday's "Stretch" marks every Stretch
 * row, so the blast radius is on screen before the action, rather than several
 * rows vanishing at once afterwards.
 */
export interface Selection {
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

export function useSelection(): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const has = useCallback((id: string) => selected.has(id), [selected]);

  // Sorted so the request body is stable — two identical selections produce
  // the same payload, which matters for the idempotency key.
  const ids = useMemo(() => [...selected].sort(), [selected]);

  return { ids, count: ids.length, has, toggle, clear };
}
