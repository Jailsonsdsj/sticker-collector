import { AppHeader } from "../components/layout";
import { EmptyState } from "../components/ui";

/** Epics and their one-off completion ratio. Built in T-13. */
export function Epics() {
  return (
    <>
      <AppHeader title="Epics" />
      <EmptyState
        icon="◆"
        title="No epics yet"
        description="An epic groups tasks and tracks how much of it is finished. Built in T-13."
      />
    </>
  );
}
