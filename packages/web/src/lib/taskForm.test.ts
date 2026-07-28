import {
  maskFromDays,
  WEEKDAYS,
  WEEKDAYS_MASK_WEEKDAYS,
  type Weekday,
} from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import {
  initialState,
  reduce,
  rewardHint,
  type TaskFormAction,
  type TaskFormState,
  toDueAt,
  toPayload,
  validate,
} from "./taskForm";

const run = (actions: TaskFormAction[], from = initialState()) => actions.reduce(reduce, from);

const valid = (extra: TaskFormAction[] = []) =>
  run([
    { kind: "title", value: "Stretch" },
    { kind: "effort", value: "15" },
    { kind: "weekday", value: 0 as Weekday },
    ...extra,
  ]);

describe("initial state — the done-when", () => {
  it("is blank when opened from the main button", () => {
    const s = initialState();
    expect(s.title).toBe("");
    expect(s.description).toBe("");
    expect(s.url).toBe("");
    expect(s.effortMinutes).toBe("");
    expect(s.rewardCoins).toBe("");
    expect(s.weekdays).toBe(0);
    expect(s.dueDate).toBe("");
    expect(s.epicId).toBeNull();
  });

  it("carries the epic when opened from one, and nothing else changes", () => {
    const s = initialState({ epicId: "e1" });
    expect(s.epicId).toBe("e1");
    expect({ ...s, epicId: null }).toEqual(initialState());
  });
});

describe("reward follows effort until it is overridden", () => {
  it("mirrors effort while untouched", () => {
    const s = run([{ kind: "effort", value: "45" }]);
    expect(s.rewardCoins).toBe("45");
    expect(rewardHint(s)).toBe("matches effort");
  });

  it("stops following the moment the user edits it", () => {
    const s = run([
      { kind: "effort", value: "45" },
      { kind: "reward", value: "100" },
      { kind: "effort", value: "90" },
    ]);
    expect(s.effortMinutes).toBe("90");
    expect(s.rewardCoins).toBe("100"); // not dragged along
    expect(rewardHint(s)).toBe("overridden");
  });

  it("stays overridden even if the value is typed back to match", () => {
    const s = run([
      { kind: "effort", value: "45" },
      { kind: "reward", value: "45" },
      { kind: "effort", value: "60" },
    ]);
    expect(s.rewardCoins).toBe("45");
  });

  it("omits reward from the payload while untracked, so the schema applies its own default", () => {
    expect(toPayload(valid())?.rewardCoins).toBeUndefined();
    expect(toPayload(valid([{ kind: "reward", value: "200" }]))?.rewardCoins).toBe(200);
  });
});

describe("the weekday mask — bit 0 is Monday", () => {
  it("toggles each day into its own bit", () => {
    for (let day = 0; day < 7; day++) {
      const s = run([{ kind: "weekday", value: day as Weekday }]);
      expect(s.weekdays).toBe(1 << day);
      expect(WEEKDAYS[day]).toBeTypeOf("string");
    }
  });

  it("builds Mon–Fri from five taps, not five forms", () => {
    const s = run(([0, 1, 2, 3, 4] as Weekday[]).map((value) => ({ kind: "weekday", value })));
    expect(s.weekdays).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(s.weekdays).toBe(31);
  });

  it("toggles off again", () => {
    const s = run([
      { kind: "weekday", value: 5 as Weekday },
      { kind: "weekday", value: 5 as Weekday },
    ]);
    expect(s.weekdays).toBe(0);
  });

  it("puts Saturday in bit 5 and Sunday in bit 6, not the other way round", () => {
    expect(run([{ kind: "weekday", value: 5 as Weekday }]).weekdays).toBe(maskFromDays([5]));
    expect(run([{ kind: "weekday", value: 6 as Weekday }]).weekdays).toBe(maskFromDays([6]));
  });
});

describe("switching type discards the other type's scheduling", () => {
  it("drops the due date when becoming a routine", () => {
    const s = run([
      { kind: "type", value: "oneoff" },
      { kind: "dueDate", value: "2026-08-05" },
      { kind: "dueTime", value: "09:00" },
      { kind: "type", value: "routine" },
    ]);
    expect(s.dueDate).toBe("");
    expect(s.dueTime).toBe("");
  });

  it("drops the mask when becoming a one-off", () => {
    const s = run([
      { kind: "weekday", value: 0 as Weekday },
      { kind: "weekday", value: 1 as Weekday },
      { kind: "type", value: "oneoff" },
    ]);
    expect(s.weekdays).toBe(0);
  });

  it("keeps everything else across the switch", () => {
    const s = run([
      { kind: "title", value: "Stretch" },
      { kind: "effort", value: "45" },
      { kind: "priority", value: "high" },
      { kind: "epic", value: "e1" },
      { kind: "type", value: "oneoff" },
    ]);
    expect(s).toMatchObject({
      title: "Stretch",
      effortMinutes: "45",
      priority: "high",
      epicId: "e1",
    });
  });
});

