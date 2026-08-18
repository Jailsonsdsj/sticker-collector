import { addDays, type Occurrence, type Task } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { buildHome, filterHome, isEmpty } from "./home";

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
    startedAt: null,
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

describe("the sections", () => {
  it("splits a routine's occurrences across today and the backlog, and drops the days that have gone", () => {
    // A day that has gone is not this screen's business. Every routine leaves
    // one row per day it was not ticked, so a handful of daily habits filled
    // the home screen with a week of history that grew every morning. Those
    // days are still completable — on the Week tab.
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

    expect(home.forToday.map((i) => i.scheduledOn)).toEqual([TODAY]);
    expect(home.routineBacklog.map((i) => i.scheduledOn)).toEqual([addDays(TODAY, 3)]);
    // Nowhere else either: a routine's gone day is not quietly folded into
    // General, and Missed is for overdue captures, not for routines.
    expect([...home.general, ...home.missed, ...home.inProgress, ...home.completedToday]).toEqual(
      [],
    );
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

describe("missed — an overdue capture", () => {
  it("holds a one-off whose due date has gone", () => {
    // There is exactly one of it, it will not reappear tomorrow, and it is the
    // thing most likely to have been forgotten.
    const overdue = oneoff({
      id: "o",
      title: "File the forms",
      dueAt: `${addDays(TODAY, -3)}T09:00:00Z`,
    });

    const home = buildHome([occ("o", addDays(TODAY, -3), "missed")], [overdue], TODAY, UTC);

    expect(titles(home.missed)).toEqual(["File the forms"]);
    expect(home.general).toEqual([]);
  });

  it("leaves one due today or later in General", () => {
    const today = oneoff({ id: "a", title: "Due today", dueAt: `${TODAY}T09:00:00Z` });
    const later = oneoff({ id: "b", title: "Due later", dueAt: `${addDays(TODAY, 4)}T09:00:00Z` });

    const home = buildHome(
      [occ("a", TODAY, "pending"), occ("b", addDays(TODAY, 4), "pending")],
      [today, later],
      TODAY,
      UTC,
    );

    expect(titles(home.general)).toEqual(["Due later", "Due today"]);
    expect(home.missed).toEqual([]);
  });

  it("never holds a routine, however long ago the day was", () => {
    // The rule that changed: a week of routine days is reference material, and
    // it belongs on the Week tab.
    const routine = task({ id: "r", title: "Stretch" });

    const home = buildHome([occ("r", addDays(TODAY, -4), "missed")], [routine], TODAY, UTC);

    expect(home.missed).toEqual([]);
  });

  it("never lists an undated capture, however old its leftover row", () => {
    // Unticking leaves a pending occurrence behind, so an undated one-off
    // ticked and untangled last week carries a stale date around. It has no
    // deadline, so it cannot have missed one.
    const undated = oneoff({ id: "u", title: "Buy milk" });

    const home = buildHome([occ("u", addDays(TODAY, -6), "pending")], [undated], TODAY, UTC);

    expect(home.missed).toEqual([]);
    expect(titles(home.general)).toEqual(["Buy milk"]);
  });

  it("lets a finished one go, and never lists an undated capture", () => {
    const overdue = oneoff({ id: "o", dueAt: `${addDays(TODAY, -2)}T09:00:00Z` });
    const undated = oneoff({ id: "u", title: "Buy milk" });

    const home = buildHome([occ("o", addDays(TODAY, -2), "done")], [overdue, undated], TODAY, UTC);

    expect(home.missed).toEqual([]);
    expect(titles(home.general)).toEqual(["Buy milk"]);
  });

  it("puts the one that slipped furthest at the top", () => {
    const old = oneoff({ id: "a", title: "Oldest", dueAt: `${addDays(TODAY, -9)}T09:00:00Z` });
    const recent = oneoff({ id: "b", title: "Newest", dueAt: `${addDays(TODAY, -1)}T09:00:00Z` });

    const home = buildHome(
      [occ("a", addDays(TODAY, -9), "missed"), occ("b", addDays(TODAY, -1), "missed")],
      [old, recent],
      TODAY,
      UTC,
    );

    expect(titles(home.missed)).toEqual(["Oldest", "Newest"]);
  });
});

describe("in progress", () => {
  const STARTED = "2026-08-01T09:00:00Z";

  it("lists a started ROUTINE once, not once per day", () => {
    // The bug this exists for: `startedAt` belongs to the task, and a routine
    // is one row per day in the window. Every one of them arrived in the list,
    // so starting a routine put the same title on screen five times.
    const routine = task({ id: "r", title: "Stretch", startedAt: STARTED });

    const home = buildHome(
      [
        occ("r", addDays(TODAY, -2), "missed"),
        occ("r", TODAY, "pending"),
        occ("r", addDays(TODAY, 1), "pending"),
        occ("r", addDays(TODAY, 2), "pending"),
      ],
      [routine],
      TODAY,
      UTC,
    );

    expect(home.inProgress).toHaveLength(1);
    expect(home.inProgress[0]?.scheduledOn).toBe(TODAY);
  });

  it("leaves that routine's other days where they belong", () => {
    // Starting a routine says nothing about the days around it: tomorrow is
    // still backlog, and a day that has gone is still the Week tab's business.
    const routine = task({ id: "r", title: "Stretch", startedAt: STARTED });

    const home = buildHome(
      [
        occ("r", addDays(TODAY, -2), "missed"),
        occ("r", TODAY, "pending"),
        occ("r", addDays(TODAY, 3), "pending"),
      ],
      [routine],
      TODAY,
      UTC,
    );

    expect(home.inProgress).toHaveLength(1);
    expect(home.routineBacklog).toHaveLength(1);
  });

  it("shows nothing for a started routine that is not scheduled today", () => {
    // There is no day to tick, and a row that cannot be ticked is a row that
    // reads as broken.
    const routine = task({ id: "r", title: "Stretch", startedAt: STARTED });

    const home = buildHome([occ("r", addDays(TODAY, 2), "pending")], [routine], TODAY, UTC);

    expect(home.inProgress).toEqual([]);
    expect(home.routineBacklog).toHaveLength(1);
  });

  it("keeps a started DATED one-off here, whatever day it is due", () => {
    // A one-off is a single row, so there is nothing to duplicate — and its due
    // date is not a reason to bury the thing you are in the middle of.
    const dated = oneoff({
      id: "d",
      title: "Post the form",
      dueAt: `${addDays(TODAY, 4)}T09:00:00Z`,
      startedAt: STARTED,
    });

    const home = buildHome([occ("d", addDays(TODAY, 4), "pending")], [dated], TODAY, UTC);

    expect(titles(home.inProgress)).toEqual(["Post the form"]);
    expect(home.general).toEqual([]);
  });

  it("takes a started task out of whichever list it was in", () => {
    // "In progress" is a claim about the task, not about today: a routine
    // begun this morning and a one-off begun last week belong together.
    const routine = task({ id: "r", title: "Stretch", startedAt: STARTED });
    const capture = oneoff({ id: "o", title: "Buy milk", startedAt: STARTED });

    const home = buildHome([occ("r", TODAY, "pending")], [routine, capture], TODAY, UTC);

    expect(titles(home.inProgress)).toEqual(["Buy milk", "Stretch"]);
    expect(home.forToday).toEqual([]);
    expect(home.general).toEqual([]);
  });

  it("does not expire overnight, the way a pin does", () => {
    // A pin is a claim about today and is worthless tomorrow. Putting a
    // half-finished job back in the general pile every morning is exactly what
    // marking it started is for.
    const capture = oneoff({ id: "o", startedAt: "2026-07-01T09:00:00Z" });

    const home = buildHome([], [capture], TODAY, UTC);

    expect(home.inProgress).toHaveLength(1);
    expect(home.general).toEqual([]);
  });

  it("still leaves a finished one out of it", () => {
    // Completed today wins over everything, including work that was started.
    const capture = oneoff({ id: "o", startedAt: STARTED });

    const home = buildHome([occ("o", TODAY, "done")], [capture], TODAY, UTC);

    expect(home.inProgress).toEqual([]);
    expect(home.completedToday).toHaveLength(1);
  });

  it("leads with the high-priority work, like every other section", () => {
    const home = buildHome(
      [],
      [
        oneoff({ id: "a", title: "Alpha", priority: "low", startedAt: STARTED }),
        oneoff({ id: "z", title: "Zebra", priority: "high", startedAt: STARTED }),
      ],
      TODAY,
      UTC,
    );

    expect(titles(home.inProgress)).toEqual(["Zebra", "Alpha"]);
  });
});

describe("ordering", () => {
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

  it("leads each section with the high-priority work", () => {
    // Priority already tints the row; sorting by it is what makes the tint
    // worth having, because the urgent work is at the top instead of wherever
    // the alphabet put it.
    const low = task({ id: "a", title: "Alpha", priority: "low" });
    const high = task({ id: "z", title: "Zebra", priority: "high" });
    const medium = task({ id: "m", title: "Middle", priority: "medium" });

    const home = buildHome(
      [occ("a", TODAY, "pending"), occ("z", TODAY, "pending"), occ("m", TODAY, "pending")],
      [low, high, medium],
      TODAY,
      UTC,
    );

    expect(titles(home.forToday)).toEqual(["Zebra", "Middle", "Alpha"]);
  });

  it("sorts General by priority too", () => {
    const home = buildHome(
      [],
      [
        oneoff({ id: "a", title: "Alpha", priority: "low" }),
        oneoff({ id: "z", title: "Zebra", priority: "high" }),
      ],
      TODAY,
      UTC,
    );

    expect(titles(home.general)).toEqual(["Zebra", "Alpha"]);
  });

  it("breaks a priority tie on title, so the list is stable between renders", () => {
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

  it("keeps the DAY first in the backlog, and priority within it", () => {
    // Two different days are not one item at two urgencies — the day is what is
    // being read, and priority orders what falls on the same one.
    const low = task({ id: "a", title: "Alpha", priority: "low" });
    const high = task({ id: "z", title: "Zebra", priority: "high" });

    const home = buildHome(
      [
        occ("z", addDays(TODAY, 3), "pending"),
        occ("a", addDays(TODAY, 1), "pending"),
        occ("z", addDays(TODAY, 1), "pending"),
      ],
      [low, high],
      TODAY,
      UTC,
    );

    expect(home.routineBacklog.map((i) => [i.scheduledOn, i.task.title])).toEqual([
      [addDays(TODAY, 1), "Zebra"],
      [addDays(TODAY, 1), "Alpha"],
      [addDays(TODAY, 3), "Zebra"],
    ]);
  });

  it("keeps the DAY first in the backlog too", () => {
    // Same rule the other way round: a high-priority routine next Friday does
    // not jump ahead of tomorrow's low one. The backlog is read as days.
    const low = task({ id: "a", title: "Alpha", priority: "low" });
    const high = task({ id: "z", title: "Zebra", priority: "high" });

    const home = buildHome(
      [occ("z", addDays(TODAY, 5), "pending"), occ("a", addDays(TODAY, 2), "pending")],
      [low, high],
      TODAY,
      UTC,
    );

    expect(home.routineBacklog.map((i) => [i.scheduledOn, i.task.title])).toEqual([
      [addDays(TODAY, 2), "Alpha"],
      [addDays(TODAY, 5), "Zebra"],
    ]);
  });

  it("leaves Completed today alphabetical", () => {
    // Done work is a record, not a queue: nothing here needs doing, so
    // shouting about a finished "high" helps nobody.
    const home = buildHome(
      [occ("a", TODAY, "done"), occ("z", TODAY, "done")],
      [
        task({ id: "a", title: "Alpha", priority: "low" }),
        task({ id: "z", title: "Zebra", priority: "high" }),
      ],
      TODAY,
      UTC,
    );

    expect(titles(home.completedToday)).toEqual(["Alpha", "Zebra"]);
  });
});

describe("empty", () => {
  it("returns every section, empty, for a new user", () => {
    expect(buildHome([], [], TODAY, UTC)).toEqual({
      inProgress: [],
      missed: [],
      general: [],
      forToday: [],
      routineBacklog: [],
      completedToday: [],
    });
  });
});

describe("searching", () => {
  const sections = () =>
    buildHome(
      [occ("r", TODAY, "pending")],
      [
        task({ id: "r", title: "Morning run" }),
        oneoff({ id: "a", title: "Buy milk" }),
        oneoff({ id: "b", title: "Read the running manual" }),
      ],
      TODAY,
      UTC,
    );

  it("keeps a match in the section it belongs to", () => {
    // Filtering the built sections rather than the tasks going in: finding a
    // routine tells you it is today's, not merely that it exists.
    const found = filterHome(sections(), "run");

    expect(titles(found.forToday)).toEqual(["Morning run"]);
    expect(titles(found.general)).toEqual(["Read the running manual"]);
  });

  it("ignores case and surrounding space", () => {
    expect(titles(filterHome(sections(), "  MILK ").general)).toEqual(["Buy milk"]);
  });

  it("matches part of a word, not only the start", () => {
    expect(titles(filterHome(sections(), "ilk").general)).toEqual(["Buy milk"]);
  });

  it("returns the sections untouched when there is nothing to search for", () => {
    // Not merely equal — the same object, so an empty box costs no work.
    const all = sections();
    expect(filterHome(all, "   ")).toBe(all);
  });

  it("comes back empty when nothing matches, which is a different thing from having no tasks", () => {
    const found = filterHome(sections(), "xylophone");

    expect(isEmpty(found)).toBe(true);
    expect(isEmpty(sections())).toBe(false);
  });

  it("does not read descriptions", () => {
    // A row on screen with no visible reason to be there is worse than a miss.
    const withNotes = buildHome(
      [],
      [oneoff({ id: "a", title: "Buy milk", description: "from the corner shop" })],
      TODAY,
      UTC,
    );

    expect(isEmpty(filterHome(withNotes, "corner"))).toBe(true);
  });
});
