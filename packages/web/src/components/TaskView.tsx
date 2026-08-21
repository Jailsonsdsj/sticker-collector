import type { Epic, Task } from "@sticker-collector/shared";
import { WEEKDAYS } from "@sticker-collector/shared";
import { DeleteTaskAction } from "./taskForm/DeleteTaskAction";
import { Button, Coin, Sheet } from "./ui";

export interface TaskViewProps {
  task: Task | null;
  epic?: Epic | null;
  /** Already closed today. Decides whether the action reads Done or Reopen. */
  done?: boolean;
  /** Absent when this task cannot be closed from here — a routine on a day its
   *  schedule does not cover, which the API would refuse anyway. */
  onToggleDone?: () => void;
  /** Already in progress. Decides whether the action reads Start or Stop. */
  started?: boolean;
  /**
   * Absent when starting would move nothing — a routine on a day it does not
   * run, which *In progress* takes only through today's occurrence. Setting
   * `startedAt` there is a button that appears to do nothing.
   */
  onToggleStart?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * A task, read rather than edited.
 *
 * Tapping a task used to open the edit form: every reading of "what is this
 * again?" began by putting the thing at risk, and the answer — the description
 * — was a `<textarea>` two fields down. This is the same sheet the sticker
 * viewer uses, for the same reason: title and words in evidence, everything
 * else beneath them, and the actions in the header where a thumb already is.
 *
 * Four actions, in the order they are wanted: **Done** (the thing you opened it
 * to do), **Start** (pick it up now — the same thing a right swipe does on the
 * list), **Edit** (the old behaviour, now deliberate), **Delete** (last, behind
 * the same two-step confirmation the edit form uses).
 */
export function TaskView({
  task,
  epic,
  done = false,
  onToggleDone,
  started = false,
  onToggleStart,
  onEdit,
  onDelete,
  onClose,
}: TaskViewProps) {
  if (!task) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Task"
      trailing={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Title and description in ONE block, the way a sticker's are: a fixed
          title over a scrolling description reads as two panels rather than as
          one thing with a lot to say. */}
      <div className="rounded-2xl border border-border bg-surface-1 p-4">
        <h2 className="font-display text-2xl tracking-display text-ink uppercase italic">
          {task.title}
        </h2>
        {task.description ? (
          // `whitespace-pre-line`: the author typed those line breaks into a
          // six-row textarea — a list of steps arrives as a list of steps, not
          // as one run-on paragraph. `pre-line` and not `pre-wrap` so runs of
          // spaces still collapse; it is prose, not code.
          <p className="mt-2 whitespace-pre-line font-body text-md text-ink-secondary leading-relaxed">
            {task.description}
          </p>
        ) : (
          <p className="mt-2 font-body text-sm text-ink-faint italic">No description.</p>
        )}
      </div>

      <dl className="flex flex-wrap gap-2">
        <Fact label="Reward">
          <span className="inline-flex items-center gap-1">
            <Coin size="xs" />
            {task.rewardCoins}
          </span>
        </Fact>
        <Fact label="Effort">{`${task.effortMinutes} min`}</Fact>
        <Fact label="Priority">{task.priority}</Fact>
        <Fact label="When">{schedule(task)}</Fact>
        {epic && <Fact label="Epic">{epic.title}</Fact>}
      </dl>

      {task.url && (
        <a
          href={task.url}
          target="_blank"
          rel="noreferrer"
          className="truncate font-body text-sm text-cyan underline"
        >
          {task.url}
        </a>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {/* One row: these are the things you came here to do, and stacking
            them pushed Delete up towards the thumb. `flex-1` on each rather
            than a grid, so the row closes up around whichever of them apply —
            Edit alone takes the whole width. */}
        <div className="flex gap-2">
          {onToggleDone && (
            <Button className="flex-1" tone={done ? "neutral" : "lime"} onClick={onToggleDone}>
              {done ? "Reopen" : "Done"}
            </Button>
          )}
          {/* Not offered on something already finished: starting what you have
              just closed is not a state the list has anywhere to put. Reopen
              it first and the button comes back. */}
          {onToggleStart && !done && (
            <Button
              className="flex-1"
              variant={started ? "solid" : "outline"}
              tone="violet"
              onClick={onToggleStart}
            >
              {started ? "Stop" : "Start"}
            </Button>
          )}
          <Button className="flex-1" variant="outline" tone="cyan" onClick={onEdit}>
            Edit
          </Button>
        </div>
        {/* The same two-step delete the edit form uses, rather than a second
            one worded differently: one affordance, one confirmation, one place
            to fix it. */}
        <DeleteTaskAction onDelete={onDelete} />
      </div>
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-1 px-3 py-2">
      <dt className="font-numeric text-3xs text-ink-muted tracking-mono uppercase">{label}</dt>
      <dd className="mt-0.5 font-body text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * When this task happens, in words.
 *
 * Monday-first, because the mask is (bit 0 = Monday). A Sunday-first reading
 * here would name the wrong days while looking entirely plausible.
 */
export function schedule(task: Task): string {
  if (task.type === "oneoff") return task.dueAt ? `Due ${task.dueAt.slice(0, 10)}` : "Any day";

  const mask = task.weekdays ?? 0;
  const days = WEEKDAYS.filter((_, bit) => (mask & (1 << bit)) !== 0);
  if (days.length === 7) return "Every day";
  if (days.length === 0) return "No days set";
  return days.join(", ");
}
