import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept up to date as it changes.
 *
 * Used where a layout is not a smaller version of another one but a different
 * layout: the agenda is a week grid where seven columns fit and a single day
 * where they do not. CSS could hide one or the other, but then both are in the
 * DOM — two grids, two sets of buttons, and a screen reader reading the week
 * out twice.
 *
 * Anything without `matchMedia` — jsdom, an old browser — answers false, which
 * is the narrow layout. The safe default is the one that fits.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => read(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();

    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function read(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}
