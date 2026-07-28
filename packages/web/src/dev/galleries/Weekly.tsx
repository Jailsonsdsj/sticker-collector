import type { Task } from "@sticker-collector/shared";
import { maskFromDays, WEEKDAYS_MASK_WEEKDAYS, type Weekday } from "@sticker-collector/shared";
import { useState } from "react";
import { WeeklyGrid } from "../../components/WeeklyGrid";
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
  createdAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
  lastCompletedOn: null,
  ...over,
});

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
      </Panel>
    </Section>
  );
}
