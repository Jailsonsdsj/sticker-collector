import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIECES,
  type DraftAction,
  draftGrid,
  initialDraft,
  isPristine,
  isSealable,
  type PuzzleDraft,
  reduce,
  toPayload,
  totalCost,
  validate,
} from "./puzzleDraft";

const KEY = `img/${"a".repeat(64)}.jpg`;

const ready = (over: Partial<PuzzleDraft> = {}): PuzzleDraft => ({
  ...initialDraft,
  title: "The harbour",
  imageKey: KEY,
  ...over,
});

const apply = (draft: PuzzleDraft, ...actions: DraftAction[]) => actions.reduce(reduce, draft);

describe("what the form refuses to seal", () => {
  it("wants a title", () => {
    expect(validate(ready({ title: "  " }))).toMatch(/title/i);
  });

  it("wants the picture, since there is nothing to cut up without it", () => {
    expect(validate(ready({ imageKey: null }))).toMatch(/picture/i);
  });

  it("refuses a price that is empty rather than reading it as free", () => {
    // The reason prices are strings: a cleared number field is neither 0 nor
    // NaN, and a draft that cannot hold "empty" turns a half-typed price into a
    // real one.
    expect(validate(ready({ unlockPrice: "" }))).toMatch(/unlock price/i);
    expect(validate(ready({ piecePrice: "" }))).toMatch(/piece price/i);
  });

  it("refuses a fraction and a negative", () => {
    expect(validate(ready({ piecePrice: "2.5" }))).not.toBeNull();
    expect(validate(ready({ piecePrice: "-1" }))).not.toBeNull();
  });

  it("allows free, which is a choice and not a mistake", () => {
    // Zero is a real answer: a puzzle you unlock for nothing still costs coins
    // per piece, and one with free pieces is a picture you assemble at leisure.
    expect(validate(ready({ unlockPrice: "0", piecePrice: "0" }))).toBeNull();
  });

  it("passes a draft that has everything", () => {
    expect(validate(ready())).toBeNull();
    expect(isSealable(ready())).toBe(true);
  });
});

describe("leaving without saving", () => {
  it("is pristine before anything is touched", () => {
    expect(isPristine(initialDraft)).toBe(true);
  });

  it("is not pristine once a picture is picked", () => {
    // The image is already uploaded by then — the bytes are on the server and
    // the user has done real work.
    expect(
      isPristine(apply(initialDraft, { kind: "image", value: KEY, width: 1536, height: 864 })),
    ).toBe(false);
  });

  it("is not pristine once a price is changed", () => {
    expect(isPristine(apply(initialDraft, { kind: "piecePrice", value: "25" }))).toBe(false);
  });

  it("notices a title of only spaces is still nothing", () => {
    expect(isPristine(apply(initialDraft, { kind: "title", value: "   " }))).toBe(true);
  });
});

describe("what it will cost to finish", () => {
  it("is the unlock plus every piece", () => {
    // Two small numbers that multiply into a large one. Worth knowing before
    // the puzzle is immutable rather than after.
    expect(totalCost(ready({ unlockPrice: "200", piecePrice: "10", pieces: 48 }))).toBe(680);
  });

  it("counts a free unlock as free rather than as nothing typed", () => {
    expect(totalCost(ready({ unlockPrice: "0", piecePrice: "10", pieces: 12 }))).toBe(120);
  });

  it("treats an empty price as zero rather than NaN", () => {
    // The form shows this while the user is still typing.
    expect(totalCost(ready({ unlockPrice: "", piecePrice: "10", pieces: 12 }))).toBe(120);
  });
});

describe("the grid the form shows", () => {
  it("follows the preset", () => {
    expect(draftGrid(ready({ pieces: 48 }))).toEqual({ rows: 6, cols: 8 });
    expect(draftGrid(ready({ pieces: 144 }))).toEqual({ rows: 12, cols: 12 });
  });

  it("starts at a count worth playing", () => {
    expect(initialDraft.pieces).toBe(DEFAULT_PIECES);
    expect(draftGrid(initialDraft)).toEqual({ rows: 6, cols: 8 });
  });
});

describe("the payload", () => {
  it("is null until the draft is ready, so a bad form cannot be sent", () => {
    expect(toPayload(ready({ title: "" }))).toBeNull();
    expect(toPayload(ready({ imageKey: null }))).toBeNull();
  });

  it("sends the count, not the grid — the server derives and stores that", () => {
    // One source of truth for the cut. If the client sent rows and cols, two
    // implementations of `gridFor` could disagree about the same puzzle.
    const payload = toPayload(ready({ pieces: 96 }));
    expect(payload).toMatchObject({ pieces: 96 });
    expect(payload).not.toHaveProperty("rows");
  });

  it("trims, and turns an empty description into null", () => {
    const payload = toPayload(ready({ title: "  The harbour  ", description: "   " }));
    expect(payload).toMatchObject({ title: "The harbour", description: null });
  });

  it("sends numbers, having held strings", () => {
    const payload = toPayload(ready({ unlockPrice: "200", piecePrice: "10" }));
    expect(payload).toMatchObject({ unlockPrice: 200, piecePrice: 10 });
  });

  it("carries the hide-locked choice", () => {
    expect(toPayload(ready({ hideLocked: true }))).toMatchObject({ hideLocked: true });
  });
});

describe("pricing the gamble", () => {
  it("is optional — a puzzle without one simply has no gamble", () => {
    expect(validate(ready({ randomPrice: "" }))).toBeNull();
    expect(toPayload(ready({ randomPrice: "" }))).toMatchObject({ randomPrice: null });
  });

  it("must be worth something once it is offered", () => {
    // A free pull is not a pull — the same floor an album's random price has.
    expect(validate(ready({ randomPrice: "0" }))).toMatch(/at least 1/i);
    expect(validate(ready({ randomPrice: "-5" }))).not.toBeNull();
    expect(validate(ready({ randomPrice: "2.5" }))).not.toBeNull();
  });

  it("passes it through as a number", () => {
    expect(toPayload(ready({ randomPrice: "40" }))).toMatchObject({ randomPrice: 40 });
  });

  it("counts as a change worth asking about before leaving", () => {
    expect(isPristine(apply(initialDraft, { kind: "randomPrice", value: "40" }))).toBe(false);
  });
});
