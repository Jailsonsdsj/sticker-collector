import type { AlbumDetail, CreateAlbumInput, Tier, TierRecord } from "@sticker-collector/shared";
import {
  ALBUM_MAX_STICKERS,
  albumCost,
  DEFAULT_ODDS,
  TIERS,
  validateOdds,
} from "@sticker-collector/shared";

/**
 * The album being authored, before it is sealed.
 *
 * An album is sealed on creation and `sticker_frozen` blocks every later edit,
 * so this object holds the entire arrangement until the single POST that
 * commits it. Everything the user has decided lives here and nowhere else.
 *
 * Stickers carry an **image key, not bytes**. Each one is cropped and uploaded
 * as it is added, so a draft stays a few hundred bytes of JSON — small enough
 * to persist on every keystroke — and re-adding the same picture costs nothing,
 * because the key is the hash of its own content.
 */
export interface DraftSticker {
  imageKey: string;
  tier: Tier;
  /** Optional, author-written. Empty means "no title", not an empty title. */
  title: string;
  description: string;
}

export interface AlbumDraft {
  title: string;
  description: string;
  coverKey: string | null;
  stickers: DraftSticker[];
  unlockPrice: number;
  randomPrice: number;
  prices: TierRecord<number>;
  odds: TierRecord<number>;
  /**
   * Set when this album is a new **edition** of an existing one. It carries the
   * artwork and the pricing forward; it carries no ownership, and the source
   * album is untouched (`prd/04-albums.md` §Creating from existing).
   */
  derivedFromAlbumId: string | null;
  /** Hide slots that have not been collected yet. */
  hideLocked: boolean;
  /** One stand-in image for every locked slot. Only meaningful with `hideLocked`. */
  lockedCoverKey: string | null;
}

/**
 * The wizard opens on a working economy rather than four empty fields
 * (`prd/04-albums.md` §Creating 8) — the user starts from something sealable
 * and adjusts, instead of having to invent ten numbers to see anything at all.
 */
export const initialDraft: AlbumDraft = {
  title: "",
  description: "",
  coverKey: null,
  stickers: [],
  unlockPrice: 500,
  randomPrice: 40,
  prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
  odds: DEFAULT_ODDS,
  derivedFromAlbumId: null,
  hideLocked: false,
  lockedCoverKey: null,
};

/**
 * A draft seeded from an album that already exists.
 *
 * Nothing is uploaded and nothing is cropped: the artwork comes across as image
 * **keys**, which is the whole reason this mode exists — a new version of an
 * album without re-importing its pictures.
 *
 * Ownership cannot come with it, because a draft has no way to express it. The
 * new album's stickers are `{imageKey, tier}` and nothing else, so every one of
 * them starts locked and must be earned again.
 */
export function draftFromAlbum(source: AlbumDetail): AlbumDraft {
  return {
    title: source.album.title,
    description: source.album.description ?? "",
    coverKey: source.album.coverKey,
    stickers: [...source.stickers]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      // A new edition carries the artwork and the words with it — re-typing a
      // hundred sticker names to reprint the same album would be absurd.
      .map((sticker) => ({
        imageKey: sticker.imageKey,
        tier: sticker.tier,
        title: sticker.title ?? "",
        description: sticker.description ?? "",
      })),
    unlockPrice: source.album.unlockPrice,
    randomPrice: source.album.randomPrice,
    prices: { ...source.album.prices },
    odds: { ...source.album.odds },
    derivedFromAlbumId: source.album.id,
    hideLocked: source.album.hideLocked,
    lockedCoverKey: source.album.lockedCoverKey,
  };
}

/**
 * True while the user has decided nothing yet — the only moment it makes sense
 * to ask "from scratch, or from an existing album?". A draft that survived a
 * refresh has already answered.
 */
export function isPristine(draft: AlbumDraft): boolean {
  return (
    draft.title.trim() === "" &&
    draft.description.trim() === "" &&
    draft.coverKey === null &&
    draft.stickers.length === 0 &&
    draft.derivedFromAlbumId === null
  );
}

export type DraftAction =
  | { type: "field"; field: "title" | "description"; value: string }
  | { type: "cover"; imageKey: string }
  | { type: "addSticker"; imageKey: string; tier?: Tier }
  | { type: "removeSticker"; imageKey: string }
  | { type: "retier"; imageKey: string; tier: Tier }
  | { type: "describeSticker"; imageKey: string; field: "title" | "description"; value: string }
  | { type: "hideLocked"; value: boolean }
  | { type: "lockedCover"; imageKey: string | null }
  | { type: "price"; field: "unlockPrice" | "randomPrice"; value: number }
  | { type: "tierPrice"; tier: Tier; value: number }
  | { type: "odds"; tier: Tier; value: number }
  | { type: "resetOdds" }
  | { type: "replace"; draft: AlbumDraft };

