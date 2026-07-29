import { describe, expect, it } from "vitest";
import {
  albumCost,
  albumStatus,
  canPullRandom,
  coinsToHours,
  completionPercent,
  DEFAULT_ODDS,
  duplicateRefund,
  effectiveOddsPercent,
  effectiveWeights,
  expectedRandomValue,
  expectedRandomValueExact,
  isAlmostThere,
  shuffleOrder,
  slotsRemaining,
  TIERS,
  type Tier,
  type TierRecord,
  tierForRoll,
  validateOdds,
} from "./economy";

const tiers = (
  common: number,
  rare: number,
  epic: number,
  legendary: number,
): TierRecord<number> => ({ common, rare, epic, legendary });

const NONE = tiers(0, 0, 0, 0);

/**
 * A deterministic generator for the "under any user values" claims. The spec
 * quantifies over every economy the user could write, and four hand-picked
 * examples do not test a quantifier — but a random seed would turn a failure
 * into something that cannot be reproduced. This is seeded, so a counterexample
 * stays a counterexample.
 */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Random odds that are valid by construction: four non-increasing integers summing to 100. */
function randomValidOdds(next: () => number): TierRecord<number> {
  const cuts = [next(), next(), next()].map((r) => Math.floor(r * 101)).sort((a, b) => a - b);
  const parts = [
    cuts[0] as number,
    (cuts[1] as number) - (cuts[0] as number),
    (cuts[2] as number) - (cuts[1] as number),
    100 - (cuts[2] as number),
  ].sort((a, b) => b - a);
  return tiers(parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number);
}

describe("validateOdds", () => {
  it("accepts the default the wizard pre-fills", () => {
    expect(validateOdds(DEFAULT_ODDS)).toBeNull();
    expect(DEFAULT_ODDS).toEqual(tiers(60, 25, 12, 3));
  });

  it("requires the odds to sum to exactly 100", () => {
    expect(validateOdds(tiers(60, 25, 12, 2))).toBe("sum-not-100");
    expect(validateOdds(tiers(60, 25, 12, 4))).toBe("sum-not-100");
    expect(validateOdds(NONE)).toBe("sum-not-100");
  });

  it("rejects a rarer tier that is likelier than a commoner one", () => {
    expect(validateOdds(tiers(25, 60, 12, 3))).toBe("not-monotonic");
    expect(validateOdds(tiers(60, 12, 25, 3))).toBe("not-monotonic");
    expect(validateOdds(tiers(60, 25, 3, 12))).toBe("not-monotonic");
  });

  it("permits a zero-odds tier — its stickers exist but can only be bought directly", () => {
    expect(validateOdds(tiers(70, 30, 0, 0))).toBeNull();
    expect(validateOdds(tiers(100, 0, 0, 0))).toBeNull();
  });

  it("permits equal tiers, because two zero tiers could not exist otherwise", () => {
    // §Creating 8 says odds "decrease"; §Random 5 permits zero-odds tiers. Read
    // strictly the two contradict, so the rule implemented is non-increasing.
    expect(validateOdds(tiers(25, 25, 25, 25))).toBeNull();
    expect(validateOdds(tiers(50, 50, 0, 0))).toBeNull();
  });

  it("rejects fractional and out-of-range odds", () => {
    expect(validateOdds(tiers(60.5, 24.5, 12, 3))).toBe("not-integer");
    expect(validateOdds(tiers(140, 0, 0, -40))).toBe("out-of-range");
  });

  it("accepts every set of odds that is non-increasing and sums to 100", () => {
    const next = lcg(20260728);
    for (let i = 0; i < 500; i++) {
      const odds = randomValidOdds(next);
      expect(validateOdds(odds)).toBeNull();
    }
  });
});

