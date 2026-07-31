import { useCallback, useState } from "react";

/**
 * Which home-screen sections are collapsed, remembered across visits.
 *
 * Persisted on purpose. A toggle that resets on every load is busywork: you
 * collapse the Backlog to get it out of the way, and it is back the next time
 * you open the app. `localStorage` is the right home here precisely because it
 * is per-device — which sections you want folded on a phone is not a fact about
 * your account, and it should not follow you to another screen or ride along in
 * a backup.
 *
 * Stored as the collapsed set rather than the open one, so **open is the
 * default**: a section that has never been touched — and any section added
 * later — shows its contents rather than hiding work behind a caret.
 */
const KEY = "sc_collapsed_sections";

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // A corrupted value must not take the home screen down with it.
    return [];
  }
}

export function collapsedSections(): string[] {
  return read();
}

export function useCollapsibleSections() {
  const [collapsed, setCollapsed] = useState<string[]>(read);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id];
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
    isOpen: (id: string) => !collapsed.includes(id),
    toggle,
  };
}
