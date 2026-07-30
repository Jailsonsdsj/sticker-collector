import { useMemo } from "react";
import { Navigate } from "react-router";
import { Heatmap } from "../components/Heatmap";
import { AppHeader } from "../components/layout";
import { CollectionPanel } from "../components/reports/CollectionPanel";
import { EffortPanel } from "../components/reports/EffortPanel";
import { RateCards } from "../components/reports/RateCards";
import { StreakList } from "../components/reports/StreakList";
import { WeekdayBars } from "../components/reports/WeekdayBars";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ApiError } from "../lib/api";
import { useEffort, useEpics, useMomentum } from "../lib/queries";

/**
 * Momentum, not economics.
 *
 * The question this screen answers is *am I keeping this up* — not *how are my
 * coins allocated*. There is deliberately **no balance, no prices and no spend
 * anywhere on it**; coin-allocation breakdowns, album ROI and pull-luck analysis
 * are explicitly out of scope for v1 (`prd/08-reports.md`). Minutes appear
 * because a coin *is* a minute: it measures work done, not money moved.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 flex flex-col gap-3">
      <h2 className="font-display text-2xl tracking-display uppercase italic text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function Reports() {
  const momentum = useMomentum();
  const effort = useEffort();
  const epics = useEpics();

  const epicsById = useMemo(
    () => new Map((epics.data ?? []).map((epic) => [epic.id, epic])),
    [epics.data],
  );

  const unauthorised = [momentum.error, effort.error].some(
    (error) => error instanceof ApiError && error.status === 401,
  );
  if (unauthorised) return <Navigate to="/login" replace />;

  if (momentum.isLoading || effort.isLoading) {
    return (
      <>
        <AppHeader title="Reports" />
        <div className="flex flex-col gap-3">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      </>
    );
  }

  const report = momentum.data;
  const work = effort.data;
  // Not empty — *failed*. This branch is only reachable when a read came back
  // with nothing, and it used to render the same "Nothing to report yet" copy
  // as the genuine no-history case below. Someone with a 400-day streak and a
  // dead connection was being told they had no history.
  if (!report || !work) {
    return (
      <>
        <AppHeader title="Reports" />
        <ErrorState
          error={momentum.error ?? effort.error}
          onRetry={() => {
            void momentum.refetch();
            void effort.refetch();
          }}
        />
      </>
    );
  }

  // A brand-new user gets an invitation, not seven zeros and an empty grid.
  const hasHistory =
    report.streaks.length > 0 || report.days.some((day) => day.scheduled > 0 || day.done > 0);

  if (!hasHistory) {
    return (
      <>
        <AppHeader title="Reports" />
        <EmptyState
          icon="▲"
          title="Nothing to report yet"
          description="Complete something scheduled and the streaks, the heatmap and the weekday shape all start drawing themselves."
        />
      </>
    );
  }

  return (
    <>
      <AppHeader title="Reports" />

      <Section title="Consistency">
        <RateCards rates={report.rates} />
        <Heatmap days={report.days} today={report.today} />
      </Section>

      <Section title="Streaks">
        <StreakList streaks={report.streaks} perfect={report.perfect} />
      </Section>

      <Section title="Weekday shape">
        <WeekdayBars weekdays={report.weekdays} />
      </Section>

      <Section title="Effort">
        <EffortPanel weeks={work.weeks} epics={work.epics} epicsById={epicsById} />
      </Section>

      <Section title="Collection">
        <CollectionPanel
          collection={work.collection}
          albumsCompleted={work.albumsCompleted}
          shelf={work.shelf}
        />
      </Section>
    </>
  );
}