describe("the payload is clean for its type", () => {
  it("a routine sends a mask and no due date", () => {
    const payload = toPayload(valid());
    expect(payload).toMatchObject({ type: "routine", weekdays: 1 });
    expect(payload).not.toHaveProperty("dueAt");
  });

  it("a one-off sends a due date and no mask", () => {
    const payload = toPayload(
      run([
        { kind: "title", value: "Passport" },
        { kind: "effort", value: "60" },
        { kind: "type", value: "oneoff" },
        { kind: "dueDate", value: "2026-08-05" },
        { kind: "dueTime", value: "09:00" },
      ]),
    );
    expect(payload).toMatchObject({ type: "oneoff" });
    expect(payload).not.toHaveProperty("weekdays");
    expect(payload?.type === "oneoff" && payload.dueAt).toBeTypeOf("string");
  });

  it("an undated one-off sends a null due date", () => {
    const payload = toPayload(
      run([
        { kind: "title", value: "Buy milk" },
        { kind: "effort", value: "30" },
        { kind: "type", value: "oneoff" },
      ]),
    );
    expect(payload?.type === "oneoff" && payload.dueAt).toBeNull();
  });

  it("sends null rather than empty strings for the optional text fields", () => {
    const payload = toPayload(valid([{ kind: "description", value: "   " }]));
    expect(payload?.description).toBeNull();
    expect(payload?.url).toBeNull();
  });

  it("trims the title", () => {
    expect(toPayload(valid([{ kind: "title", value: "  Stretch  " }]))?.title).toBe("Stretch");
  });

  it("carries the epic through", () => {
    expect(toPayload(valid([{ kind: "epic", value: "e1" }]))?.epicId).toBe("e1");
    expect(toPayload(valid([{ kind: "epic", value: null }]))?.epicId).toBeNull();
  });
});

describe("validation", () => {
  const message = (s: TaskFormState) => validate(s);

  it("requires a title", () => {
    expect(message(run([{ kind: "effort", value: "15" }]))).toMatch(/title/i);
    expect(message(valid([{ kind: "title", value: "   " }]))).toMatch(/title/i);
  });

  it("requires a whole positive effort", () => {
    for (const value of ["", "0", "-5", "12.5", "abc"]) {
      expect(message(valid([{ kind: "effort", value }]))).toMatch(/effort/i);
    }
  });

  it("requires at least one weekday for a routine, but not for a one-off", () => {
    const noDays = run([
      { kind: "title", value: "Stretch" },
      { kind: "effort", value: "15" },
    ]);
    expect(message(noDays)).toMatch(/weekday/i);
    expect(message(reduce(noDays, { kind: "type", value: "oneoff" }))).toBeNull();
  });

  it("rejects a fractional or negative override", () => {
    expect(message(valid([{ kind: "reward", value: "12.5" }]))).toMatch(/reward/i);
    expect(message(valid([{ kind: "reward", value: "-1" }]))).toMatch(/reward/i);
    expect(message(valid([{ kind: "reward", value: "0" }]))).toBeNull(); // free is allowed
  });

  it("returns no payload while invalid", () => {
    expect(toPayload(initialState())).toBeNull();
  });
});

describe("due date and time", () => {
  it("combines them into a UTC instant that round-trips to what was picked", () => {
    const iso = toDueAt("2026-08-05", "09:30");
    expect(iso).toBeTypeOf("string");
    const back = new Date(iso as string);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(7); // August
    expect(back.getDate()).toBe(5);
    expect(back.getHours()).toBe(9);
    expect(back.getMinutes()).toBe(30);
  });

  it("treats a date with no time as local midnight", () => {
    const back = new Date(toDueAt("2026-08-05", "") as string);
    expect(back.getHours()).toBe(0);
    expect(back.getDate()).toBe(5);
  });

  it("is null with no date at all", () => {
    expect(toDueAt("", "09:00")).toBeNull();
  });
});
