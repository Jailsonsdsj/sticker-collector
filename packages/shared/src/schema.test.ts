import { describe, expect, it } from "vitest";
import { WEEKDAYS_MASK_ALL, WEEKDAYS_MASK_WEEKDAYS } from "./recurrence.js";
import {
  ALBUM_MAX_STICKERS,
  bulkTaskIdsSchema,
  createAlbumSchema,
  createEpicSchema,
  createTaskSchema,
  DEFAULT_EFFORT_MINUTES,
  deleteEpicSchema,
  epicAccentSchema,
  occurrenceWindowQuerySchema,
  quickAddTaskSchema,
  updateTaskSchema,
  weekdayMaskSchema,
} from "./schema.js";

const routine = {
  type: "routine" as const,
  title: "Stretch",
  effortMinutes: 15,
  weekdays: WEEKDAYS_MASK_WEEKDAYS,
};
const oneoff = { type: "oneoff" as const, title: "Renew passport", effortMinutes: 60 };

describe("createTaskSchema — the routine / one-off split", () => {
  it("accepts a routine with a mask", () => {
    expect(createTaskSchema.safeParse(routine).success).toBe(true);
  });

  it("rejects a routine with no mask — a routine with no days is not a routine", () => {
    const { weekdays, ...noMask } = routine;
    expect(createTaskSchema.safeParse(noMask).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...routine, weekdays: 0 }).success).toBe(false);
  });

  it("rejects a mask outside 7 bits", () => {
    expect(weekdayMaskSchema.safeParse(WEEKDAYS_MASK_ALL).success).toBe(true);
    expect(weekdayMaskSchema.safeParse(WEEKDAYS_MASK_ALL + 1).success).toBe(false);
    expect(weekdayMaskSchema.safeParse(-1).success).toBe(false);
    expect(weekdayMaskSchema.safeParse(1.5).success).toBe(false);
  });

  // Request schemas are strict. Zod's default is to strip unknown keys, which
  // would silently discard the user's due date and hide the client bug that
  // sent it — the wrong outcome at an API boundary.
  it("rejects a routine carrying a due date", () => {
    const parsed = createTaskSchema.safeParse({ ...routine, dueAt: "2025-08-05T09:00:00Z" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a one-off carrying a weekday mask", () => {
    const parsed = createTaskSchema.safeParse({ ...oneoff, weekdays: WEEKDAYS_MASK_WEEKDAYS });
    expect(parsed.success).toBe(false);
  });

  it("rejects any unknown field", () => {
    expect(createTaskSchema.safeParse({ ...routine, colour: "#ff0000" }).success).toBe(false);
  });

  it("accepts a one-off with or without a due date", () => {
    expect(createTaskSchema.safeParse(oneoff).success).toBe(true);
    expect(createTaskSchema.safeParse({ ...oneoff, dueAt: "2025-08-05T09:00:00Z" }).success).toBe(
      true,
    );
    expect(createTaskSchema.safeParse({ ...oneoff, dueAt: null }).success).toBe(true);
  });

  it("names the offending field rather than saying 'invalid task'", () => {
    const parsed = createTaskSchema.safeParse({ ...routine, weekdays: 0 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("weekdays"))).toBe(true);
    }
  });
});

describe("createTaskSchema — bounds", () => {
  it("rejects endsOn before startsOn", () => {
    const parsed = createTaskSchema.safeParse({
      ...routine,
      startsOn: "2025-08-05",
      endsOn: "2025-07-30",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("endsOn"))).toBe(true);
    }
  });

  it("accepts equal start and end — a routine for exactly one day", () => {
    expect(
      createTaskSchema.safeParse({ ...routine, startsOn: "2025-08-05", endsOn: "2025-08-05" })
        .success,
    ).toBe(true);
  });

  it("accepts either bound alone", () => {
    expect(createTaskSchema.safeParse({ ...routine, startsOn: "2025-08-05" }).success).toBe(true);
    expect(createTaskSchema.safeParse({ ...routine, endsOn: "2025-08-05" }).success).toBe(true);
  });

  it("rejects a date that does not exist", () => {
    expect(createTaskSchema.safeParse({ ...routine, startsOn: "2025-02-30" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...routine, startsOn: "2025-8-5" }).success).toBe(false);
  });
});

describe("createTaskSchema — the economy is integer coins", () => {
  it("defaults the reward to the effort", () => {
    const parsed = createTaskSchema.parse({ ...routine, effortMinutes: 45 });
    expect(parsed.rewardCoins).toBe(45);
  });

  it("keeps an explicit reward, including zero", () => {
    expect(createTaskSchema.parse({ ...routine, rewardCoins: 100 }).rewardCoins).toBe(100);
    expect(createTaskSchema.parse({ ...routine, rewardCoins: 0 }).rewardCoins).toBe(0);
  });

  it("rejects fractional or negative coins and minutes", () => {
    expect(createTaskSchema.safeParse({ ...routine, rewardCoins: 12.5 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...routine, rewardCoins: -1 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...routine, effortMinutes: 0 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...routine, effortMinutes: 30.5 }).success).toBe(false);
  });

  it("defaults priority to medium — it never affects the reward", () => {
    expect(createTaskSchema.parse(routine).priority).toBe("medium");
  });

  it("trims and requires a title", () => {
    expect(createTaskSchema.safeParse({ ...routine, title: "   " }).success).toBe(false);
    expect(createTaskSchema.parse({ ...routine, title: "  Stretch  " }).title).toBe("Stretch");
  });
});

