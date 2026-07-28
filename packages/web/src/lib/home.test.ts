import { addDays, type Occurrence, type Task } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { buildHome } from "./home";

const TODAY = "2026-08-05";

function task(over: Partial<Task> = {}): Task {
  return {
    id: over.id ?? crypto.randomUUID(),
    epicId: null,
    title: "Stretch",
    description: null,
    url: null,
    effortMinutes: 15,
    rewardCoins: 15,
    priority: "medium",
    type: "routine",
    weekdays: 0b1111111,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  };
}

function occ(taskId: string, scheduledOn: string, status: Occurrence["status"]): Occurrence {
  return {
    taskId,
    scheduledOn,
    status,
    completedAt: status === "done" ? "2026-08-05T10:00:00Z" : null,
    rewardSnapshotCoins: status === "done" ? 15 : null,
  };
}

describe("the three sections, in spec order", () => {
  it("routes each occurrence to the right one", () => {
    const t = task({ id: "t1" });
    const home = buildHome(
      [
        occ("t1", addDays(TODAY, -2), "missed"),
        occ("t1", TODAY, "pending"),
        occ("t1", addDays(TODAY, 3), "pending"),
      ],
      [t],
      TODAY,
    );

    expect(home.missed.map((i) => i.scheduledOn)).toEqual([addDays(TODAY, -2)]);
    expect(home.today.map((i) => i.scheduledOn)).toEqual([TODAY]);
    expect(home.backlog.map((i) => i.scheduledOn)).toEqual([addDays(TODAY, 3)]);
  });

  it("keeps a completed occurrence in Today rather than hiding it", () => {
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", TODAY, "done")], [t], TODAY);
    expect(home.today).toHaveLength(1);
    expect(home.today[0]?.done).toBe(true);
  });

  it("excludes archived from every section — it is no longer completable", () => {
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", addDays(TODAY, -20), "archived")], [t], TODAY);
    expect(home).toEqual({ missed: [], today: [], backlog: [] });
  });

  it("does not put a past done occurrence in Missed", () => {
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", addDays(TODAY, -3), "done")], [t], TODAY);
    expect(home.missed).toEqual([]);
    expect(home.today).toEqual([]);
    expect(home.backlog).toEqual([]);
  });

  it("skips an occurrence whose task is not in the list", () => {
    const home = buildHome([occ("ghost", TODAY, "pending")], [], TODAY);
    expect(home.today).toEqual([]);
  });
});

describe("undated one-offs — the Backlog", () => {
  const undated = (over: Partial<Task> = {}) =>
    task({ type: "oneoff", weekdays: null, dueAt: null, title: "Buy milk", ...over });

  it("appears in the Backlog with no occurrence", () => {
    const home = buildHome([], [undated({ id: "q1" })], TODAY);
    expect(home.backlog).toHaveLength(1);
    expect(home.backlog[0]?.occurrence).toBeNull();
    expect(home.backlog[0]?.scheduledOn).toBeNull();
    expect(home.today).toEqual([]);
  });

  it("leaves the Backlog once completed, however long ago", () => {
    // The completion is far outside any window the client would fetch — which
    // is exactly why the decision uses lastCompletedOn and not the occurrences.
    const done = undated({ id: "q1", lastCompletedOn: "2026-01-02" });
    expect(buildHome([], [done], TODAY).backlog).toEqual([]);
  });

  it("shows in Today on the day it is ticked", () => {
    const t = undated({ id: "q1", lastCompletedOn: TODAY });
    const home = buildHome([occ("q1", TODAY, "done")], [t], TODAY);
    expect(home.today).toHaveLength(1);
    expect(home.backlog).toEqual([]); // not in both places
  });

  it("ignores a soft-deleted task", () => {
    const gone = undated({ id: "q1", deletedAt: "2026-08-01T00:00:00Z" });
    expect(buildHome([], [gone], TODAY).backlog).toEqual([]);
  });

  it("does not treat a dated one-off as backlog-by-default", () => {
    const dated = task({
      id: "d1",
      type: "oneoff",
      weekdays: null,
      dueAt: `${addDays(TODAY, 2)}T09:00:00Z`,
    });
    const home = buildHome([occ("d1", addDays(TODAY, 2), "pending")], [dated], TODAY);
    expect(home.backlog).toHaveLength(1);
    expect(home.backlog[0]?.scheduledOn).toBe(addDays(TODAY, 2)); // the occurrence, not the task
  });
});

describe("ordering", () => {
  it("puts the most recent slip at the top of Missed", () => {
    const t = task({ id: "t1" });
    const home = buildHome(
      [
        occ("t1", addDays(TODAY, -5), "missed"),
        occ("t1", addDays(TODAY, -1), "missed"),
        occ("t1", addDays(TODAY, -3), "missed"),
      ],
      [t],
      TODAY,
    );
    expect(home.missed.map((i) => i.scheduledOn)).toEqual([
      addDays(TODAY, -1),
      addDays(TODAY, -3),
      addDays(TODAY, -5),
    ]);
  });

  it("puts undated items before scheduled-ahead ones in the Backlog", () => {
    const q = task({ id: "q1", type: "oneoff", weekdays: null, title: "Buy milk" });
    const r = task({ id: "r1", title: "Stretch" });
    const home = buildHome([occ("r1", addDays(TODAY, 1), "pending")], [q, r], TODAY);
    expect(home.backlog.map((i) => i.task.title)).toEqual(["Buy milk", "Stretch"]);
  });

  it("sorts Today by title so the list is stable between renders", () => {
    const a = task({ id: "a", title: "Zebra" });
    const b = task({ id: "b", title: "Apple" });
    const home = buildHome([occ("a", TODAY, "pending"), occ("b", TODAY, "pending")], [a, b], TODAY);
    expect(home.today.map((i) => i.task.title)).toEqual(["Apple", "Zebra"]);
  });
});

describe("empty", () => {
  it("returns three empty sections for a new user", () => {
    expect(buildHome([], [], TODAY)).toEqual({ missed: [], today: [], backlog: [] });
  });
});
