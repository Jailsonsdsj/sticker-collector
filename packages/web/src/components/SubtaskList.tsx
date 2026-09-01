import { orderSubtasks, type Subtask, subtaskDone, subtasksDone } from "@sticker-collector/shared";
import { Checkbox } from "./ui";
import { cx } from "./ui/cx";

export interface SubtaskListProps {
  subtasks: readonly Subtask[];
  taskType: "routine" | "oneoff";
  today: string;
  onToggle: (subtaskId: string, done: boolean) => void;
  disabled?: boolean;
}

/**
 * The steps of a task, tickable, **undone first**.
 *
 * What is left is the list you are working through; what is done is the record
 * of having done it. Ordering by the author's numbering alone leaves the next
 * step buried among ticked ones, which is the list refusing to answer the only
 * question being asked of it.
 *
 * Ticking a step earns nothing. The task is what pays, and a checklist that
 * minted coins would be a second economy with no prices in it — so these are
 * plain checkboxes, with no reward beside them and no undo window behind them.
 */
export function SubtaskList({
  subtasks,
  taskType,
  today,
  onToggle,
  disabled = false,
}: SubtaskListProps) {
  if (subtasks.length === 0) return null;

  const ordered = orderSubtasks(subtasks, taskType, today);
  const done = subtasksDone(subtasks, taskType, today);

  return (
    <section aria-label="Steps" className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-numeric text-2xs tracking-kicker text-ink-muted uppercase">Steps</h3>
        <span className="font-numeric text-2xs font-bold text-ink-muted">
          {done}/{subtasks.length}
        </span>
      </div>

      <ul className="flex flex-col">
        {ordered.map((step) => {
          const ticked = subtaskDone(step, taskType, today);
          return (
            <li key={step.id} className="flex items-center gap-1">
              <Checkbox
                id={`step-${step.id}`}
                checked={ticked}
                disabled={disabled}
                onChange={() => onToggle(step.id, !ticked)}
                label={step.title}
              />
              {/* The text is a `<label htmlFor>` rather than a span, so the
                  words are part of the tap target — `Checkbox` renders its own
                  wrapping label around the box alone, and nesting one inside
                  another is not valid HTML.

                  Struck through and dimmed rather than removed: a finished step
                  is the evidence you finished it, and a list that shortens as
                  you work leaves nothing to look back at. */}
              <label
                htmlFor={`step-${step.id}`}
                className={cx(
                  "flex-1 cursor-pointer py-1 font-body text-sm",
                  ticked ? "text-ink-faint line-through" : "text-ink-secondary",
                )}
              >
                {step.title}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
