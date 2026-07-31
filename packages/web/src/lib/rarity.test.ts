import { TIERS } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { FLOURISH } from "./rarity";

describe("what a tier earns", () => {
  it("gives a common nothing but the reveal itself", () => {
    expect(FLOURISH.common).toEqual({ ring: false, bloom: false, shine: false });
  });

  it("only ever adds as rarity climbs", () => {
    // A rarer tier must never get *less* than a commoner one, or the ladder
    // stops reading as a ladder.
    const score = (tier: (typeof TIERS)[number]) =>
      Number(FLOURISH[tier].ring) + Number(FLOURISH[tier].bloom) + Number(FLOURISH[tier].shine);

    const scores = TIERS.map(score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(score("legendary")).toBeGreaterThan(score("common"));
  });

  it("reserves the endless shine for the legendary alone", () => {
    expect(TIERS.filter((tier) => FLOURISH[tier].shine)).toEqual(["legendary"]);
  });

  it("covers every tier, so a new one cannot be silently unadorned", () => {
    for (const tier of TIERS) expect(FLOURISH[tier]).toBeDefined();
  });
});
