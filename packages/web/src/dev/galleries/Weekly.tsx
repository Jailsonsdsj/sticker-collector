import type { Occurrence, Task } from "@sticker-collector/shared";
import { maskFromDays, WEEKDAYS_MASK_WEEKDAYS, type Weekday } from "@sticker-collector/shared";
import { useState } from "react";
import { WeeklyCompletionGrid } from "../../components/WeeklyCompletionGrid";
import { WeeklyGrid } from "../../components/WeeklyGrid";
import { weekDates } from "../../lib/week";
import { Panel, Row, Section } from "../Section";

const base = (over: Partial<Task>): Task => ({
  id: "x",
  epicId: null,
  title: "Stretch",
  description: null,
  url: null,
  effortMinutes: 15,
  rewardCoins: 15,
  priority: "medium",
  type: "routine",
  weekdays: 0,
  startsOn: null,
  endsOn: null,
  dueAt: null,
  pinnedOn: null,
  startedAt: null,
  slots: [],
  createdAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
  lastCompletedOn: null,
  ...over,
});

const WEEK = weekDates("2026-08-05");

const DONE_MONDAY: Occurrence[] = [
  {
    taskId: "a",
    scheduledOn: WEEK[0] as string,
    status: "done",
    completedAt: "2026-08-03T10:00:00Z",
    rewardSnapshotCoins: 30,
  },
];

export function Weekly() {
  const [routines, setRoutines] = useState<Task[]>([
    base({ id: "a", title: "Morning run", weekdays: WEEKDAYS_MASK_WEEKDAYS, rewardCoins: 30 }),
    base({ id: "b", title: "Read 20 pages", weekdays: maskFromDays([0, 2, 4] as Weekday[]) }),
    base({ id: "c", title: "Tidy the desk", weekdays: maskFromDays([5] as Weekday[]) }),
  ]);

  return (
    <Section n="17" title="Weekly grid">
      <Panel>
        <Row label="tap a cell to add or remove a weekday — the last one cannot be removed">
          <div className="w-full">
            <WeeklyGrid
              routines={routines}
              today="2026-08-05"
              onChangeMask={(id, weekdays) =>
                setRoutines((prev) => prev.map((t) => (t.id === id ? { ...t, weekdays } : t)))
              }
            />
          </div>
        </Row>

        <Row label="complete — unscheduled cells are dots, days still ahead are inert">
          <div className="w-full">
            <WeeklyCompletionGrid
              routines={routines}
              occurrences={DONE_MONDAY}
              dates={WEEK}
              today="2026-08-05"
              isPending={() => false}
              onToggle={(id, date, next) => console.info("complete", id, date, next)}
            />
          </div>
        </Row>
      </Panel>
    </Section>
  );
}
