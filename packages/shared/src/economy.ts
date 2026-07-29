/**
 * The album economy, as pure arithmetic.
 *
 * An album is a contract of ten numbers — an unlock price, a random-sticker
 * price, and a price and a drop chance for each of the four tiers
 * (`prd/04-albums.md` §The album economy). Everything derived from those ten
 * numbers lives here: what the album costs, what a pull is worth, which tiers
 * a roll can actually reach, and what a duplicate sells for.
 *
 * Nothing in this file touches the database, the network, or the clock, and
 * nothing here generates randomness. `tierForRoll` takes the random number as
 * an argument so the API layer (A-04) supplies entropy and holds no arithmetic
 * of its own — a roll is then reproducible in a test by passing a fixed `r`.
 */

export const TIERS = ["common", "rare", "epic", "legendary"] as const;

export type Tier = (typeof TIERS)[number];

/** A value per tier. Prices, odds, sticker counts and owned counts are all this shape. */
export type TierRecord<T> = Record<Tier, T>;

/**
 * The odds the creation screen pre-fills, so the user starts from a working
 * economy rather than four empty fields (`prd/04-albums.md` §Creating 8).
 */
export const DEFAULT_ODDS: TierRecord<number> = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};

export type OddsError = "not-integer" | "out-of-range" | "sum-not-100" | "not-monotonic";

/**
 * Validates a set of drop odds. Returns the first problem, or `null` when the
 * odds are sealable.
 *
 * **Monotonicity is non-increasing, not strictly decreasing.** §Creating 8 says
 * odds "must decrease from common to legendary", but §Random 5 permits a tier
 * with zero odds — and two zero tiers (70/30/0/0) cannot be strictly
 * decreasing. Read strictly, the two rules contradict each other. Non-increasing
 * is the reading that satisfies both: a rarer tier is never more likely than a
 * commoner one, and any number of tiers may sit at zero.
 */
export function validateOdds(odds: TierRecord<number>): OddsError | null {
  for (const tier of TIERS) {
    const value = odds[tier];
    if (!Number.isInteger(value)) return "not-integer";
    if (value < 0 || value > 100) return "out-of-range";
  }

  if (sumTiers(odds) !== 100) return "sum-not-100";

  for (let i = 1; i < TIERS.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i and i-1 are both in range
    if (odds[TIERS[i]!] > odds[TIERS[i - 1]!]) return "not-monotonic";
  }

  return null;
}

/**
 * The roll weights, after empty tiers are excluded (`prd/05-stickers.md`
 * §Random 4).
 *
 * The spec says an empty tier's odds are "redistributed proportionally across
 * the remaining tiers". Doing that arithmetically would mean dividing the
 * orphaned share among the survivors in proportion to their odds — which is
 * *exactly* renormalising the survivors' original odds. So the redistribution
 * needs no arithmetic at all: keep the surviving odds as integer weights and
 * let the denominator be their sum. Nothing is rounded, so nothing drifts, and
 * the proportions between surviving tiers are preserved by construction rather
 * than by luck.
 *
 * The sum of the result may legitimately be zero — every tier empty, or every
 * non-empty tier given zero odds. That is not an error; it is the condition
 * `canPullRandom` reports on.
 */
export function effectiveWeights(
  odds: TierRecord<number>,
  counts: TierRecord<number>,
): TierRecord<number> {
  return mapTiers((tier) => (counts[tier] > 0 ? odds[tier] : 0));
}

/**
 * The effective odds as whole percentages, for display beside the declared
 * ones. Uses largest-remainder so the four numbers always sum to exactly 100
 * and the user is never shown odds totalling 99.
 *
 * Display only — the roll uses the weights directly and never these.
 */
export function effectiveOddsPercent(weights: TierRecord<number>): TierRecord<number> {
  const total = sumTiers(weights);
  if (total === 0) return mapTiers(() => 0);

  const scaled = TIERS.map((tier) => {
    const exact = weights[tier] * 100;
    return { tier, floor: Math.floor(exact / total), remainder: exact % total };
  });

  let left = 100 - scaled.reduce((sum, entry) => sum + entry.floor, 0);
  // Largest remainder first; ties go to the commoner tier, which TIERS already orders.
  const order = [...scaled].sort((a, b) => b.remainder - a.remainder);

  const result = mapTiers(() => 0);
  for (const entry of scaled) result[entry.tier] = entry.floor;
  for (const entry of order) {
    if (left <= 0) break;
    result[entry.tier] += 1;
    left -= 1;
  }
  return result;
}

/**
 * What the album costs in full: the unlock price plus every sticker's tier
 * price (`prd/04-albums.md` §The album economy 1). A sticker has no price of
 * its own — it is the price of its tier, in this album (§Creating 7).
 */
export function albumCost(
  unlockPrice: number,
  prices: TierRecord<number>,
  counts: TierRecord<number>,
): number {
  let total = unlockPrice;
  for (const tier of TIERS) total += prices[tier] * counts[tier];
  return total;
}

