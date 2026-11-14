import type { CreatePhrase, Phrase } from "@sticker-collector/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";

/**
 * The phrases that rotate on the home screen, above the search field.
 *
 * Stored in D1 (`/api/phrases`) so every device shows the same list — and,
 * because the phrase on show is picked from the wall clock, the same phrase at
 * the same time.
 */

/** How long each phrase stays up before the next slides in. */
export const PHRASE_INTERVAL_MS = 5 * 60_000;

/**
 * Which phrase is up at `now`.
 *
 * Derived from the wall clock rather than counted by a timer, so every render
 * — and a tab reopened twenty minutes later — agrees on the same phrase, and
 * the change lands on the five-minute mark.
 */
export function phraseIndexAt(now: Date, count: number): number {
  if (count <= 0) return -1;
  return Math.floor(now.getTime() / PHRASE_INTERVAL_MS) % count;
}

export function usePhrases() {
  return useQuery({ queryKey: keys.phrases, queryFn: () => api<Phrase[]>("/api/phrases") });
}

export function useAddPhrase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePhrase) =>
      api<Phrase>("/api/phrases", { method: "POST", body, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.phrases }),
  });
}

export function useRemovePhrase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<unknown>(`/api/phrases/${id}`, {
        method: "DELETE",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.phrases }),
  });
}
