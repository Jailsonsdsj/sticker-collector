import { addDays, type Occurrence, type Task } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { buildHome } from "./home";

const TODAY = "2026-08-05";
const UTC = "UTC";

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
    pinnedOn: null,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  };
}

/** `completedAt` defaults to midday TODAY, so "done" means "done today". */
function occ(
  taskId: string,
  scheduledOn: string,
  status: Occurrence["status"],
  completedAt?: string,
): Occurrence {
  return {
    taskId,
    scheduledOn,
    status,
    completedAt: status === "done" ? (completedAt ?? `${TODAY}T12:00:00Z`) : null,
    rewardSnapshotCoins: status === "done" ? 15 : null,
  };
}

const oneoff = (over: Partial<Task> = {}) =>
  task({ type: "oneoff", weekdays: null, title: "Buy milk", ...over });

const titles = (items: { task: Task }[]) => items.map((i) => i.task.title);

describe("the five sections", () => {
  it("splits a routine's occurrences across missed, today and the backlog", () => {
    const t = task({ id: "t1" });
    const home = buildHome(
      [
        occ("t1", addDays(TODAY, -2), "missed"),
        occ("t1", TODAY, "pending"),
        occ("t1", addDays(TODAY, 3), "pending"),
      ],
      [t],
      TODAY,
      UTC,
    );

    expect(home.missed.map((i) => i.scheduledOn)).toEqual([addDays(TODAY, -2)]);
    expect(home.forToday.map((i) => i.scheduledOn)).toEqual([TODAY]);
    expect(home.routineBacklog.map((i) => i.scheduledOn)).toEqual([addDays(TODAY, 3)]);
  });

  it("puts every one-off in General, dated or not", () => {
    const undated = oneoff({ id: "q1", title: "Buy milk" });
    const dated = oneoff({ id: "d1", title: "Passport", dueAt: `${addDays(TODAY, 2)}T09:00:00Z` });
    const dueToday = oneoff({ id: "d2", title: "Call bank", dueAt: `${TODAY}T09:00:00Z` });

    const home = buildHome(
      [occ("d1", addDays(TODAY, 2), "pending"), occ("d2", TODAY, "pending")],
      [undated, dated, dueToday],
      TODAY,
      UTC,
    );

    expect(titles(home.general)).toEqual(["Buy milk", "Call bank", "Passport"]);
    // A dated one-off is still a one-off — the date does not move it.
    expect(home.forToday).toEqual([]);
    expect(home.routineBacklog).toEqual([]);
  });

  it("keeps only routines in the backlog", () => {
    const routine = task({ id: "r1" });
    const dated = oneoff({ id: "d1", dueAt: `${addDays(TODAY, 4)}T09:00:00Z` });

    const home = buildHome(
      [occ("r1", addDays(TODAY, 1), "pending"), occ("d1", addDays(TODAY, 4), "pending")],
      [routine, dated],
      TODAY,
      UTC,
    );

    expect(titles(home.routineBacklog)).toEqual(["Stretch"]);
    expect(titles(home.general)).toEqual(["Buy milk"]);
  });

  it("excludes archived everywhere — it is no longer completable", () => {
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", addDays(TODAY, -20), "archived")], [t], TODAY, UTC);

    expect(Object.values(home).every((section) => section.length === 0)).toBe(true);
  });

  it("skips an occurrence whose task is not in the list", () => {
    expect(buildHome([occ("ghost", TODAY, "pending")], [], TODAY, UTC).forToday).toEqual([]);
  });

  it("skips a soft-deleted task", () => {
    const gone = task({ id: "t1", deletedAt: "2026-08-01T00:00:00Z" });
    expect(buildHome([occ("t1", TODAY, "pending")], [gone], TODAY, UTC).forToday).toEqual([]);
  });
});

describe("completed today", () => {
  it("takes a tick out of its own section and puts it here", () => {
    // The point of the section: a done row moves rather than sitting dimmed
    // where it was.
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", TODAY, "done")], [t], TODAY, UTC);

    expect(home.completedToday).toHaveLength(1);
    expect(home.forToday).toEqual([]);
  });

  it("collects a one-off too, not just routines", () => {
    const q = oneoff({ id: "q1", lastCompletedOn: TODAY });
    const home = buildHome([occ("q1", TODAY, "done")], [q], TODAY, UTC);

    expect(titles(home.completedToday)).toEqual(["Buy milk"]);
    expect(home.general).toEqual([]); // not in both places
  });

  it("includes work completed today that was scheduled on an earlier day", () => {
    // A Monday routine ticked off on Thursday was completed today, and today's
    // record of effort should say so.
    const t = task({ id: "t1" });
    const home = buildHome([occ("t1", addDays(TODAY, -3), "done")], [t], TODAY, UTC);

    expect(home.completedToday).toHaveLength(1);
    expect(home.missed).toEqual([]);
  });

  it("leaves out work completed on a previous day", () => {
    const t = task({ id: "t1" });
    const home = buildHome(
      [occ("t1", addDays(TODAY, -3), "done", `${addDays(TODAY, -3)}T12:00:00Z`)],
      [t],
      TODAY,
      UTC,
    );

    expect(home.completedToday).toEqual([]);
    expect(home.missed).toEqual([]); // done is not missed
  });

  it("reads the instant in the user's timezone, not UTC", () => {
    // 23:30 in São Paulo is 02:30 the NEXT day in UTC. Slicing the timestamp
    // would file this under tomorrow and empty a section the user is looking at.
    const t = task({ id: "t1" });
    const lateEvening = `${addDays(TODAY, 1)}T02:30:00Z`;

    const inSaoPaulo = buildHome(
      [occ("t1", TODAY, "done", lateEvening)],
      [t],
      TODAY,
      "America/Sao_Paulo",
    );
    expect(inSaoPaulo.completedToday).toHaveLength(1);

    // The same instant, read in UTC, is tomorrow — so it is not today's work.
    const inUtc = buildHome([occ("t1", TODAY, "done", lateEvening)], [t], TODAY, UTC);
    expect(inUtc.completedToday).toHaveLength(0);
  });
});

