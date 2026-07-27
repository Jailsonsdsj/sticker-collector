import { AppHeader } from "../components/layout";
import { EmptyState } from "../components/ui";

/** The shelf — locked and unlocked together. Built in A-06. */
export function Albums() {
  return (
    <>
      <AppHeader title="Albums" />
      <EmptyState
        icon="◈"
        title="No albums yet"
        description="Albums are yours to author. Build one, seal it, then earn your way through it. Built in A-06."
      />
    </>
  );
}
