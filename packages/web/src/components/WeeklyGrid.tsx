import type { EpicAccent, LocalDate, Task, Weekday } from "@sticker-collector/shared";
import {
  daysFromMask,
  maskHasDay,
  maskToggleDay,
  WEEKDAYS,
  weekdayOf,
} from "@sticker-collector/shared";
import { Checkbox, EmptyState } from "./ui";
import { WEEKDAY_INDICES, WeekGridShell, WeekRowLabel } from "./weekGrid/WeekGridShell";

/**
 * Routine maintenance on one screen: tasks as rows, the seven weekdays as
 * columns (prd/02-tasks.md §Weekly grid). A cell toggles whether the routine
 * runs that day — five taps make a Mon–Fri habit, where the alternative was
 * five separate tasks.
 *
 * Its sibling `WeeklyCompletionGrid` ticks days instead of scheduling them.
 * Both sit behind the tabs on the Week screen, and both draw their columns from
 * `WeekGridShell` so the Monday-first order can only be wrong in one place.
 */
export interface WeeklyGridProps {
  routines: Task[];
  /** An epic's accent for a task, so a row wears its epic's colour. */
  accentOf?: (task: Task) => EpicAccent | null;
  today: LocalDate;
  onChangeMask: (taskId: string, mask: number) => void;
  disabled?: boolean;
}

export function WeeklyGrid({ routines, accentOf, today, onChangeMask, disabled }: WeeklyGridProps) {
  const todayIndex = weekdayOf(today);

  if (routines.length === 0) {
    return (
      <EmptyState
        icon="▦"
        title="No routines yet"
        description="Routines become rows here, one column per weekday. Create one from the task form."
      />
    );
  }

  return (
    <WeekGridShell today={today}>
      {routines.map((task) => {
        const mask = task.weekdays ?? 0;
        // A routine with no days is not a routine — `weekdayMaskSchema` is
        // min(1), so removing the last day would 400. Refuse it here, where we
        // can say why, rather than letting the request fail.
        const lastRemaining = daysFromMask(mask).length === 1;

        return (
          <Row
            key={task.id}
            task={task}
            mask={mask}
            todayIndex={todayIndex}
            lastRemaining={lastRemaining}
            disabled={disabled}
            epicAccent={accentOf?.(task) ?? null}
            onChangeMask={onChangeMask}
          />
        );
      })}
    </WeekGridShell>
  );
}

function Row({
  task,
  mask,
  todayIndex,
  lastRemaining,
  disabled,
  epicAccent,
  onChangeMask,
}: {
  task: Task;
  mask: number;
  todayIndex: Weekday;
  lastRemaining: boolean;
  disabled?: boolean;
  epicAccent: EpicAccent | null;
  onChangeMask: (taskId: string, mask: number) => void;
}) {
  return (
    <>
      <WeekRowLabel title={task.title} rewardCoins={task.rewardCoins} epicAccent={epicAccent} />

      {WEEKDAY_INDICES.map((index) => {
        const on = maskHasDay(mask, index);
        return (
          <Checkbox
            key={WEEKDAYS[index]}
            size="sm"
            fill
            className="w-full"
            checked={on}
            ring={index === todayIndex}
            disabled={disabled || (on && lastRemaining)}
            label={`${task.title} — ${WEEKDAYS[index]}`}
            onChange={() => onChangeMask(task.id, maskToggleDay(mask, index as Weekday))}
          />
        );
      })}
    </>
  );
}
