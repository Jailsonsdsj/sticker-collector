import type { EpicAccent, Priority } from "@sticker-collector/shared";
import { type CSSProperties, useRef } from "react";
import { useCompletionFlourish } from "../lib/useCompletionFlourish";
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
  onToggle?: (next: boolean) => void;
  /**
   * Opens the edit form. The title is a separate target from the checkbox —
   * tapping the words must never tick the box, and vice versa.
   */
  onEdit?: () => void;
  disabled?: boolean;
  /**
   * Multi-select mode. The row already has one checkbox and it means "done", so
   * selection cannot add a second without one of them lying. Instead the same
   * control changes meaning: while selecting, the box and the title both pick
   * the row, and neither completes nor edits.
   */
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
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
  onEdit,
  disabled,
  selecting = false,
  selected = false,
  onSelect,
}: TaskRowProps) {
  const row = useRef<HTMLDivElement>(null);
  // The tick has to feel like it landed: the undo toast that used to say so is
  // gone, and a row that merely greys out looks like one that failed to save.
  useCompletionFlourish(row, Boolean(done));

  const p = PRIORITY[priority];
  const titleAction = selecting ? onSelect : onEdit;
  const vars = {
    "--ui-row": `var(${p.row})`,
    "--ui-row-border": `var(${p.border})`,
    "--ui-epic": `var(--color-${epicAccent ?? "epic-none"})`,
  } as CSSProperties;

  return (
    <div
      ref={row}
      style={vars}
      className={cx(
        "flex items-start gap-3 rounded-2xl border p-3",
        "[background:var(--ui-row)] [border-color:var(--ui-row-border)]",
        "border-l-[3px] [border-left-color:var(--ui-epic)]",
        done && !selecting && "opacity-55",
        selecting && selected && "[border-color:var(--color-cyan)]",
      )}
    >
      <Checkbox
        checked={selecting ? selected : done}
        onChange={selecting ? onSelect : onToggle}
        disabled={selecting ? false : disabled}
        label={selecting ? `Select ${title}` : title}
      />

      <div className="min-w-0 flex-1">
        {titleAction ? (
          <button
            type="button"
            onClick={titleAction}
            className={cx(
              // Wraps rather than truncates, like the plain title below it and
              // the weekly grid: a cut-off title hides the word that tells two
              // similar tasks apart, and a taller row is the cheaper price.
              "block w-full cursor-pointer text-left font-body text-lg leading-tight font-semibold break-words outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
              done ? "text-ink-dim line-through" : "text-ink",
            )}
          >
            {title}
          </button>
        ) : (
          <div
            className={cx(
              "font-body text-lg leading-tight font-semibold break-words",
              done ? "text-ink-dim line-through" : "text-ink",
            )}
          >
            {title}
          </div>
        )}
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
