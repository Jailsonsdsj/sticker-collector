import type {
  CompleteOccurrence,
  CreateAlbumInput,
  CreateEpicInput,
  CreateTaskInput,
  DeleteEpic,
  Epic,
  PullResult,
  PurchaseResult,
  SaleResult,
  SealedAlbum,
  Task,
  UpdateEpic,
  UpdateTask,
} from "@sticker-collector/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";

/**
 * Capture must never cost a form (prd/02-tasks.md §Enhancements).
 *
 * The server owns what a quick-add *is* — undated one-off, default effort, no
 * epic — so this sends a title and nothing else. Every submission carries a
 * fresh idempotency key: a retry of one submission cannot create a second task,
 * while two deliberate submissions still create two.
 */
export function useQuickAdd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) =>
      api<Task>("/api/tasks/quick-add", {
        method: "POST",
        body: { title },
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      // The new task lands in the Backlog, so the task list changes; the
      // occurrence window and the wallet do not, but invalidating them keeps
      // one rule — "a mutation refreshes the loop" — instead of three.
      for (const key of [keys.tasks, keys.occurrencesAll, keys.wallet]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** The full form's create. Same invalidation set as quick-add — one rule. */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTaskInput) =>
      api<Task>("/api/tasks", {
        method: "POST",
        body: payload,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      for (const key of [keys.tasks, keys.occurrencesAll, keys.wallet]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Fires when the undo window closes — see lib/completionQueue.tsx. */
export function useCompleteOccurrence() {
  return useOccurrenceMutation("/api/occurrences/complete");
}

/**
 * Re-opening a closed day. There is no undo window here: this IS the correction
 * path the spec leaves once the window has passed, and T-05 reverses the coins
 * with a negative ledger entry rather than deleting one.
 */
export function useUncompleteOccurrence() {
  return useOccurrenceMutation("/api/occurrences/uncomplete");
}

function useOccurrenceMutation(path: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ref: CompleteOccurrence) =>
      api<unknown>(path, { method: "POST", body: ref, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      for (const key of [keys.tasks, keys.occurrencesAll, keys.wallet]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * Editing a task. Used by the weekly grid, where a cell has to feel instant.
 *
 * Optimistic with rollback — the right pattern here, unlike completion: this is
 * an edit, not a payment, so there is nothing to undo and no coins to protect.
 * Without the rollback the grid would keep showing a day the server rejected.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTask }) =>
      api<Task>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: patch,
        idempotencyKey: crypto.randomUUID(),
      }),

    onMutate: async ({ id, patch }) => {
      // Stop an in-flight refetch from landing on top of the optimistic value.
      await queryClient.cancelQueries({ queryKey: keys.tasks });
      const previous = queryClient.getQueryData<Task[]>(keys.tasks);
      queryClient.setQueryData<Task[]>(keys.tasks, (old) =>
        old?.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      );
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(keys.tasks, context.previous);
    },

    onSettled: () => {
      // The mask changes which days generate, so the window is stale either way.
      for (const key of [keys.tasks, keys.occurrencesAll]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useCreateEpic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEpicInput) =>
      api<Epic>("/api/epics", { method: "POST", body, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.epics }),
  });
}

export function useUpdateEpic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateEpic }) =>
      api<Epic>(`/api/epics/${id}`, {
        method: "PATCH",
        body: patch,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.epics }),
  });
}

/**
 * Deleting an epic always touches its tasks — `cascade` soft-deletes them,
 * `unlink` just clears their `epic_id` — so the task list and the occurrence
 * window are stale either way, not only the epic list.
 */
export function useDeleteEpic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string } & DeleteEpic) =>
      api<unknown>(`/api/epics/${id}?mode=${mode}`, {
        method: "DELETE",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      for (const key of [keys.epics, keys.tasks, keys.occurrencesAll]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Soft delete. The task stops generating; its occurrences and the coins they
 *  paid survive (T-03). */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<unknown>(`/api/tasks/${id}`, {
        method: "DELETE",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      for (const key of [keys.tasks, keys.occurrencesAll, keys.epics]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * The bulk actions (prd/02-tasks.md §CRUD: "select multiple tasks and then
 * duplicate or delete them").
 *
 * Duplicating copies definitions only — occurrences are history, so a copy has
 * none. Deleting is soft, so the originals' occurrences and the coins they paid
 * survive (T-03).
 */
function useBulkTaskAction(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<unknown>(path, { method: "POST", body: { ids }, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      for (const key of [keys.tasks, keys.occurrencesAll, keys.epics]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export const useBulkDeleteTasks = () => useBulkTaskAction("/api/tasks/bulk-delete");
export const useBulkDuplicateTasks = () => useBulkTaskAction("/api/tasks/bulk-duplicate");

/**
 * Unlocking an album spends coins, so both caches move: the listing (status,
 * affordability of every *other* album) and the wallet. Missing the wallet
 * would leave a balance on screen that the next purchase silently contradicts.
 */
export function useUnlockAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (albumId: string) =>
      api<PurchaseResult>(`/api/albums/${albumId}/unlock`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.albumsAll });
      void client.invalidateQueries({ queryKey: keys.wallet });
    },
  });
}

/**
 * Seals an album. One POST carries the whole arrangement — the sticker rows are
 * insert-only, so there is no second request that could add the rest.
 */
export function useCreateAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAlbumInput) =>
      api<SealedAlbum>("/api/albums", {
        method: "POST",
        body: payload,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.albumsAll });
    },
  });
}

/**
 * Buys a sticker outright — the user's protection against bad luck, and the
 * only way to reach a tier with zero odds.
 *
 * Three caches move: this album's grid, the listing (its completion and every
 * other album's affordability) and the wallet.
 */
export function useBuySticker(albumId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (stickerId: string) =>
      api<PurchaseResult>(`/api/albums/${albumId}/stickers/${stickerId}/buy`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.album(albumId) });
      void client.invalidateQueries({ queryKey: keys.albumsAll });
      void client.invalidateQueries({ queryKey: keys.wallet });
    },
  });
}

/**
 * Rolls for a random sticker. Costs the album's random price whatever comes
 * back — including a duplicate, which is the price of gambling.
 */
export function usePullSticker(albumId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<PullResult>(`/api/albums/${albumId}/pull`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.album(albumId) });
      void client.invalidateQueries({ queryKey: keys.albumsAll });
      void client.invalidateQueries({ queryKey: keys.wallet });
    },
  });
}

/** Sells a spare copy for half the album's random price, floored. */
export function useSellDuplicate(albumId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (stickerId: string) =>
      api<SaleResult>(`/api/stickers/${stickerId}/sell`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.album(albumId) });
      void client.invalidateQueries({ queryKey: keys.wallet });
    },
  });
}

/**
 * Deletes an album. Soft on the server — the ledger rows it is foreign-keyed to
 * are append-only and must survive — but from here it is simply gone.
 */
export function useDeleteAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (albumId: string) =>
      api<{ deleted: string }>(`/api/albums/${albumId}`, {
        method: "DELETE",
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.albumsAll });
    },
  });
}
