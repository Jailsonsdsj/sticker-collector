import type { EpicAccent, Priority } from "@sticker-collector/shared";
import type { CSSProperties } from "react";
import { Badge, Checkbox } from "./ui";
import { cx } from "./ui/cx";

/**
 * Two signals, layered, per prd/02-tasks.md and the design bundle:
 *
 *   - **Priority** is the row's background tint and border — scan by colour.
 *   - **The epic accent** is a 3px left border — group by colour.
 *
 * They have to be legible together at all three priority levels, which is why
 * the epic sits on the edge rather than in the fill.
 */
const PRIORITY: Record<Priority, { row: string; border: string; label: string; tone: string }> = {
  high: {
    row: "--color-prio-high-row",
    border: "--color-prio-high-row-border",
    label: "HIGH",
    tone: "high",
  },
  medium: {
    row: "--color-prio-med-row",
    border: "--color-prio-med-row-border",
    label: "MED",
    tone: "med",
  },
  low: {
    row: "--color-prio-low-row",
    border: "--color-prio-low-row-border",
    label: "LOW",
    tone: "low",
  },
};

export interface TaskRowProps {
  title: string;
  priority: Priority;
  rewardCoins: number;
  /** Null when the task has no epic — the accent falls back to a neutral edge. */
  epicAccent?: EpicAccent | null;
  epicTitle?: string | null;
  /** "↻ routine" / "· one-off", shown in Today where both appear together. */
  typeLabel?: string;
  done?: boolean;
  /** Wired in T-11; the row renders its checkbox either way. */
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
}

export function TaskRow({
  title,
  priority,
  rewardCoins,
  epicAccent,
  epicTitle,
  typeLabel,
  done = false,
  onToggle,
  disabled,
}: TaskRowProps) {
  const p = PRIORITY[priority];
  const vars = {
    "--ui-row": `var(${p.row})`,
    "--ui-row-border": `var(${p.border})`,
    "--ui-epic": `var(--color-${epicAccent ?? "epic-none"})`,
  } as CSSProperties;

  return (
    <div
      style={vars}
      className={cx(
        "flex items-start gap-3 rounded-2xl border p-3",
        "[background:var(--ui-row)] [border-color:var(--ui-row-border)]",
        "border-l-[3px] [border-left-color:var(--ui-epic)]",
        done && "opacity-55",
      )}
    >
      <Checkbox checked={done} onChange={onToggle} disabled={disabled} label={title} />

      <div className="min-w-0 flex-1">
        <div
          className={cx(
            "font-body text-lg leading-tight font-semibold",
            done ? "text-ink-dim line-through" : "text-ink",
          )}
        >
          {title}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={p.tone as "high" | "med" | "low"} size="sm">
            {p.label}
          </Badge>
          {epicTitle && <span className="font-numeric text-xs text-ink-muted">{epicTitle}</span>}
          {typeLabel && <span className="font-numeric text-2xs text-ink-dim">{typeLabel}</span>}
        </div>
      </div>

      <span className="shrink-0 font-numeric text-base font-bold text-coin">+{rewardCoins}</span>
    </div>
  );
}
