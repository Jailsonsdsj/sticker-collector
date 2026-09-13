import { coinsToHours } from "@sticker-collector/shared";

/**
 * Minutes as a length of time: `2h 30m`, and `30m` under the hour.
 *
 * One coin is one minute (`prd/04-albums.md` §The album economy 1), so this
 * formats prices and efforts alike — the wallet's hours line, a puzzle's cost,
 * a day's score. It was written out three times before it was worth naming; the
 * fourth copy is how `0h 45m` ships in one of them and not the others.
 *
 * No `0h`: an hours field reading zero is a field asking to be read twice.
 */
export function asTime(minutes: number): string {
  const { hours, minutes: rest } = coinsToHours(minutes);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
