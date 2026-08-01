import type { CSSProperties } from "react";
import { NavLink } from "react-router";
import { cx } from "../ui/cx";

/**
 * Five tabs, each with its own accent when active.
 *
 * The icons are the design's own PNGs rather than glyphs. The glyphs were
 * stand-ins — `◈` and `◆` for two different tabs, a distinction nobody can make
 * at 16px — and a font's idea of a shape is not something this app gets to
 * choose. Each tab ships **two** files, lit and unlit, because the unlit ones
 * are not a tint of the lit ones: they are their own grey-violet artwork.
 *
 * Both are in the DOM at once and cross-faded. Swapping a `src` on tap fetches
 * the new image at the moment it is needed, and the tab blinks empty on the
 * first visit to every screen.
 *
 * Only Tasks is `end`-matched — every other tab stays lit on its descendants,
 * which is what the design does when you open an album from the Albums tab.
 */
const TABS = [
  { to: "/", icon: "tasks", label: "TASKS", accent: "--color-coin", end: true },
  { to: "/week", icon: "week", label: "WEEK", accent: "--color-cyan" },
  // Magenta, not violet: the design gives Albums the pink sticker page and
  // Epics the violet gem, and two violet tabs side by side is one tab.
  { to: "/albums", icon: "albums", label: "ALBUMS", accent: "--color-magenta" },
  { to: "/epics", icon: "epics", label: "EPICS", accent: "--color-violet" },
  { to: "/reports", icon: "stats", label: "STATS", accent: "--color-lime" },
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
              // icon and label together are 40px and miss on a phone.
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 pt-2",
              "font-display text-2xs tracking-display uppercase italic no-underline outline-none",
              "transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
              "focus-visible:outline-cyan",
              isActive ? "[color:var(--ui-accent)]" : "text-ink-faint hover:text-ink-muted",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden className="relative size-7 shrink-0">
                <img
                  src={`/nav/${tab.icon}-off.png`}
                  alt=""
                  data-icon={`${tab.icon}-off`}
                  className={cx(
                    "absolute inset-0 size-full transition-opacity",
                    isActive && "opacity-0",
                  )}
                  draggable={false}
                />
                <img
                  src={`/nav/${tab.icon}-on.png`}
                  alt=""
                  data-icon={`${tab.icon}-on`}
                  className={cx(
                    "absolute inset-0 size-full transition-opacity",
                    !isActive && "opacity-0",
                  )}
                  draggable={false}
                />
              </span>
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