export function reduce(state: AlbumDraft, action: DraftAction): AlbumDraft {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value };

    case "cover":
      return { ...state, coverKey: action.imageKey };

    case "addSticker": {
      // The same picture twice would be the same content address, and the album
      // grid would show one slot twice. Adding it again is a no-op, not an error.
      if (state.stickers.some((s) => s.imageKey === action.imageKey)) return state;
      if (state.stickers.length >= ALBUM_MAX_STICKERS) return state;
      return {
        ...state,
        stickers: [
          ...state.stickers,
          { imageKey: action.imageKey, tier: action.tier ?? "common", title: "", description: "" },
        ],
      };
    }

    case "removeSticker":
      return {
        ...state,
        stickers: state.stickers.filter((s) => s.imageKey !== action.imageKey),
      };

    case "retier":
      return {
        ...state,
        stickers: state.stickers.map((s) =>
          s.imageKey === action.imageKey ? { ...s, tier: action.tier } : s,
        ),
      };

    case "describeSticker":
      return {
        ...state,
        stickers: state.stickers.map((s) =>
          s.imageKey === action.imageKey ? { ...s, [action.field]: action.value } : s,
        ),
      };

    case "hideLocked":
      // Turning it off drops the cover with it: a stand-in for slots that are
      // no longer hidden is a key nothing will ever read.
      return {
        ...state,
        hideLocked: action.value,
        lockedCoverKey: action.value ? state.lockedCoverKey : null,
      };

    case "lockedCover":
      return { ...state, lockedCoverKey: action.imageKey };

    case "price":
      return { ...state, [action.field]: clampCoins(action.value) };

    case "tierPrice":
      return { ...state, prices: { ...state.prices, [action.tier]: clampCoins(action.value) } };

    case "odds":
      return { ...state, odds: { ...state.odds, [action.tier]: clampOdds(action.value) } };

    case "resetOdds":
      return { ...state, odds: DEFAULT_ODDS };

    case "replace":
      return action.draft;
  }
}

export interface DraftProblems {
  title?: string;
  coverKey?: string;
  stickers?: string;
  randomPrice?: string;
  odds?: string;
}

/**
 * What still stands between this draft and a sealed album.
 *
 * The odds rule comes from `validateOdds` rather than being restated here: one
 * rule, three consumers — this wizard, the request schema and the database
 * CHECK. A second copy would be a second thing to keep in step.
 */
export function validate(draft: AlbumDraft): DraftProblems {
  const problems: DraftProblems = {};

  if (draft.title.trim().length === 0) problems.title = "An album needs a title.";
  if (!draft.coverKey) problems.coverKey = "Choose a cover image.";
  if (draft.stickers.length === 0) problems.stickers = "Add at least one sticker.";
  if (draft.stickers.length > ALBUM_MAX_STICKERS) {
    problems.stickers = `An album holds at most ${ALBUM_MAX_STICKERS} stickers.`;
  }

  // A free pull would make a duplicate worth nothing, and "a duplicate is always
  // a net loss" would stop meaning anything.
  if (draft.randomPrice < 1) problems.randomPrice = "A random sticker must cost at least 1 coin.";

  const oddsProblem = validateOdds(draft.odds);
  if (oddsProblem) problems.odds = ODDS_MESSAGES[oddsProblem];

  return problems;
}

export function isSealable(draft: AlbumDraft): boolean {
  return Object.keys(validate(draft)).length === 0;
}

const ODDS_MESSAGES: Record<string, string> = {
  "sum-not-100": "Drop odds must add up to 100%.",
  "not-monotonic": "A rarer tier cannot be likelier than a commoner one.",
  "not-integer": "Drop odds must be whole numbers.",
  "out-of-range": "Drop odds must be between 0 and 100.",
};

/**
 * A tier with stickers but no odds is legal and deliberate — those stickers can
 * only ever be bought directly — but it is worth saying out loud at seal time
 * (`prd/05-stickers.md` §Random 5), because it is indistinguishable from a
 * typo until someone pulls a hundred times and never sees one.
 */
export function zeroOddsWarnings(draft: AlbumDraft): Tier[] {
  return TIERS.filter(
    (tier) => draft.odds[tier] === 0 && draft.stickers.some((s) => s.tier === tier),
  );
}

/** How many stickers sit in each tier — the counts the economy preview needs. */
export function tierCounts(draft: AlbumDraft): TierRecord<number> {
  const counts: TierRecord<number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const sticker of draft.stickers) counts[sticker.tier] += 1;
  return counts;
}

export function draftCost(draft: AlbumDraft): number {
  return albumCost(draft.unlockPrice, draft.prices, tierCounts(draft));
}

/** The request body. Shaped so `createAlbumSchema` is the only validator that matters. */
export function toPayload(draft: AlbumDraft): CreateAlbumInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    coverKey: draft.coverKey ?? "",
    unlockPrice: draft.unlockPrice,
    randomPrice: draft.randomPrice,
    prices: draft.prices,
    odds: draft.odds,
    stickers: draft.stickers.map((s) => ({
      imageKey: s.imageKey,
      tier: s.tier,
      // Trimmed to null: an empty box means the author wrote nothing, and
      // storing "" would make "no title" and "a blank title" the same row.
      title: s.title.trim() || null,
      description: s.description.trim() || null,
    })),
    derivedFromAlbumId: draft.derivedFromAlbumId,
    hideLocked: draft.hideLocked,
    // Dropped when nothing is hidden — the schema refuses a cover without it,
    // and carrying a stale key would fail the seal for a reason the user never
    // sees on screen.
    lockedCoverKey: draft.hideLocked ? draft.lockedCoverKey : null,
  };
}

function clampCoins(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function clampOdds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
