import type { CSSProperties } from "react";
import { NavLink } from "react-router";
import { cx } from "../ui/cx";

/**
 * Five tabs, each with its own accent when active.
 *
 * Only Tasks is `end`-matched — every other tab stays lit on its descendants,
 * which is what the design does when you open an album from the Albums tab.
 */
const TABS = [
  { to: "/", glyph: "✓", label: "TASKS", accent: "--color-coin", end: true },
  { to: "/week", glyph: "▦", label: "WEEK", accent: "--color-cyan" },
  { to: "/albums", glyph: "◈", label: "ALBUMS", accent: "--color-violet" },
  { to: "/epics", glyph: "◆", label: "EPICS", accent: "--color-violet" },
  { to: "/reports", glyph: "▲", label: "STATS", accent: "--color-lime" },
] as const;

export function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border bg-chrome",
        "h-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))]",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={"end" in tab ? tab.end : false}
          style={{ "--ui-accent": `var(${tab.accent})` } as CSSProperties}
          className={({ isActive }) =>
            cx(
              // 44px minimum touch target, per Apple's guidance — the design's
              // glyph+label pair alone is 30px and misses badly on a phone.
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 pt-3",
              "font-numeric text-2xs font-bold no-underline outline-none",
              "transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
              "focus-visible:outline-cyan",
              isActive ? "[color:var(--ui-accent)]" : "text-ink-faint hover:text-ink-muted",
            )
          }
        >
          <span aria-hidden className="text-base leading-none">
            {tab.glyph}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