describe("updateTaskSchema", () => {
  it("accepts a single field", () => {
    expect(updateTaskSchema.safeParse({ title: "New name" }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("still enforces the date bounds", () => {
    expect(
      updateTaskSchema.safeParse({ startsOn: "2025-08-05", endsOn: "2025-07-30" }).success,
    ).toBe(false);
  });

  it("does not let the type change after creation", () => {
    expect(updateTaskSchema.safeParse({ type: "oneoff", title: "x" }).success).toBe(false);
  });

  it("rejects unknown fields rather than silently dropping them", () => {
    expect(updateTaskSchema.safeParse({ title: "x", colour: "#ff0000" }).success).toBe(false);
  });
});

describe("quickAddTaskSchema", () => {
  it("takes a title and nothing else", () => {
    expect(quickAddTaskSchema.safeParse({ title: "Buy milk" }).success).toBe(true);
    expect(quickAddTaskSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("names a default effort so two call sites cannot disagree", () => {
    expect(DEFAULT_EFFORT_MINUTES).toBe(30);
  });
});

describe("bulkTaskIdsSchema", () => {
  it("needs at least one id", () => {
    expect(bulkTaskIdsSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(bulkTaskIdsSchema.safeParse({ ids: ["a", "b"] }).success).toBe(true);
  });
});

describe("occurrenceWindowQuerySchema", () => {
  it("rejects an inverted window", () => {
    expect(
      occurrenceWindowQuerySchema.safeParse({ from: "2025-08-10", to: "2025-08-01" }).success,
    ).toBe(false);
  });

  it("accepts a single day", () => {
    expect(
      occurrenceWindowQuerySchema.safeParse({ from: "2025-08-01", to: "2025-08-01" }).success,
    ).toBe(true);
  });
});

describe("epic payloads", () => {
  it("takes an accent token, never a colour", () => {
    expect(epicAccentSchema.safeParse("epic-3").success).toBe(true);
    expect(epicAccentSchema.safeParse("#c65cff").success).toBe(false);
    expect(createEpicSchema.parse({ title: "Sticker App" }).accent).toBe("epic-1");
  });

  it("forces a choice when deleting — one option destroys work", () => {
    expect(deleteEpicSchema.safeParse({ mode: "cascade" }).success).toBe(true);
    expect(deleteEpicSchema.safeParse({ mode: "unlink" }).success).toBe(true);
    expect(deleteEpicSchema.safeParse({}).success).toBe(false);
    expect(deleteEpicSchema.safeParse({ mode: "delete" }).success).toBe(false);
  });
});

describe("album payloads", () => {
  const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

  const album = (over: Record<string, unknown> = {}) => ({
    title: "Kitchen heroes",
    coverKey: key(1),
    unlockPrice: 500,
    randomPrice: 40,
    prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
    odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
    stickers: [{ imageKey: key(2), tier: "common" }],
    ...over,
  });

  // The wizard validates with this same schema before it seals, so these rules
  // have to hold in the browser, not only at the route.
  it("accepts a sealable album", () => {
    expect(createAlbumSchema.safeParse(album()).success).toBe(true);
  });

  it("applies the same odds rule the route and the CHECK apply", () => {
    expect(
      createAlbumSchema.safeParse(album({ odds: { common: 60, rare: 25, epic: 12, legendary: 2 } }))
        .success,
    ).toBe(false);
    expect(
      createAlbumSchema.safeParse(album({ odds: { common: 25, rare: 60, epic: 12, legendary: 3 } }))
        .success,
    ).toBe(false);
    expect(
      createAlbumSchema.safeParse(album({ odds: { common: 70, rare: 30, epic: 0, legendary: 0 } }))
        .success,
    ).toBe(true);
  });

  it("refuses an image that is not a content address", () => {
    expect(createAlbumSchema.safeParse(album({ coverKey: "cover.jpg" })).success).toBe(false);
    expect(
      createAlbumSchema.safeParse(
        album({ stickers: [{ imageKey: "img/../x.jpg", tier: "common" }] }),
      ).success,
    ).toBe(false);
  });

  it("refuses a free random pull, which would make a duplicate cost nothing", () => {
    expect(createAlbumSchema.safeParse(album({ randomPrice: 0 })).success).toBe(false);
    expect(createAlbumSchema.safeParse(album({ randomPrice: 1 })).success).toBe(true);
  });

  it("refuses an album with no stickers, and one past the batch cap", () => {
    expect(createAlbumSchema.safeParse(album({ stickers: [] })).success).toBe(false);
    const tooMany = Array.from({ length: ALBUM_MAX_STICKERS + 1 }, (_, i) => ({
      imageKey: key(i + 1),
      tier: "common" as const,
    }));
    expect(createAlbumSchema.safeParse(album({ stickers: tooMany })).success).toBe(false);
  });

  it("is strict — a sealed field cannot be smuggled in at creation", () => {
    expect(createAlbumSchema.safeParse(album({ sealedAt: "2020-01-01T00:00:00Z" })).success).toBe(
      false,
    );
    expect(createAlbumSchema.safeParse(album({ editionNumber: 9 })).success).toBe(false);
    expect(createAlbumSchema.safeParse(album({ unlockedAt: "2020-01-01T00:00:00Z" })).success).toBe(
      false,
    );
  });
});
