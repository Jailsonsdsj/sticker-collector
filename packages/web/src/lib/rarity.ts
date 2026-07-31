import type { Tier } from "@sticker-collector/shared";

/**
 * How much show a tier earns, in one place.
 *
 * The pack reveal and the direct-buy reveal are different moments — one is a
 * surprise, the other a purchase — but "what does a legendary get that a common
 * does not" must be the same answer in both, or rarity stops meaning anything
 * consistent. A common is a flood and nothing else; a legendary is a ring, a
 * bloom, and a shine that keeps going.
 */
export interface Flourish {
  ring: boolean;
  bloom: boolean;
  shine: boolean;
}

export const FLOURISH: Record<Tier, Flourish> = {
  common: { ring: false, bloom: false, shine: false },
  rare: { ring: true, bloom: false, shine: false },
  epic: { ring: true, bloom: true, shine: false },
  legendary: { ring: true, bloom: true, shine: true },
};
