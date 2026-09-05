import type { Epic, Occurrence, Task } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildReview, lastReviewedOn, markReviewed, shouldReview } from "./dailyReview";

const DAY = "2026-08-02";
const UTC = "UTC";

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    epicId: null,
    title: "Water the plants",
    description: null,
    url: null,
    effortMinutes: 15,
    rewardCoins: 15,
    priority: "medium",
    type: "oneoff",
    weekdays: null,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    pinnedOn: null,
    startedAt: null,
    slots: [],
    subtasks: [],
    blockUntilSteps: false,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  }) as Task;

const epic = (over: Partial<Epic> = {}): Epic =>
  ({
    id: "e1",
    title: "Home",
    description: null,
    accent: "epic-3",
    status: "active",
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 1,
    oneOffDone: 1,
    ...over,
  }) as Epic;

const done = (taskId: string, at: string, coins: number | null = 15): Occurrence => ({
  taskId,
  scheduledOn: DAY,
  status: "done",
  completedAt: at,
  rewardSnapshotCoins: coins,
});

beforeEach(() => localStorage.clear());

describe("what a day's review contains", () => {
  it("carries the title, the epic and what it paid — and nothing else", () => {
    // The three things worth reading back. Everything here is derived: no
    // summary row is stored, so nothing can drift from the task it describes.
    const review = buildReview(
      DAY,
      [done("t1", `${DAY}T09:00:00Z`, 30)],
      [task({ epicId: "e1" })],
      [epic()],
      UTC,
    );

    expect(review.rows).toEqual([
      { taskId: "t1", title: "Water the plants", epic: "Home", epicAccent: "epic-3", coins: 30 },
    ]);
  });

  it("shows what the task paid THEN, not what it pays now", () => {
    // Coin snapshots are frozen at completion; editing a reward affects future
    // occurrences only. A review that quoted today's number would be rewriting
    // history in the one place the user goes to read it.
    const review = buildReview(
      DAY,
      [done("t1", `${DAY}T09:00:00Z`, 30)],
      [task({ rewardCoins: 999 })],
      [],
      UTC,
    );

    expect(review.rows[0]?.coins).toBe(30);
  });

  it("falls back to the task's reward when no snapshot was taken", () => {
    const review = buildReview(DAY, [done("t1", `${DAY}T09:00:00Z`, null)], [task()], [], UTC);
    expect(review.rows[0]?.coins).toBe(15);
  });

  it("totals the day", () => {
    const review = buildReview(
      DAY,
      [done("t1", `${DAY}T09:00:00Z`, 30), done("t2", `${DAY}T10:00:00Z`, 12)],
      [task({ id: "t1" }), task({ id: "t2", title: "Post the form" })],
      [],
      UTC,
    );

    expect(review.coins).toBe(42);
    // Biggest first: the day's headline is what it was worth.
    expect(review.rows.map((row) => row.title)).toEqual(["Water the plants", "Post the form"]);
  });

  it("counts the day it was COMPLETED on, not the day it was scheduled for", () => {
    // A Monday routine ticked on Thursday belongs to Thursday's review — the
    // same rule "Completed today" follows.
    const review = buildReview(
      DAY,
      [{ ...done("t1", `${DAY}T09:00:00Z`), scheduledOn: "2026-07-27" }],
      [task()],
      [],
      UTC,
    );

    expect(review.rows).toHaveLength(1);
  });

  it("reads the day in the user's zone, not UTC", () => {
    // 01:00 UTC on the 3rd is 22:00 on the 2nd in São Paulo. The review is a
    // civil day, so it has to be counted like one.
    const occurrence = done("t1", "2026-08-03T01:00:00Z");

    expect(buildReview(DAY, [occurrence], [task()], [], "America/Sao_Paulo").rows).toHaveLength(1);
    expect(buildReview(DAY, [occurrence], [task()], [], UTC).rows).toHaveLength(0);
  });

  it("ignores anything that is not a completion", () => {
    const review = buildReview(
      DAY,
      [
        {
          taskId: "t1",
          scheduledOn: DAY,
          status: "missed",
          completedAt: null,
          rewardSnapshotCoins: null,
        },
        {
          taskId: "t1",
          scheduledOn: DAY,
          status: "archived",
          completedAt: null,
          rewardSnapshotCoins: null,
        },
      ],
      [task()],
      [],
      UTC,
    );

    expect(review.rows).toEqual([]);
  });

  it("skips an occurrence whose task is gone", () => {
    // Deleted between fetches. A row with no title is worse than no row.
    expect(buildReview(DAY, [done("ghost", `${DAY}T09:00:00Z`)], [], [], UTC).rows).toEqual([]);
  });
});

