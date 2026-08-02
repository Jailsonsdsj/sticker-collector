import { useCallback, useState } from "react";

/**
 * Which home-screen sections are folded, remembered across visits.
 *
 * Storage holds only the sections the user has actually **toggled**, not the
 * full picture. The rest come from `SECTION_DEFAULTS` below, which means a
 * default can be changed later and will reach everyone who never expressed a
 * preference — storing the resolved state instead would freeze today's defaults
 * into every existing install.
 *
 * `localStorage` is the right home: which sections you keep folded on a phone is
 * not a fact about your account, and it should not follow you to another screen
 * or ride along in a backup.
 */
const KEY = "sc_section_open";

/**
 * Open unless there is a reason not to be.
 *
 * Missed and the routine backlog start folded because they are reference, not
 * work in hand: one is what already slipped, the other is a fortnight that has
 * not happened yet. Putting either above the fold pushes today's actual list
 * off the first screenful.
 */
export const SECTION_DEFAULTS: Record<string, boolean> = {
  today: true,
  general: true,
  missed: false,
  completed: true,
  backlog: false,
  // Epics: what is running and what is next are work in hand; finished epics
  // are a record, and a year of them above the fold buries both.
  "epics-active": true,
  "epics-next": true,
  "epics-achieved": false,
};

function read(): Record<string, boolean> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // An array is the previous format (a list of collapsed ids). Rejecting it
    // here means an old value is simply forgotten rather than misread.
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "boolean"),
    ) as Record<string, boolean>;
  } catch {
    // A corrupted value must not take the home screen down with it.
    return {};
  }
}

/** Whether a section shows its contents, given what the user has chosen. */
export function sectionIsOpen(chosen: Record<string, boolean>, id: string): boolean {
  return chosen[id] ?? SECTION_DEFAULTS[id] ?? true;
}

export function useCollapsibleSections() {
  const [chosen, setChosen] = useState<Record<string, boolean>>(read);

  const toggle = useCallback((id: string) => {
    setChosen((current) => {
      const next = { ...current, [id]: !sectionIsOpen(current, id) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private mode, or a full quota. The toggle still works for this
        // session; only the memory of it is lost.
      }
      return next;
    });
  }, []);

  return {
    isOpen: (id: string) => sectionIsOpen(chosen, id),
    toggle,
  };
}
