import type { Epic, EpicAccent, Task } from "@sticker-collector/shared";
import type { CSSProperties } from "react";
import { SectionHeading } from "./SectionHeading";
import { Badge, Button, Checkbox, ProgressBar } from "./ui";
import { cx } from "./ui/cx";

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
/** One-offs before routines, everywhere an epic lists its tasks. */
const TYPE_RANK: Record<Task["type"], number> = { oneoff: 0, routine: 1 };

/**
 * The progress bar has five tones; the epic palette has fifteen. Each accent
 * maps to the tone it sits nearest, so a bar never has to invent a colour the
 * design system does not have — and adding a sixteenth accent is one entry
 * here, not a new tone.
 */
const ACCENT_TONE: Record<EpicAccent, "violet" | "lime" | "cyan" | "magenta" | "coin"> = {
  "epic-1": "violet",
  "epic-2": "lime",
  "epic-3": "cyan",
  "epic-4": "magenta",
  "epic-5": "coin",
  "epic-6": "coin",
  "epic-7": "lime",
  "epic-8": "violet",
  "epic-9": "magenta",
  "epic-10": "lime",
  "epic-11": "cyan",
  "epic-12": "violet",
  "epic-13": "coin",
  "epic-14": "cyan",
  "epic-15": "magenta",
};

export interface EpicCardProps {
  epic: Epic;
  tasks: Task[];
  /** Tick a one-off from here. Absent means the list is read-only. */
  onCompleteTask?: (task: Task) => void;
  /** Open a task's own form. */
  onOpenTask?: (task: Task) => void;
  /** Tasks already ticked and inside their undo window. */
  isCompleting?: (task: Task) => boolean;
  /** Whether the epic's finished subtasks are showing. */
  doneOpen?: boolean;
  onToggleDone?: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddTask: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EpicCard({
  epic,
  tasks,
  onCompleteTask,
  onOpenTask,
  isCompleting,
  doneOpen = false,
  onToggleDone,
  expanded,
  onToggleExpand,
  onAddTask,
  onEdit,
  onDelete,
}: EpicCardProps) {
  const percent = epic.oneOffTotal === 0 ? 0 : (epic.oneOffDone / epic.oneOffTotal) * 100;

  /**
   * One-offs first, routines after.
   *
   * A one-off is a thing this epic finishes, and it is the only thing the
   * progress bar above counts. A routine never finishes — it is the background
   * hum of the epic — so leading with it buries the work the epic is actually
   * measured by. The `↻` beside each routine says which is which; the order
   * says which to read first.
   *
   * A stable sort on nothing but the type, so the order within each group is
   * the one the list already had rather than a new one invented here.
   */
  const ordered = [...tasks].sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type]);

  /**
   * Finished means finished — `lastCompletedOn`, not a pending tick.
   *
   * A row inside its undo window stays where it is and merely shows a checked
   * box: moving it into Done the instant it is ticked would make the undo
   * button chase a row that had already left.
   */
  const done = ordered.filter((task) => Boolean(task.lastCompletedOn));
  const open = ordered.filter((task) => !task.lastCompletedOn);

  const row = (task: Task) => {
    // Only a ONE-OFF is tickable from here. A routine belongs to a day: the API
    // refuses a completion on a date its schedule does not cover, so a checkbox
    // here would promise a tick that comes back 400 on most days. The week grid
    // is where days are ticked.
    const tickable = task.type === "oneoff" && !task.lastCompletedOn;
    const ticked = Boolean(task.lastCompletedOn) || Boolean(isCompleting?.(task));

    return (
      <li key={task.id} className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2">
        {tickable || ticked ? (
          <Checkbox
            size="sm"
            label={`Complete ${task.title}`}
            checked={ticked}
            disabled={!onCompleteTask || ticked}
            onChange={() => onCompleteTask?.(task)}
          />
        ) : (
          <span aria-hidden className="font-numeric text-2xs text-ink-dim">
            ↻
          </span>
        )}

        {onOpenTask ? (
          <button
            type="button"
            onClick={() => onOpenTask(task)}
            className="min-w-0 flex-1 cursor-pointer text-left font-body text-md break-words outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            {task.title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 font-body text-md break-words">{task.title}</span>
        )}

        <span className="font-numeric text-2xs font-bold text-coin">+{task.rewardCoins}</span>
      </li>
    );
  };

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

      {/* Collapsed, the description is a hint at what the epic is for; the whole
          thing only appears once the card is open, so a long one cannot push
          every other epic off the screen. */}
      {epic.description && (
        <p
          className={cx(
            "mt-2 font-body text-sm text-ink-secondary",
            // Only once the card is open: a clamped two-line preview should
            // stay two lines, whatever the author's paragraphing.
            expanded ? "whitespace-pre-line" : "line-clamp-2",
          )}
        >
          {epic.description}
        </p>
      )}

      {expanded && (
        <div className="mt-4 flex flex-col gap-2">
          {tasks.length === 0 ? (
            <p className="font-body text-md text-ink-dim">Nothing in here yet.</p>
          ) : (
            <>
              {/* What is LEFT, unheaded. A heading over the open work would be
                  naming the obvious: the list is the epic. */}
              {open.length > 0 && <ul className="flex flex-col gap-1">{open.map(row)}</ul>}

              {done.length > 0 && (
                <div className={open.length > 0 ? "mt-3" : undefined}>
                  <SectionHeading
                    tone="completed"
                    count={done.length}
                    open={doneOpen}
                    onToggle={onToggleDone}
                  >
                    Done
                  </SectionHeading>
                  {doneOpen && <ul className="flex flex-col gap-1">{done.map(row)}</ul>}
                </div>
              )}
            </>
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
