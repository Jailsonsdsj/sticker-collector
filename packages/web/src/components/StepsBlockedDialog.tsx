import { type LocalDate, stepsLeft, type Task } from "@sticker-collector/shared";
import { SubtaskList } from "./SubtaskList";
import { Button, Dialog } from "./ui";

export interface StepsBlockedDialogProps {
  /** The task a tick was refused on, or null when nothing was refused. */
  task: Task | null;
  today: LocalDate;
  onClose: () => void;
}

/**
 * Why a task would not close.
 *
 * The rule is the Worker's — every way a task can be closed arrives there, and
 * a rule the client alone keeps is a rule that holds until one screen forgets
 * it. What this adds is the *explanation*, before the refusal rather than
 * after: a checkbox that ticks, waits out its undo window and springs back is
 * a much worse way to learn about a gate than being told it is there.
 *
 * It shows the list rather than describing it. "Two steps left" is a fact about
 * a task; **which** two is the thing that gets you back to work, and the list
 * is already a component.
 */
export function StepsBlockedDialog({ task, today, onClose }: StepsBlockedDialogProps) {
  // Nothing rendered when nothing was refused. A closed `<dialog>` keeps its
  // DOM, so leaving the body mounted puts a stale task's steps in it.
  if (!task) return null;

  const left = stepsLeft(task.subtasks, task.type, today);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Steps first"
      footer={
        <Button tone="lime" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <p className="font-body text-md text-ink-secondary">
        <span className="font-bold text-ink">{task.title}</span> is set to wait for its steps.{" "}
        {left === 1 ? "One is" : `${left} are`} still open.
      </p>

      {/* Read-only here: this dialog is an explanation, and a checkbox in it
          would be a second place to tick things off that the task sheet already
          does properly — with the list in its own order and the count beside
          it. */}
      <SubtaskList
        subtasks={task.subtasks}
        taskType={task.type}
        today={today}
        onToggle={() => undefined}
        disabled
      />
    </Dialog>
  );
}
