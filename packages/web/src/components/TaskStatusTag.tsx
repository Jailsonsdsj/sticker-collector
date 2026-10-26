import type { TaskStatus } from "../lib/taskStatus";
import { Badge, type BadgeTone } from "./ui";

const LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  inProgress: "In progress",
  missed: "Missed",
  refine: "Refine",
  done: "Done",
};

const TONE: Record<TaskStatus, BadgeTone> = {
  todo: "neutral",
  inProgress: "cyan",
  missed: "magenta",
  // Matches the Refine section heading on Home.
  refine: "violet",
  done: "lime",
};

/** A task's status as a small tag, meant to sit beside its title. */
export function TaskStatusTag({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={TONE[status]} size="sm" className="shrink-0" data-task-status={status}>
      {LABEL[status]}
    </Badge>
  );
}
