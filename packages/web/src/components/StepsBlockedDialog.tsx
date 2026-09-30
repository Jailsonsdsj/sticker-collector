import { type LocalDate, stepsLeft, type Task } from "@sticker-collector/shared";
import { SubtaskList } from "./SubtaskList";
import { Button, Dialog } from "./ui";

export interface StepsBlockedDialogProps {
  /** The task a tick was refused on, or null when nothing was refused. */
  task: Task | null;
  /** The day the steps are counted for — the run that was ticked, not always today. */
  today: LocalDate;
  onClose: () => void;
  /** Ticks a step from here. Omitted, the list is read-only. */
  onToggleStep?: (subtaskId: string, done: boolean) => void;
  /** Closes the task once nothing is left — the tick that was refused, retried. */
  onComplete?: () => void;
}

/**
 * Why a task would not close — and the way through.
 *
 * The rule is the Worker's — every way a task can be closed arrives there, and
 * a rule the client alone keeps is a rule that holds until one screen forgets
 * it. What this adds is the *explanation*, before the refusal rather than
 * after: a checkbox that ticks, waits out its undo window and springs back is
 * a much worse way to learn about a gate than being told it is there.
 *
 * It shows the list rather than describing it. "Two steps left" is a fact about
 * a task; **which** two is the thing that gets you back to work — and when the
 * steps are already done and only unticked, sending you off to the task sheet
 * to say so is a detour. So they tick here, and once the last one does, the
 * completion that was refused is offered again.
 */
export function StepsBlockedDialog({
  task,
  today,
  onClose,
  onToggleStep,
  onComplete,
}: StepsBlockedDialogProps) {
  // Nothing rendered when nothing was refused. A closed `<dialog>` keeps its
  // DOM, so leaving the body mounted puts a stale task's steps in it.
  if (!task) return null;

  const left = stepsLeft(task.subtasks, task.type, today);
  const clear = left === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={clear ? "Ready to close" : "Steps first"}
      footer={
        clear && onComplete ? (
          <>
            <Button tone="neutral" variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button tone="lime" onClick={onComplete}>
              Complete it
            </Button>
          </>
        ) : (
          <Button tone="lime" onClick={onClose}>
            Got it
          </Button>
        )
      }
    >
      <p className="font-body text-md text-ink-secondary">
        <span className="font-bold text-ink">{task.title}</span>{" "}
        {clear ? (
          "has every step ticked."
        ) : (
          <>is set to wait for its steps. {left === 1 ? "One is" : `${left} are`} still open.</>
        )}
      </p>

      <SubtaskList
        subtasks={task.subtasks}
        taskType={task.type}
        today={today}
        onToggle={onToggleStep ?? (() => undefined)}
        disabled={!onToggleStep}
      />
    </Dialog>
  );
}
