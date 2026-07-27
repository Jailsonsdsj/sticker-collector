import { EmptyState } from "../components/ui";

/** Home — Missed / Today / Backlog. Built in T-08. */
export function Tasks() {
  return (
    <EmptyState
      icon="✓"
      title="Nothing to do yet"
      description="Add a task and finishing it will mint coins. This screen arrives in T-08."
    />
  );
}
