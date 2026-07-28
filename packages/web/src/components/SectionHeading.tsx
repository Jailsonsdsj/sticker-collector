import type { CSSProperties, ReactNode } from "react";
import { cx } from "./ui/cx";

export type SectionTone = "missed" | "today" | "backlog";

/** Each section wears its own accent, per the design: Missed magenta, Today
 *  cyan, Backlog muted — so the eye finds the urgent one first. */
const TONE: Record<SectionTone, string> = {
  missed: "--color-missed",
  today: "--color-today",
  backlog: "--color-backlog",
};

export function SectionHeading({
  tone,
  children,
  count,
  className,
}: {
  tone: SectionTone;
  children: ReactNode;
  count?: ReactNode;
  className?: string;
}) {
  return (
    <div
      style={{ "--ui-accent": `var(${TONE[tone]})` } as CSSProperties}
      className={cx("mb-3 flex items-center gap-2", className)}
    >
      <span className="font-display text-xl tracking-section uppercase italic [color:var(--ui-accent)]">
        {children}
      </span>
      <span className="h-px flex-1 [background:var(--ui-accent)] opacity-25" />
      {count !== undefined && (
        <span className="font-numeric text-xs font-bold [color:var(--ui-accent)]">{count}</span>
      )}
    </div>
  );
}
