import { AppHeader } from "../components/layout";
import { EmptyState } from "../components/ui";

/** The weekly grid — routines as rows, seven days as columns. Built in T-12. */
export function Week() {
  return (
    <>
      <AppHeader title="This week" />
      <EmptyState
        icon="▦"
        title="No routines yet"
        description="Routines become rows here, one column per weekday. Built in T-12."
      />
    </>
  );
}
