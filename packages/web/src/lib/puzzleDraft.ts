import {
  type CreatePuzzleInput,
  gridFor,
  PIECE_PRESETS,
  type PiecePreset,
} from "@sticker-collector/shared";

/**
 * The puzzle form, as state and rules rather than as a component.
 *
 * Same split as `albumDraft.ts`, for the same reason: a puzzle is **sealed on
 * creation**, so the whole screen is one long-lived form and nothing reaches
 * the server until the final POST except the image, which is uploaded as soon
 * as it is cropped. Everything that can be wrong about the form is decided
 * here, where it can be tested without a DOM.
 *
 * Prices are held as **strings**, not numbers. A number field that has been
 * cleared is neither 0 nor NaN — it is empty, and a draft that cannot represent
 * "empty" turns a half-typed price into a real one.
 */
export interface PuzzleDraft {
  title: string;
  description: string;
  /** Set once the bytes are stored. Null means no image yet. */
  imageKey: string | null;
  /**
   * The stored master's shape.
   *
   * Carried because a puzzle keeps the picture it was imported at rather than
   * cropping it square, so nothing downstream can infer it — the grid follows
   * it and the board lays it out.
   */
  imageWidth: number;
  imageHeight: number;
  unlockPrice: string;
  piecePrice: string;
  /** One random locked piece. Empty means the author is not offering one. */
  randomPrice: string;
  pieces: PiecePreset;
  hideLocked: boolean;
}

/**
 * The full 144: the author's own default, set from use rather than from guessing.
 *
 * It was 48, on the reasoning that a smaller puzzle is finishable at a sane
 * price. In practice every puzzle made was the big one — a picture worth
 * cutting up is worth cutting up properly — and starting two taps away from the
 * count you always pick is a form arguing with its user.
 */
export const DEFAULT_PIECES: PiecePreset = 144;

/**
 * Where the form starts.
 *
 * These are prices, not rules: every one of them is editable before sealing and
 * none is enforced anywhere. They are here so the common puzzle takes a title
 * and a picture and nothing else.
 *
 * Note what the random price being *filled in* means — a new puzzle now offers
 * the gamble by default, where an empty field means no gamble at all. Clearing
 * it is still how you opt out.
 */
export const initialDraft: PuzzleDraft = {
  title: "",
  description: "",
  imageKey: null,
  imageWidth: 0,
  imageHeight: 0,
  unlockPrice: "1000",
  piecePrice: "150",
  randomPrice: "100",
  pieces: DEFAULT_PIECES,
  hideLocked: false,
};

export type DraftAction =
  | { kind: "title"; value: string }
  | { kind: "description"; value: string }
  | { kind: "image"; value: string; width: number; height: number }
  | { kind: "unlockPrice"; value: string }
  | { kind: "piecePrice"; value: string }
  | { kind: "randomPrice"; value: string }
  | { kind: "pieces"; value: PiecePreset }
  | { kind: "hideLocked"; value: boolean };

export function reduce(state: PuzzleDraft, action: DraftAction): PuzzleDraft {
  switch (action.kind) {
    case "title":
      return { ...state, title: action.value };
    case "description":
      return { ...state, description: action.value };
    case "image":
      return {
        ...state,
        imageKey: action.value,
        imageWidth: action.width,
        imageHeight: action.height,
      };
    case "unlockPrice":
      return { ...state, unlockPrice: action.value };
    case "piecePrice":
      return { ...state, piecePrice: action.value };
    case "randomPrice":
      return { ...state, randomPrice: action.value };
    case "pieces":
      return { ...state, pieces: action.value };
    case "hideLocked":
      return { ...state, hideLocked: action.value };
  }
}

/** Nothing typed and nothing picked — safe to leave without asking. */
export function isPristine(draft: PuzzleDraft): boolean {
  return (
    draft.title.trim() === "" &&
    draft.description.trim() === "" &&
    draft.imageKey === null &&
    draft.unlockPrice === initialDraft.unlockPrice &&
    draft.piecePrice === initialDraft.piecePrice &&
    draft.randomPrice === initialDraft.randomPrice &&
    draft.pieces === initialDraft.pieces &&
    draft.hideLocked === initialDraft.hideLocked
  );
}

/** A whole number of coins, or null. Empty is null, not zero. */
function coins(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The one thing standing between the form and a puzzle that cannot be played.
 *
 * Returns the first problem, in the order the form reads — a list of every
 * fault at once is a wall of red on a form the user has barely started.
 */
export function validate(draft: PuzzleDraft): string | null {
  if (draft.title.trim() === "") return "A title is required.";
  if (!draft.imageKey) return "Pick the picture to cut up.";
  if (coins(draft.unlockPrice) === null) {
    return "The unlock price must be a whole number of coins.";
  }
  if (coins(draft.piecePrice) === null) {
    return "The piece price must be a whole number of coins.";
  }
  if (!PIECE_PRESETS.includes(draft.pieces)) return "Pick how many pieces.";
  // Empty is a real answer — no gamble on this puzzle. A price that is *there*
  // has to be worth something: a free pull is not a pull.
  if (draft.randomPrice.trim() !== "") {
    const random = coins(draft.randomPrice);
    if (random === null || random < 1) return "A random piece must cost at least 1 coin.";
  }
  return null;
}

export function isSealable(draft: PuzzleDraft): boolean {
  return validate(draft) === null;
}

/**
 * What finishing this puzzle costs, all in: the unlock plus every piece.
 *
 * Shown before sealing because the two prices are small numbers that multiply
 * into a large one — 144 pieces at 10 coins is a fortnight of tasks, and that
 * is worth knowing before the puzzle is immutable rather than after.
 */
export function totalCost(draft: PuzzleDraft): number {
  return (coins(draft.unlockPrice) ?? 0) + (coins(draft.piecePrice) ?? 0) * draft.pieces;
}

/**
 * The grid this many pieces will be cut into, for the form to show.
 *
 * Follows the picture once there is one: 48 pieces of a wide photo cut 6×8,
 * not 8×6. Before a picture is picked there is no shape to follow, so it falls
 * back to the balanced pair.
 */
export function draftGrid(draft: PuzzleDraft) {
  return gridFor(draft.pieces, { width: draft.imageWidth, height: draft.imageHeight });
}

/** The create payload, or null when the draft is not ready. */
export function toPayload(draft: PuzzleDraft): CreatePuzzleInput | null {
  if (!isSealable(draft) || !draft.imageKey) return null;

  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    imageKey: draft.imageKey,
    imageWidth: draft.imageWidth,
    imageHeight: draft.imageHeight,
    unlockPrice: coins(draft.unlockPrice) ?? 0,
    piecePrice: coins(draft.piecePrice) ?? 0,
    randomPrice: draft.randomPrice.trim() === "" ? null : (coins(draft.randomPrice) ?? null),
    pieces: draft.pieces,
    hideLocked: draft.hideLocked,
  };
}