describe("effectiveWeights", () => {
  it("excludes a tier that holds no stickers", () => {
    const weights = effectiveWeights(DEFAULT_ODDS, tiers(5, 3, 0, 1));
    expect(weights).toEqual(tiers(60, 25, 0, 3));
  });

  it("redistributes proportionally — the survivors keep their ratios exactly", () => {
    // Dropping epic moves its 12 onto the others in proportion to their odds,
    // which is the same thing as renormalising what is left. So common:rare
    // must still be 60:25 after the drop, with nothing rounded away.
    const full = effectiveWeights(DEFAULT_ODDS, tiers(5, 5, 5, 5));
    const short = effectiveWeights(DEFAULT_ODDS, tiers(5, 5, 0, 5));

    expect(short.common * full.rare).toBe(short.rare * full.common);
    expect(short.common * full.legendary).toBe(short.legendary * full.common);
  });

  it("keeps every surviving pair in proportion, for any odds and any empty tiers", () => {
    const next = lcg(4242);
    for (let i = 0; i < 500; i++) {
      const odds = randomValidOdds(next);
      const counts = tiers(
        next() < 0.5 ? 0 : 1 + Math.floor(next() * 9),
        next() < 0.5 ? 0 : 1 + Math.floor(next() * 9),
        next() < 0.5 ? 0 : 1 + Math.floor(next() * 9),
        next() < 0.5 ? 0 : 1 + Math.floor(next() * 9),
      );
      const weights = effectiveWeights(odds, counts);

      for (const a of TIERS) {
        for (const b of TIERS) {
          if (weights[a] === 0 || weights[b] === 0) continue;
          // Cross-multiplied: no division, so no rounding to hide behind.
          expect(weights[a] * odds[b]).toBe(weights[b] * odds[a]);
        }
      }
    }
  });

  it("can legitimately weigh nothing at all", () => {
    expect(effectiveWeights(DEFAULT_ODDS, NONE)).toEqual(NONE);
    expect(effectiveWeights(tiers(100, 0, 0, 0), tiers(0, 4, 4, 4))).toEqual(NONE);
  });
});

describe("effectiveOddsPercent", () => {
  it("shows the redistributed odds, not the declared ones", () => {
    const weights = effectiveWeights(tiers(50, 30, 20, 0), tiers(5, 5, 0, 0));
    expect(effectiveOddsPercent(weights)).toEqual(tiers(63, 37, 0, 0));
  });

  it("always sums to 100, so the user is never shown odds totalling 99", () => {
    const next = lcg(99);
    for (let i = 0; i < 500; i++) {
      const odds = randomValidOdds(next);
      const counts = tiers(
        next() < 0.5 ? 0 : 3,
        next() < 0.5 ? 0 : 3,
        next() < 0.5 ? 0 : 3,
        next() < 0.5 ? 0 : 3,
      );
      const weights = effectiveWeights(odds, counts);
      const percent = effectiveOddsPercent(weights);
      const total = TIERS.reduce((sum, tier) => sum + percent[tier], 0);
      expect(total).toBe(TIERS.some((tier) => weights[tier] > 0) ? 100 : 0);
    }
  });

  it("never invents odds for an unreachable tier", () => {
    const percent = effectiveOddsPercent(tiers(1, 0, 0, 0));
    expect(percent).toEqual(tiers(100, 0, 0, 0));
  });
});

