import type {
  AlbumDetail,
  AlbumQuery,
  AlbumSummary,
  EffortReport,
  Epic,
  LocalDate,
  MomentumReport,
  Occurrence,
  Task,
  Wallet,
} from "@sticker-collector/shared";
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
  albumsAll: ["albums"] as const,
  albums: (query: AlbumQuery) => ["albums", query.status ?? "all", query.sort] as const,
  album: (id: string) => ["albums", "detail", id] as const,
  momentum: ["reports", "momentum"] as const,
  effort: ["reports", "effort"] as const,
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

/**
 * The shelf. Filtering and sorting happen server-side so the list the screen
 * renders is the list the API decided on — completion, "almost there" and
 * affordability are all computed there, and recomputing any of them here would
 * be a second implementation to keep in step.
 */
export function useAlbums(query: AlbumQuery) {
  const params = new URLSearchParams({ sort: query.sort });
  if (query.status) params.set("status", query.status);

  return useQuery({
    queryKey: keys.albums(query),
    queryFn: () => api<AlbumSummary[]>(`/api/albums?${params}`),
  });
}

export function useAlbum(id: string) {
  return useQuery({
    queryKey: keys.album(id),
    queryFn: () => api<AlbumDetail>(`/api/albums/${id}`),
  });
}

/**
 * Momentum: streaks, perfect days, trailing rates, weekday shape and the
 * heatmap's per-day series — all from one tally, so they cannot disagree.
 */
export function useMomentum() {
  return useQuery({
    queryKey: keys.momentum,
    queryFn: () => api<MomentumReport>("/api/reports/momentum"),
  });
}

/** Effort and collection: minutes invested, effort by epic, stickers, albums. */
export function useEffort() {
  return useQuery({
    queryKey: keys.effort,
    queryFn: () => api<EffortReport>("/api/reports/effort"),
  });
}
