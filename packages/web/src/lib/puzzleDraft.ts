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
  /** Set once the cropped bytes are stored. Null means no image yet. */
  imageKey: string | null;
  unlockPrice: string;
  piecePrice: string;
  pieces: PiecePreset;
  hideLocked: boolean;
}

/**
 * 48 pieces to start: enough to feel like a puzzle, few enough that finishing
 * one is imaginable at a sane price.
 */
export const DEFAULT_PIECES: PiecePreset = 48;

export const initialDraft: PuzzleDraft = {
  title: "",
  description: "",
  imageKey: null,
  unlockPrice: "200",
  piecePrice: "10",
  pieces: DEFAULT_PIECES,
  hideLocked: false,
};

export type DraftAction =
  | { kind: "title"; value: string }
  | { kind: "description"; value: string }
  | { kind: "image"; value: string }
  | { kind: "unlockPrice"; value: string }
  | { kind: "piecePrice"; value: string }
  | { kind: "pieces"; value: PiecePreset }
  | { kind: "hideLocked"; value: boolean };

export function reduce(state: PuzzleDraft, action: DraftAction): PuzzleDraft {
  switch (action.kind) {
    case "title":
      return { ...state, title: action.value };
    case "description":
      return { ...state, description: action.value };
    case "image":
      return { ...state, imageKey: action.value };
    case "unlockPrice":
      return { ...state, unlockPrice: action.value };
    case "piecePrice":
      return { ...state, piecePrice: action.value };
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

/** The grid this many pieces will be cut into, for the form to show. */
export function draftGrid(draft: PuzzleDraft) {
  return gridFor(draft.pieces);
}

/** The create payload, or null when the draft is not ready. */
export function toPayload(draft: PuzzleDraft): CreatePuzzleInput | null {
  if (!isSealable(draft) || !draft.imageKey) return null;

  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    imageKey: draft.imageKey,
    unlockPrice: coins(draft.unlockPrice) ?? 0,
    piecePrice: coins(draft.piecePrice) ?? 0,
    pieces: draft.pieces,
    hideLocked: draft.hideLocked,
  };
}
