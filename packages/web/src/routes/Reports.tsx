import { AppHeader } from "../components/layout";
import { EmptyState } from "../components/ui";

/** Momentum, not economics. Built in R-04. */
export function Reports() {
  return (
    <>
      <AppHeader title="Reports" />
      <EmptyState
        icon="▲"
        title="Nothing to report yet"
        description="Streaks, completion rate and the heatmap land once there is history to draw. Built in R-04."
      />
    </>
  );
}
