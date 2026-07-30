import type { LocalDate, Occurrence, Task } from "@sticker-collector/shared";
import { maskHasDay, WEEKDAYS } from "@sticker-collector/shared";
import { Checkbox, EmptyState } from "./ui";
import { WEEKDAY_INDICES, WeekGridShell, WeekRowLabel } from "./weekGrid/WeekGridShell";

/**
 * The week as ticks rather than as a schedule — the design bundle's version of
 * this screen, alongside `WeeklyGrid`'s schedule editor.
 *
 * Four cell states, and two of them are refusals:
 *
 *  - **not scheduled** — a faint dot. The mask is the whole recurrence engine;
 *    a day the routine does not run is not a day you can miss.
 *  - **done** — ticked. Includes completions still inside the undo window, so
 *    the cell moves the instant it is tapped.
 *  - **open** — tappable.
 *  - **future** — inert. T-05 refuses completing before the scheduled date; you
 *    cannot finish work you have not done, and firing a request guaranteed to
 *    400 would be worse than showing it greyed.
 */
export interface WeeklyCompletionGridProps {
  routines: Task[];
  /** The week's occurrences, from `GET /api/occurrences`. */
  occurrences: Occurrence[];
  /** Monday…Sunday of the week being shown. */
  dates: LocalDate[];
  today: LocalDate;
  /** True while a completion for this day is waiting out its undo window. */
  isPending: (taskId: string, date: LocalDate) => boolean;
  onToggle: (taskId: string, date: LocalDate, next: boolean) => void;
}

const keyOf = (taskId: string, date: LocalDate) => `${taskId} ${date}`;

export function WeeklyCompletionGrid({
  routines,
  occurrences,
  dates,
  today,
  isPending,
  onToggle,
}: WeeklyCompletionGridProps) {
  const byKey = new Map(occurrences.map((o) => [keyOf(o.taskId, o.scheduledOn), o]));

  const scheduled = (task: Task, index: number) =>
    maskHasDay(task.weekdays ?? 0, WEEKDAY_INDICES[index] ?? 0);
  const isDone = (task: Task, date: LocalDate) =>
    byKey.get(keyOf(task.id, date))?.status === "done" || isPending(task.id, date);

  const total = routines.reduce(
    (sum, task) => sum + dates.filter((_, index) => scheduled(task, index)).length,
    0,
  );
  const done = routines.reduce(
    (sum, task) =>
      sum + dates.filter((date, index) => scheduled(task, index) && isDone(task, date)).length,
    0,
  );

  if (routines.length === 0) {
    return (
      <EmptyState
        icon="▦"
        title="No routines yet"
        description="Once a routine has a schedule, its week shows up here to tick off."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">Done</span>
        <span className="font-numeric text-base font-bold text-lime">
          {done}/{total}
        </span>
      </div>

      <WeekGridShell today={today}>
        {routines.map((task) => (
          <Row
            key={task.id}
            task={task}
            dates={dates}
            today={today}
            scheduled={(index) => scheduled(task, index)}
            done={(date) => isDone(task, date)}
            onToggle={onToggle}
          />
        ))}
      </WeekGridShell>

      <p className="mt-5 text-center font-body text-sm text-ink-dim">
        Tap a cell to complete that day. Faint cells are not scheduled, and days still ahead cannot
        be ticked yet.
      </p>
    </>
  );
}

function Row({
  task,
  dates,
  today,
  scheduled,
  done,
  onToggle,
}: {
  task: Task;
  dates: LocalDate[];
  today: LocalDate;
  scheduled: (index: number) => boolean;
  done: (date: LocalDate) => boolean;
  onToggle: (taskId: string, date: LocalDate, next: boolean) => void;
}) {
  return (
    <>
      <WeekRowLabel title={task.title} rewardCoins={task.rewardCoins} />

      {dates.map((date, index) => {
        const runs = scheduled(index);
        const ticked = done(date);
        const future = date > today;

        return (
          <Checkbox
            key={date}
            size="sm"
            className="w-full"
            muted={!runs}
            checked={runs && ticked}
            ring={date === today}
            disabled={future}
            label={`${task.title} — ${WEEKDAYS[index]}`}
            onChange={(next) => onToggle(task.id, date, next)}
          />
        );
      })}
    </>
  );
}