/**
 * Coins as time, because one coin is one minute (`prd/04-albums.md` §The album
 * economy 1). Returned split rather than formatted so the caller decides
 * between "70 hours" and "70 h 20 m".
 */
export function coinsToHours(coins: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.trunc(coins));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/**
 * The expected value of a random pull as an exact fraction: the sum of each
 * tier's price weighted by its chance of being rolled.
 *
 * The weights are the **effective** ones, not the declared odds. After the seal
 * the sticker set is known, so a tier holding no stickers can never be pulled;
 * weighting it by its declared odds would advertise a payout the user can never
 * receive. The honest number is the one they will actually experience.
 */
export function expectedRandomValueExact(
  prices: TierRecord<number>,
  weights: TierRecord<number>,
): { numerator: number; denominator: number } {
  const denominator = sumTiers(weights);
  if (denominator === 0) return { numerator: 0, denominator: 1 };

  let numerator = 0;
  for (const tier of TIERS) numerator += prices[tier] * weights[tier];
  return { numerator, denominator };
}

/**
 * The expected value rounded to whole coins, for display beside the
 * random-sticker price. Rounds half up using integer arithmetic — the economy
 * has no floats in it (see CLAUDE.md).
 */
export function expectedRandomValue(
  prices: TierRecord<number>,
  weights: TierRecord<number>,
): number {
  const { numerator, denominator } = expectedRandomValueExact(prices, weights);
  // floor(n/d + 1/2), kept in integers: floor((2n + d) / 2d).
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * What a duplicate sells for: half the album's random-sticker price
 * (`prd/05-stickers.md` §5).
 *
 * Floored, which is what makes a duplicate "always a net loss, under any values
 * the user sets" (`prd/01-coins.md`). Rounding up would let an odd price of 1
 * refund the full pull, and gambling would be free.
 */
export function duplicateRefund(randomPrice: number): number {
  if (randomPrice <= 0) return 0;
  return Math.floor(randomPrice / 2);
}

export interface PullAvailability {
  weights: TierRecord<number>;
  counts: TierRecord<number>;
  owned: TierRecord<number>;
}

/**
 * Whether a random pull can return something the user does not already own
 * (`prd/05-stickers.md` §Random 6).
 *
 * False when every remaining sticker sits in a zero-odds tier, and false when
 * the album is complete — the spec calls the second a special case of the
 * first, and here it genuinely is: completing the album empties every tier of
 * unowned stickers, so the same condition catches it. Otherwise the user would
 * be paying for a guaranteed duplicate.
 */
export function canPullRandom({ weights, counts, owned }: PullAvailability): boolean {
  return TIERS.some((tier) => weights[tier] > 0 && owned[tier] < counts[tier]);
}

/**
 * Stage one of the roll: pick a tier from the weights, given `r` in [0, 1).
 *
 * Returns `null` when no tier is reachable, so an impossible roll is a value
 * the caller must handle rather than an exception thrown from inside a
 * purchase. Stage two — choosing a sticker uniformly within the tier — belongs
 * to the caller, since it needs the album's sticker rows.
 */
export function tierForRoll(weights: TierRecord<number>, r: number): Tier | null {
  // Filtering first is what makes "never returns an excluded tier" structural:
  // a tier the roll cannot reach is not a candidate on any path through this
  // function, including the fallback below.
  const reachable = TIERS.filter((tier) => weights[tier] > 0);
  if (reachable.length === 0) return null;

  const total = sumTiers(weights);
  const clamped = Number.isFinite(r) ? Math.min(Math.max(r, 0), 1 - Number.EPSILON) : 0;
  const target = clamped * total;

  let cumulative = 0;
  for (const tier of reachable) {
    cumulative += weights[tier];
    if (target < cumulative) return tier;
  }

  // Unreachable while r < 1 — x * (1 - 2⁻⁵²) < x for every x, so `target` can
  // never equal the total. Kept because the alternative to an unreachable
  // return is an undefined one.
  return reachable[reachable.length - 1] as Tier;
}

function sumTiers(values: TierRecord<number>): number {
  let total = 0;
  for (const tier of TIERS) total += values[tier];
  return total;
}

function mapTiers(fn: (tier: Tier) => number): TierRecord<number> {
  return {
    common: fn("common"),
    rare: fn("rare"),
    epic: fn("epic"),
    legendary: fn("legendary"),
  };
}

/**
 * A random slot order for an album's stickers, as a permutation of `0…count-1`.
 *
 * On sealing, the stickers are shuffled into the grid and that order is stored
 * — it is not re-shuffled on every view, and the print export uses the same
 * order (`prd/04-albums.md` §Creating 10).
 *
 * Fisher–Yates, so every permutation is equally likely. The obvious
 * alternative, `sort(() => rand() - 0.5)`, is measurably biased: it would leave
 * stickers near their submitted positions, and since the wizard is likely to
 * submit tiers in groups, the legendary slots would cluster in the same corner
 * of every album.
 *
 * Randomness arrives as an argument, so the caller supplies `crypto` and a test
 * supplies a fixed sequence.
 */
export function shuffleOrder(count: number, rand: () => number): number[] {
  const order = Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rand() * (i + 1))));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}