describe("undated one-offs", () => {
  it("appear in General with no occurrence", () => {
    const home = buildHome([], [oneoff({ id: "q1" })], TODAY, UTC);

    expect(home.general).toHaveLength(1);
    expect(home.general[0]?.occurrence).toBeNull();
    expect(home.general[0]?.scheduledOn).toBeNull();
  });

  it("leave General once completed, however long ago", () => {
    // The completion is far outside any window the client would fetch — which
    // is exactly why the decision uses lastCompletedOn and not the occurrences.
    const done = oneoff({ id: "q1", lastCompletedOn: "2026-01-02" });
    expect(buildHome([], [done], TODAY, UTC).general).toEqual([]);
  });

  it("are not listed twice on the day they are ticked", () => {
    const t = oneoff({ id: "q1", lastCompletedOn: TODAY });
    const home = buildHome([occ("q1", TODAY, "done")], [t], TODAY, UTC);

    expect(home.completedToday).toHaveLength(1);
    expect(home.general).toEqual([]);
  });

  it("ignore a soft-deleted task", () => {
    const gone = oneoff({ id: "q1", deletedAt: "2026-08-01T00:00:00Z" });
    expect(buildHome([], [gone], TODAY, UTC).general).toEqual([]);
  });
});

describe("pinning to today", () => {
  it("lifts an undated capture out of General and into For today", () => {
    const pinned = oneoff({ id: "q1", title: "Call the dentist", pinnedOn: TODAY });
    const loose = oneoff({ id: "q2", title: "Buy milk" });

    const home = buildHome([], [pinned, loose], TODAY, UTC);

    expect(titles(home.forToday)).toEqual(["Call the dentist"]);
    expect(titles(home.general)).toEqual(["Buy milk"]);
  });

  it("expires on its own — pinned yesterday is not pinned today", () => {
    // The whole reason the flag is a date. A boolean would still be true, with
    // no way to tell a deliberate pin from a forgotten one.
    const stale = oneoff({ id: "q1", pinnedOn: addDays(TODAY, -1) });

    const home = buildHome([], [stale], TODAY, UTC);

    expect(home.forToday).toEqual([]);
    expect(titles(home.general)).toEqual(["Buy milk"]);
  });

  it("does not resurrect a completed capture", () => {
    const done = oneoff({ id: "q1", pinnedOn: TODAY, lastCompletedOn: "2026-01-02" });
    const home = buildHome([], [done], TODAY, UTC);

    expect(home.forToday).toEqual([]);
    expect(home.general).toEqual([]);
  });

  it("still moves to Completed today when ticked", () => {
    const pinned = oneoff({ id: "q1", pinnedOn: TODAY, lastCompletedOn: TODAY });
    const home = buildHome([occ("q1", TODAY, "done")], [pinned], TODAY, UTC);

    expect(home.completedToday).toHaveLength(1);
    expect(home.forToday).toEqual([]);
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
      UTC,
    );

    expect(home.missed.map((i) => i.scheduledOn)).toEqual([
      addDays(TODAY, -1),
      addDays(TODAY, -3),
      addDays(TODAY, -5),
    ]);
  });

  it("sorts the backlog by date, soonest first", () => {
    const t = task({ id: "t1" });
    const home = buildHome(
      [occ("t1", addDays(TODAY, 5), "pending"), occ("t1", addDays(TODAY, 2), "pending")],
      [t],
      TODAY,
      UTC,
    );

    expect(home.routineBacklog.map((i) => i.scheduledOn)).toEqual([
      addDays(TODAY, 2),
      addDays(TODAY, 5),
    ]);
  });

  it("sorts today by title so the list is stable between renders", () => {
    const a = task({ id: "a", title: "Zebra" });
    const b = task({ id: "b", title: "Apple" });
    const home = buildHome(
      [occ("a", TODAY, "pending"), occ("b", TODAY, "pending")],
      [a, b],
      TODAY,
      UTC,
    );

    expect(titles(home.forToday)).toEqual(["Apple", "Zebra"]);
  });
});

describe("empty", () => {
  it("returns five empty sections for a new user", () => {
    expect(buildHome([], [], TODAY, UTC)).toEqual({
      missed: [],
      general: [],
      forToday: [],
      routineBacklog: [],
      completedToday: [],
    });
  });
});