describe("showing it once a day", () => {
  const review = (rows: number) =>
    buildReview(
      DAY,
      Array.from({ length: rows }, (_, i) => done(`t${i}`, `${DAY}T09:00:00Z`)),
      Array.from({ length: rows }, (_, i) => task({ id: `t${i}` })),
      [],
      UTC,
    );

  it("opens on the first visit of a day", () => {
    expect(shouldReview("2026-08-03", review(2))).toBe(true);
  });

  it("does not open twice", () => {
    markReviewed("2026-08-03");
    expect(shouldReview("2026-08-03", review(2))).toBe(false);
    // ...but a new day is a new review.
    expect(shouldReview("2026-08-04", review(2))).toBe(true);
  });

  it("stays away when there is nothing to celebrate", () => {
    // A modal that says "you did nothing yesterday" is a punishment, and this
    // app's economy is built the other way round.
    expect(shouldReview("2026-08-03", review(0))).toBe(false);
  });

  it("remembers across a reload, and survives storage being unavailable", () => {
    markReviewed("2026-08-03");
    expect(lastReviewedOn()).toBe("2026-08-03");

    localStorage.setItem("sc_reviewed_on", "2026-08-03");
    expect(lastReviewedOn()).toBe("2026-08-03");
  });
});

describe("what the day scored", () => {
  const routine = (over: Partial<Task> = {}): Task =>
    task({ type: "routine", weekdays: 0b1111111, ...over });

  it("compares what was done against what the day held", () => {
    // The denominator is the SCHEDULE, not the occurrence rows: a row exists
    // only once something is completed, so counting rows would make every day
    // 100% by construction.
    const tasks = [routine({ id: "a" }), routine({ id: "b" }), routine({ id: "c" })];
    const review = buildReview(DAY, [done("a", DAY), done("b", DAY)], tasks, [], UTC);

    expect(review.scheduled).toBe(3);
    expect(review.done).toBe(2);
    expect(review.score).toBe(67);
  });

  it("has no score on a day nothing was scheduled for", () => {
    // A Sunday-only routine, reviewed on a Wednesday.
    const review = buildReview(DAY, [], [routine({ id: "a", weekdays: 0 })], [], UTC);

    expect(review.scheduled).toBe(0);
    expect(review.score).toBeNull();
  });

  it("still lists unscheduled work on a day with no score", () => {
    // Finishing something unscheduled is still finishing something — the score
    // is absent, the list is not.
    const capture = task({ id: "u", type: "oneoff", weekdays: null, dueAt: null });
    const review = buildReview(DAY, [done("u", DAY)], [capture], [], UTC);

    expect(review.score).toBeNull();
    expect(review.rows).toHaveLength(1);
  });

  it("scores a day where nothing was done as zero, not as nothing", () => {
    const review = buildReview(DAY, [], [routine({ id: "a" })], [], UTC);

    expect(review.score).toBe(0);
  });

  it("ignores a deleted task, which schedules nothing", () => {
    const tasks = [
      routine({ id: "a" }),
      routine({ id: "gone", deletedAt: "2026-08-01T00:00:00Z" }),
    ];
    const review = buildReview(DAY, [done("a", DAY)], tasks, [], UTC);

    expect(review.scheduled).toBe(1);
    expect(review.score).toBe(100);
  });
});
