import type {
  CompleteOccurrence,
  CreateTaskInput,
  Task,
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
