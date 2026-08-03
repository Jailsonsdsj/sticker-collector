import type { LocalDate, Me } from "@sticker-collector/shared";
import { todayIn } from "@sticker-collector/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Which timezone the app resolves a local day in.
 *
 * **The user's, not the device's.** The server computes every local day from
 * `user.timezone`: which occurrences exist, whether a routine is scheduled, and
 * — the one that bites — that an undated one-off may only be completed *today*.
 * A client reading the device's zone instead disagrees with the server for the
 * hours the two are apart, and every completion in that window comes back
 * `400: an undated task can only be completed today`. A profile provisioned in
 * Europe/Lisbon and used in Brazil is four hours of that, every evening.
 *
 * Held in a module variable as well as in the query cache, because the pure
 * helpers that need it (`lib/taskForm.ts`) are not React and must not become
 * React to answer "what day is it".
 */
let current = deviceTimeZone();

/** The fallback, and the only answer available before `/api/me` has replied. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function appTimeZone(): string {
  return current;
}

export function setAppTimeZone(zone: string): void {
  if (zone) current = zone;
}

/** Today, as the server counts it. Every call site that used to ask the device
 *  asks this instead. */
export function today(): LocalDate {
  return todayIn(current);
}

export const meKey = ["me"] as const;

/**
 * Reads the profile and adopts its timezone.
 *
 * Kept fresh for the session and no longer: the zone changes when the user
 * changes it, and this app has one user.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      const me = await api<Me>("/api/me");
      setAppTimeZone(me.timezone);
      return me;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
