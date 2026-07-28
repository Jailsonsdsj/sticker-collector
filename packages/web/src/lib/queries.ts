import type { Epic, LocalDate, Occurrence, Task, Wallet } from "@sticker-collector/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Query keys in one place, so an invalidation cannot miss a cache.
 *
 * `occurrencesAll` is the prefix every window shares — invalidating it refetches
 * whichever window is currently mounted, without the caller having to know the
 * dates it was built with.
 */
export const keys = {
  tasks: ["tasks"] as const,
  epics: ["epics"] as const,
  wallet: ["wallet"] as const,
  occurrencesAll: ["occurrences"] as const,
  occurrences: (from: LocalDate, to: LocalDate) => ["occurrences", from, to] as const,
};

export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: () => api<Task[]>("/api/tasks") });
}

export function useEpics() {
  return useQuery({ queryKey: keys.epics, queryFn: () => api<Epic[]>("/api/epics") });
}

export function useWallet() {
  return useQuery({ queryKey: keys.wallet, queryFn: () => api<Wallet>("/api/wallet") });
}

export function useOccurrences(from: LocalDate, to: LocalDate) {
  return useQuery({
    queryKey: keys.occurrences(from, to),
    queryFn: () => api<Occurrence[]>(`/api/occurrences?from=${from}&to=${to}`),
  });
}
