import type { LocalDate, Task, Weekday } from "@sticker-collector/shared";
import {
  daysFromMask,
  maskHasDay,
  maskToggleDay,
  WEEKDAYS,
  weekdayOf,
} from "@sticker-collector/shared";
import { Checkbox, EmptyState } from "./ui";

/**
 * Routine maintenance on one screen: tasks as rows, the seven weekdays as
 * columns (prd/02-tasks.md §Weekly grid). A cell toggles whether the routine
 * runs that day — five taps make a Mon–Fri habit, where the alternative was
 * five separate tasks.
 *
 * NOTE: the design bundle's version of this screen completes occurrences
 * instead of editing the schedule. The spec and the done-when both say
 * schedule, and completion already has a home on the Tasks screen, so that is
 * what this is. See the backlog row for the completion view.
 *
 * Columns are Monday-first because bit 0 of the mask is Monday
 * (shared/recurrence.ts). Rendering them Sunday-first while indexing them
 * Monday-first would look perfectly correct and move every routine by a day.
 */
export interface WeeklyGridProps {
  routines: Task[];
  today: LocalDate;
  onChangeMask: (taskId: string, mask: number) => void;
  disabled?: boolean;
}

export function WeeklyGrid({ routines, today, onChangeMask, disabled }: WeeklyGridProps) {
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
    <div className="grid grid-cols-[5rem_repeat(7,1fr)] items-center gap-1">
      <span />
      {WEEKDAYS.map((day, index) => (
        <span
          key={day}
          className={`text-center font-numeric text-2xs font-bold ${
            index === todayIndex ? "text-cyan" : "text-ink-muted"
          }`}
        >
          {day.slice(0, 2).toUpperCase()}
        </span>
      ))}

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
            onChangeMask={onChangeMask}
          />
        );
      })}
    </div>
  );
}

function Row({
  task,
  mask,
  todayIndex,
  lastRemaining,
  disabled,
  onChangeMask,
}: {
  task: Task;
  mask: number;
  todayIndex: Weekday;
  lastRemaining: boolean;
  disabled?: boolean;
  onChangeMask: (taskId: string, mask: number) => void;
}) {
  return (
    <>
      <div className="min-w-0 border-l-[3px] border-l-epic-none py-2 pl-2">
        <div className="truncate font-body text-sm font-semibold">{task.title}</div>
        <div className="font-numeric text-2xs font-bold text-coin">+{task.rewardCoins}</div>
      </div>

      {WEEKDAYS.map((day, index) => {
        const on = maskHasDay(mask, index as Weekday);
        return (
          <Checkbox
            key={day}
            size="sm"
            className="w-full"
            checked={on}
            ring={index === todayIndex}
            disabled={disabled || (on && lastRemaining)}
            label={`${task.title} — ${day}`}
            onChange={() => onChangeMask(task.id, maskToggleDay(mask, index as Weekday))}
          />
        );
      })}
    </>
  );
}
