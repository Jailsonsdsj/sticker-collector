import type { Epic, Task } from "@sticker-collector/shared";
import { blockedBySteps, stepsLeft, WEEKDAYS } from "@sticker-collector/shared";
import { Markdown } from "./Markdown";
import { SubtaskList } from "./SubtaskList";
import { DeleteTaskAction } from "./taskForm/DeleteTaskAction";
import { Button, Coin, Sheet } from "./ui";

export interface TaskViewProps {
  /** Absent when the steps cannot be ticked from here — see `Week` and `Epics`. */
  onToggleSubtask?: (subtaskId: string, done: boolean) => void;
  /** The local day a tick counts for. */
  today?: string;
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
  onToggleSubtask,
  today,
  onEdit,
  onDelete,
  onClose,
}: TaskViewProps) {
  if (!task) return null;

  // The day this sheet would close. Steps reset daily for a routine, so which
  // day is being closed is what decides whether they count.
  const on = today ?? "";
  const blocked = Boolean(today) && blockedBySteps(task, on);
  const left = stepsLeft(task.subtasks, task.type, on);

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
          // Rendered as markdown, so what the author formatted is what shows.
          // A description written before this existed is unaffected: plain
          // prose is valid markdown and comes out as the same paragraph.
          //
          // The line breaks the author typed still survive: `Markdown` runs
          // `remark-breaks`, so a single newline is still a line break rather
          // than markdown's default space.
          <Markdown className="mt-2 font-body text-md text-ink-secondary leading-relaxed">
            {task.description}
          </Markdown>
        ) : (
          <p className="mt-2 font-body text-sm text-ink-faint italic">No description.</p>
        )}
      </div>

      {/* Under the title block and above the facts: the steps are what doing
          this task consists of, and the reward and effort beneath them are
          about the task as a whole. */}
      {onToggleSubtask && today && (
        <SubtaskList
          subtasks={task.subtasks}
          taskType={task.type}
          today={today}
          onToggle={onToggleSubtask}
        />
      )}

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

      {/* Said before the button is pressed, not after it is refused. The
          Worker enforces this; the point of saying it here is that being told
          "no" by a button you already tapped is a worse way to learn a rule
          than seeing it stated beside the steps it is about. */}
      {blocked && (
        <p
          role="status"
          className="rounded-lg border border-prio-high-tag-border bg-prio-high-tag px-3 py-2 font-body text-sm text-prio-high-fg"
        >
          Finish the steps to close this — {left} of {task.subtasks.length} left.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {/* One row: these are the things you came here to do, and stacking
            them pushed Delete up towards the thumb. `flex-1` on each rather
            than a grid, so the row closes up around whichever of them apply —
            Edit alone takes the whole width. */}
        <div className="flex gap-2">
          {onToggleDone && (
            <Button
              className="flex-1"
              tone={done ? "neutral" : "lime"}
              // Blocked only in the closing direction. Reopening a task whose
              // steps are unfinished is exactly what someone who ticked it by
              // mistake needs to be able to do.
              disabled={!done && blocked}
              onClick={onToggleDone}
            >
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