describe("albumCost", () => {
  it("is the unlock price plus every sticker at its tier's price", () => {
    const cost = albumCost(500, tiers(50, 100, 200, 400), tiers(10, 5, 2, 1));
    expect(cost).toBe(500 + 500 + 500 + 400 + 400);
  });

  it("prices a sticker by its tier in this album, not by the sticker", () => {
    const counts = tiers(4, 0, 0, 0);
    expect(albumCost(0, tiers(10, 999, 999, 999), counts)).toBe(40);
    expect(albumCost(0, tiers(25, 1, 1, 1), counts)).toBe(100);
  });

  it("reads as hours, because one coin is one minute", () => {
    expect(coinsToHours(4200)).toEqual({ hours: 70, minutes: 0 });
    expect(coinsToHours(4230)).toEqual({ hours: 70, minutes: 30 });
    expect(coinsToHours(59)).toEqual({ hours: 0, minutes: 59 });
    expect(coinsToHours(0)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("expectedRandomValue", () => {
  it("weights each tier's price by its chance of being rolled", () => {
    const prices = tiers(100, 200, 300, 400);
    const weights = effectiveWeights(DEFAULT_ODDS, tiers(3, 3, 3, 3));
    expect(expectedRandomValue(prices, weights)).toBe(158);
  });

  it("ignores a tier that holds no stickers", () => {
    // Legendary is priced at 10,000 but empty: it can never be pulled, so
    // advertising its price in the average would promise a payout that cannot
    // happen.
    const prices = tiers(10, 20, 30, 10_000);
    const weights = effectiveWeights(DEFAULT_ODDS, tiers(3, 3, 3, 0));
    expect(expectedRandomValue(prices, weights)).toBe(
      Math.round((10 * 60 + 20 * 25 + 30 * 12) / 97),
    );
  });

  it("keeps the exact fraction available, un-rounded", () => {
    const exact = expectedRandomValueExact(tiers(1, 2, 0, 0), tiers(1, 1, 0, 0));
    expect(exact).toEqual({ numerator: 3, denominator: 2 });
  });

  it("rounds half up", () => {
    expect(expectedRandomValue(tiers(1, 2, 0, 0), tiers(1, 1, 0, 0))).toBe(2);
    expect(expectedRandomValue(tiers(1, 4, 0, 0), tiers(3, 1, 0, 0))).toBe(2);
  });

  it("is zero when nothing is reachable, rather than dividing by zero", () => {
    expect(expectedRandomValue(tiers(100, 200, 300, 400), NONE)).toBe(0);
    expect(expectedRandomValueExact(tiers(100, 0, 0, 0), NONE)).toEqual({
      numerator: 0,
      denominator: 1,
    });
  });
});

describe("duplicateRefund", () => {
  it("returns half the album's random-sticker price", () => {
    expect(duplicateRefund(40)).toBe(20);
    expect(duplicateRefund(100)).toBe(50);
  });

  it("floors, so an odd price does not round the loss away", () => {
    expect(duplicateRefund(1)).toBe(0);
    expect(duplicateRefund(3)).toBe(1);
    expect(duplicateRefund(99)).toBe(49);
  });

  it("is a net loss under any values the user sets", () => {
    // The spec's guarantee is universal, so the test has to be too: a duplicate
    // must never return as much as the pull cost, at any price at all.
    const next = lcg(7);
    for (let i = 0; i < 2000; i++) {
      const price = 1 + Math.floor(next() * 100_000);
      const refund = duplicateRefund(price);
      expect(refund).toBeLessThan(price);
      expect(refund).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(refund)).toBe(true);
    }
  });

  it("refunds nothing for a free pull, instead of going negative", () => {
    expect(duplicateRefund(0)).toBe(0);
  });
});

describe("canPullRandom", () => {
  const counts = tiers(3, 3, 3, 3);

  it("allows a pull while an unowned sticker is reachable", () => {
    const weights = effectiveWeights(DEFAULT_ODDS, counts);
    expect(canPullRandom({ weights, counts, owned: tiers(3, 3, 3, 2) })).toBe(true);
  });

  it("stops once the album is complete", () => {
    const weights = effectiveWeights(DEFAULT_ODDS, counts);
    expect(canPullRandom({ weights, counts, owned: counts })).toBe(false);
  });

  it("stops when everything left sits in a zero-odds tier", () => {
    // Legendary is priced and stocked but rolls at 0: pulling could only ever
    // return a duplicate of something already owned.
    const odds = tiers(50, 50, 0, 0);
    const weights = effectiveWeights(odds, counts);
    expect(canPullRandom({ weights, counts, owned: tiers(3, 3, 0, 0) })).toBe(false);
    expect(canPullRandom({ weights, counts, owned: tiers(3, 2, 0, 0) })).toBe(true);
  });

  it("stops when the album has no stickers at all", () => {
    expect(canPullRandom({ weights: NONE, counts: NONE, owned: NONE })).toBe(false);
  });
});

describe("tierForRoll", () => {
  const weights = tiers(60, 25, 12, 3);

  it("walks the weights in tier order", () => {
    expect(tierForRoll(weights, 0)).toBe("common");
    expect(tierForRoll(weights, 0.59)).toBe("common");
    expect(tierForRoll(weights, 0.6)).toBe("rare");
    expect(tierForRoll(weights, 0.84)).toBe("rare");
    expect(tierForRoll(weights, 0.85)).toBe("epic");
    expect(tierForRoll(weights, 0.96)).toBe("epic");
    expect(tierForRoll(weights, 0.97)).toBe("legendary");
    expect(tierForRoll(weights, 0.999999)).toBe("legendary");
  });

  it("never returns a tier that was excluded", () => {
    const short = effectiveWeights(DEFAULT_ODDS, tiers(5, 0, 5, 0));
    const next = lcg(1234);
    const seen = new Set<Tier>();
    for (let i = 0; i < 5000; i++) {
      const tier = tierForRoll(short, next());
      expect(tier).not.toBeNull();
      seen.add(tier as Tier);
    }
    expect([...seen].sort()).toEqual(["common", "epic"]);
  });

  it("reports an impossible roll rather than throwing inside a purchase", () => {
    expect(tierForRoll(NONE, 0.5)).toBeNull();
  });

  it("clamps a roll outside [0, 1) instead of falling off the end", () => {
    expect(tierForRoll(weights, 1)).toBe("legendary");
    expect(tierForRoll(weights, 2)).toBe("legendary");
    expect(tierForRoll(weights, -1)).toBe("common");
    expect(tierForRoll(weights, Number.NaN)).toBe("common");
  });

  it("lands on each tier about as often as its weight says", () => {
    const next = lcg(20260101);
    const hits: TierRecord<number> = tiers(0, 0, 0, 0);
    const runs = 40_000;
    for (let i = 0; i < runs; i++) {
      const tier = tierForRoll(weights, next());
      if (tier) hits[tier] += 1;
    }
    for (const tier of TIERS) {
      expect(Math.abs((hits[tier] / runs) * 100 - weights[tier])).toBeLessThan(1);
    }
  });

  it("honours the redistribution — an empty tier's share goes to the survivors", () => {
    const short = effectiveWeights(DEFAULT_ODDS, tiers(5, 5, 0, 5));
    const next = lcg(555);
    const hits: TierRecord<number> = tiers(0, 0, 0, 0);
    const runs = 40_000;
    for (let i = 0; i < runs; i++) {
      const tier = tierForRoll(short, next());
      if (tier) hits[tier] += 1;
    }
    expect(hits.epic).toBe(0);
    // 60/88, not 60/100: epic's 12 was absorbed in proportion.
    expect(Math.abs(hits.common / runs - 60 / 88)).toBeLessThan(0.01);
    expect(Math.abs(hits.rare / runs - 25 / 88)).toBeLessThan(0.01);
  });
});

describe("shuffleOrder", () => {
  it("is a permutation of every slot, at any size", () => {
    const next = lcg(31337);
    for (let count = 0; count <= 50; count++) {
      const order = shuffleOrder(count, next);
      expect(order).toHaveLength(count);
      // Every slot present exactly once: no sticker lost, none duplicated.
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });

  it("is deterministic given the same randomness", () => {
    expect(shuffleOrder(12, lcg(7))).toEqual(shuffleOrder(12, lcg(7)));
  });

  it("actually shuffles rather than returning the submitted order", () => {
    // The wizard is likely to submit stickers grouped by tier, so an identity
    // order would put every legendary in the same corner of every album.
    const next = lcg(2026);
    const identity = Array.from({ length: 12 }, (_, i) => i);
    const orders = Array.from({ length: 20 }, () => shuffleOrder(12, next));
    expect(orders.some((order) => order.join() !== identity.join())).toBe(true);
  });

  it("reaches every position, rather than nudging slots a little", () => {
    // A biased shuffle leaves items near where they started. Slot 0 should land
    // in all sorts of places across many albums.
    const next = lcg(555);
    const landings = new Set<number>();
    for (let i = 0; i < 500; i++) landings.add(shuffleOrder(9, next).indexOf(0));
    expect(landings.size).toBe(9);
  });

  it("survives degenerate counts instead of throwing mid-seal", () => {
    expect(shuffleOrder(0, lcg(1))).toEqual([]);
    expect(shuffleOrder(1, lcg(1))).toEqual([0]);
    expect(shuffleOrder(-5, lcg(1))).toEqual([]);
  });
});

describe("completionPercent", () => {
  it("is the share of slots filled", () => {
    expect(completionPercent(0, 12)).toBe(0);
    expect(completionPercent(6, 12)).toBe(50);
    expect(completionPercent(12, 12)).toBe(100);
  });

  it("rounds down, so 100 means finished and nothing else does", () => {
    // 59/60 is 98.33; the dangerous rounding would report 100 for an album with
    // a slot still empty, and the export gate reads this number.
    expect(completionPercent(59, 60)).toBe(98);
    expect(completionPercent(119, 120)).toBe(99);
    expect(completionPercent(1, 3)).toBe(33);
  });

  it("survives an empty album instead of dividing by zero", () => {
    expect(completionPercent(0, 0)).toBe(0);
  });

  it("cannot exceed 100, even with duplicates counted wrongly upstream", () => {
    expect(completionPercent(20, 12)).toBe(100);
    expect(completionPercent(-3, 12)).toBe(0);
  });
});

describe("albumStatus", () => {
  it("calls a locked album locked, however full it looks", () => {
    expect(albumStatus({ unlocked: false, owned: 0, total: 12 })).toBe("locked");
    expect(albumStatus({ unlocked: false, owned: 12, total: 12 })).toBe("locked");
  });

  it("separates in progress from completed", () => {
    expect(albumStatus({ unlocked: true, owned: 0, total: 12 })).toBe("in_progress");
    expect(albumStatus({ unlocked: true, owned: 11, total: 12 })).toBe("in_progress");
    expect(albumStatus({ unlocked: true, owned: 12, total: 12 })).toBe("completed");
  });

  it("does not call an empty album finished", () => {
    expect(albumStatus({ unlocked: true, owned: 0, total: 0 })).toBe("in_progress");
  });
});

describe("almost there", () => {
  it("fires on the last one or two slots", () => {
    expect(isAlmostThere(11, 12)).toBe(true);
    expect(isAlmostThere(10, 12)).toBe(true);
  });

  it("does not fire earlier, or once the album is done", () => {
    expect(isAlmostThere(9, 12)).toBe(false);
    expect(isAlmostThere(12, 12)).toBe(false);
    expect(isAlmostThere(0, 12)).toBe(false);
  });

  it("counts the slots left", () => {
    expect(slotsRemaining(10, 12)).toBe(2);
    expect(slotsRemaining(12, 12)).toBe(0);
    expect(slotsRemaining(15, 12)).toBe(0);
  });
});
