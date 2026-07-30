import { addDays, type Epic, type Task, todayIn } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { QuickAdd } from "../components/QuickAdd";
import { SectionHeading, type SectionTone } from "../components/SectionHeading";
import { SelectionBar } from "../components/SelectionBar";
import { TaskForm } from "../components/TaskForm";
import { TaskRow } from "../components/TaskRow";
import { Button, Dialog, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { WalletCard } from "../components/WalletCard";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import { buildHome, HOME_WINDOW_BACK, HOME_WINDOW_FORWARD, type HomeItem } from "../lib/home";
import {
  useBulkDeleteTasks,
  useBulkDuplicateTasks,
  useCreateTask,
  useDeleteTask,
  useQuickAdd,
  useUncompleteOccurrence,
  useUpdateTask,
} from "../lib/mutations";
import { useEpics, useOccurrences, useTasks, useWallet } from "../lib/queries";
import { useSelection } from "../lib/selection";

/**
 * Home — Missed, Today, Backlog, in that order (prd/02-tasks.md §Home).
 *
 * Ticking a row does not send anything immediately: it enters the undo queue
 * and only reaches the server once the window closes (lib/completionQueue.tsx).
 * Unticking means one of two different things depending on which side of that
 * window you are on, which is why the handler branches on `waiting`.
 */
export function Tasks() {
  // The user's own timezone decides which day this is. The browser knows it;
  // the API resolves the same thing from `user.timezone` for its own answers.
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const from = addDays(today, -HOME_WINDOW_BACK);
  const to = addDays(today, HOME_WINDOW_FORWARD);

  const occurrences = useOccurrences(from, to);
  const tasks = useTasks();
  const epics = useEpics();
  const wallet = useWallet();
  const quickAdd = useQuickAdd();
  const createTask = useCreateTask();
  const [formOpen, setFormOpen] = useState(false);
  // The form seeds its state once on mount, so each open needs a fresh mount.
  const [editing, setEditing] = useState<{ task: Task; nonce: number } | null>(null);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const uncomplete = useUncompleteOccurrence();
  const queue = usePendingCompletions();

  const [selecting, setSelecting] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const selection = useSelection();
  const bulkDelete = useBulkDeleteTasks();
  const bulkDuplicate = useBulkDuplicateTasks();

  // Leaving the mode always drops the selection: a stale one is how the wrong
  // thing gets deleted the next time the mode is opened.
  const leaveSelection = () => {
    setSelecting(false);
    setConfirmingBulkDelete(false);
    selection.clear();
  };

  const unauthorised = [occurrences.error, tasks.error, epics.error, wallet.error].some(
    (e) => e instanceof ApiError && e.status === 401,
  );

  const sections = useMemo(
    () => buildHome(occurrences.data ?? [], tasks.data ?? [], today),
    [occurrences.data, tasks.data, today],
  );

  const epicById = useMemo(
    () => new Map((epics.data ?? []).map((e: Epic) => [e.id, e])),
    [epics.data],
  );

  if (unauthorised) return <Navigate to="/login" replace />;

  const loading = occurrences.isLoading || tasks.isLoading;
  // Either read failing makes the home screen wrong rather than empty: the
  // sections are built from `?? []`, so a dead network would otherwise render
  // "Nothing to do yet" to someone with a full day ahead of them.
  const failed = !loading && (occurrences.isError || tasks.isError);
  const empty =
    !loading &&
    !failed &&
    sections.missed.length === 0 &&
    sections.today.length === 0 &&
    sections.backlog.length === 0;

  const renderRow = (item: HomeItem) => {
    const epic = item.task.epicId ? epicById.get(item.task.epicId) : undefined;
    const coins = item.occurrence?.rewardSnapshotCoins ?? item.task.rewardCoins;

    // An undated one-off is scheduled on no day at all, so ticking it closes
    // TODAY — which is the only date the API accepts for one (T-06).
    const ref = { taskId: item.task.id, scheduledOn: item.scheduledOn ?? today };

    // A future occurrence is not completable; T-05 returns 400. Rendering it
    // inert is better than firing a request that is guaranteed to fail.
    const future = item.scheduledOn !== null && item.scheduledOn > today;
    const waiting = queue.isPending(ref);

    return (
      <TaskRow
        key={item.key}
        title={item.task.title}
        priority={item.task.priority}
        rewardCoins={coins}
        epicAccent={epic?.accent ?? null}
        epicTitle={epic?.title ?? null}
        typeLabel={item.task.type === "routine" ? "↻ routine" : "· one-off"}
        done={item.done || waiting}
        disabled={future}
        selecting={selecting}
        selected={selection.has(item.task.id)}
        onSelect={() => selection.toggle(item.task.id)}
        onEdit={() => setEditing({ task: item.task, nonce: Date.now() })}
        onToggle={(next) => {
          if (next) {
            queue.complete(ref, { title: item.task.title, coins });
          } else if (waiting) {
            queue.cancel(ref); // still inside the window: nothing was ever sent
          } else {
            void uncomplete.mutateAsync(ref); // past the window: re-open it
          }
        }}
      />
    );
  };

  return (
    <>
      {/* Settings is not a primary destination — five tabs already fill a phone
          bar — so it lives here, where the app opens. */}
      <div className="mb-2 flex justify-end">
        <Link
          to="/settings"
          className="font-body text-2xs tracking-kicker text-ink-muted uppercase"
        >
          Settings
        </Link>
      </div>

      <WalletCard
        balance={wallet.data?.balance}
        loading={wallet.isLoading}
        pendingCoins={queue.pendingCoins}
      />

      {selecting ? (
        <SelectionBar
          count={selection.count}
          pending={bulkDelete.isPending || bulkDuplicate.isPending}
          onCancel={leaveSelection}
          onDuplicate={async () => {
            await bulkDuplicate.mutateAsync(selection.ids);
            leaveSelection();
          }}
          onDelete={() => setConfirmingBulkDelete(true)}
        />
      ) : (
        <>
          <QuickAdd onAdd={(title) => quickAdd.mutateAsync(title)} pending={quickAdd.isPending} />

          <div className="mb-5 flex gap-2">
            {/* Deferred from T-09: the full form is one tap away, per the spec. */}
            <Button
              variant="outline"
              tone="violet"
              className="flex-1"
              onClick={() => setFormOpen(true)}
            >
              ＋ New task — full form
            </Button>
            <Button variant="outline" tone="neutral" onClick={() => setSelecting(true)}>
              Select
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={confirmingBulkDelete}
        onClose={() => setConfirmingBulkDelete(false)}
        tone="danger"
        title="Delete selected?"
        footer={
          <>
            <Button variant="ghost" tone="neutral" onClick={() => setConfirmingBulkDelete(false)}>
              Cancel
            </Button>
            <Button
              tone="magenta"
              disabled={bulkDelete.isPending}
              onClick={async () => {
                await bulkDelete.mutateAsync(selection.ids);
                leaveSelection();
              }}
            >
              Delete {selection.count}
            </Button>
          </>
        }
      >
        {selection.count} task{selection.count === 1 ? "" : "s"} will stop appearing. Coins they
        already earned are kept.
      </Dialog>

      <TaskForm
        key={`create-${formOpen}`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(payload) => createTask.mutateAsync(payload)}
        epics={epics.data ?? []}
      />

      <TaskForm
        key={`edit-${editing?.nonce ?? "closed"}`}
        open={editing !== null}
        task={editing?.task}
        onClose={() => setEditing(null)}
        onSubmit={(payload) => createTask.mutateAsync(payload)}
        onUpdate={(patch) =>
          editing ? updateTask.mutateAsync({ id: editing.task.id, patch }) : Promise.resolve()
        }
        onDelete={() => (editing ? deleteTask.mutateAsync(editing.task.id) : Promise.resolve())}
        epics={epics.data ?? []}
      />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      )}

      {failed && (
        <ErrorState
          error={occurrences.error ?? tasks.error}
          onRetry={() => {
            void occurrences.refetch();
            void tasks.refetch();
          }}
        />
      )}

      {empty && (
        <EmptyState
          icon="✓"
          title="Nothing to do yet"
          description="Add a task and finishing it will mint coins."
        />
      )}

      {!loading && !failed && !empty && (
        <div className="flex flex-col gap-6">
          <Section tone="missed" title="Missed" items={sections.missed} render={renderRow} />
          <Section
            tone="today"
            title="Today"
            items={sections.today}
            count={`${sections.today.filter((i) => i.done).length}/${sections.today.length}`}
            render={renderRow}
          />
          <Section tone="backlog" title="Backlog" items={sections.backlog} render={renderRow} />
        </div>
      )}
    </>
  );
}

function Section({
  tone,
  title,
  items,
  count,
  render,
}: {
  tone: SectionTone;
  title: string;
  items: HomeItem[];
  count?: string;
  render: (item: HomeItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading tone={tone} count={count ?? items.length}>
        {title}
      </SectionHeading>
      <div className="flex flex-col gap-2">{items.map(render)}</div>
    </section>
  );
}
