import type { Epic, EpicAccent, Task } from "@sticker-collector/shared";
import type { CSSProperties } from "react";
import { Badge, Button, ProgressBar } from "./ui";

/**
 * One epic, expandable in place.
 *
 * The bundle expands the card rather than routing to a detail page, and the
 * spec only asks that "clicking an epic lists the tasks inside it, alongside a
 * button to add new tasks" — so this is that, and it avoids a fetch per epic:
 * the task list is already loaded for the home screen.
 *
 * The ratio comes from the server and is NOT recomputed here. It counts one-off
 * tasks only, because routines never finish and including them would peg every
 * epic below 100% forever (prd/03-epics.md §Enhancements).
 */
const ACCENT_TONE: Record<EpicAccent, "violet" | "lime" | "cyan" | "magenta" | "coin"> = {
  "epic-1": "violet",
  "epic-2": "lime",
  "epic-3": "cyan",
  "epic-4": "magenta",
  "epic-5": "coin",
};

export interface EpicCardProps {
  epic: Epic;
  tasks: Task[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddTask: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EpicCard({
  epic,
  tasks,
  expanded,
  onToggleExpand,
  onAddTask,
  onEdit,
  onDelete,
}: EpicCardProps) {
  const percent = epic.oneOffTotal === 0 ? 0 : (epic.oneOffDone / epic.oneOffTotal) * 100;

  return (
    <article
      style={{ "--ui-accent": `var(--color-${epic.accent})` } as CSSProperties}
      className="rounded-3xl border border-border bg-panel p-4"
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-3 text-left"
      >
        <span aria-hidden className="size-3 shrink-0 rounded-xs [background:var(--ui-accent)]" />
        <span className="min-w-0 flex-1 truncate font-display text-xl tracking-display uppercase italic">
          {epic.title}
        </span>
        <Badge tone="neutral" font="numeric" size="sm">
          {epic.oneOffDone}/{epic.oneOffTotal}
        </Badge>
      </button>

      <ProgressBar
        className="mt-3"
        size="sm"
        fill="accent"
        tone={ACCENT_TONE[epic.accent]}
        value={percent}
        aria-label={`${epic.title} progress`}
      />

      {expanded && (
        <div className="mt-4 flex flex-col gap-2">
          {tasks.length === 0 ? (
            <p className="font-body text-md text-ink-dim">Nothing in here yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2"
                >
                  <span aria-hidden className="font-numeric text-2xs text-ink-dim">
                    {task.type === "routine" ? "↻" : "·"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-body text-md">{task.title}</span>
                  <span className="font-numeric text-2xs font-bold text-coin">
                    +{task.rewardCoins}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" tone="violet" onClick={onAddTask}>
              ＋ Add task
            </Button>
            <Button size="sm" variant="outline" tone="neutral" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="outline" tone="magenta" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
