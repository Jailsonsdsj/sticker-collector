import { addDays, type Epic, type Task, todayIn } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { QuickAdd } from "../components/QuickAdd";
import { SectionHeading, type SectionTone } from "../components/SectionHeading";
import { SelectionBar } from "../components/SelectionBar";
import { SwipeRow } from "../components/SwipeRow";
import { TaskForm } from "../components/TaskForm";
import { TaskRow } from "../components/TaskRow";
import { TaskView } from "../components/TaskView";
import { Button, Dialog, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { WalletCard } from "../components/WalletCard";
import { ApiError } from "../lib/api";
import { type CompletionRef, usePendingCompletions } from "../lib/completionQueue";
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
import { useCollapsibleSections } from "../lib/sectionState";
import { useSelection } from "../lib/selection";
import { appTimeZone } from "../lib/timezone";

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
  // Resolved once and reused: `buildHome` needs the zone as well as the date,
  // because "completed today" is a UTC instant read in the user's own day.
  const timeZone = appTimeZone();
  const today = todayIn(timeZone);
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
  /**
   * The task being read.
   *
   * Tapping a row opens this rather than the edit form: asking "what is this
   * again?" should not begin by putting the thing at risk. Edit is one tap
   * further in, and deliberate.
   */
  const [viewing, setViewing] = useState<{ item: HomeItem; ref: CompletionRef } | null>(null);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const uncomplete = useUncompleteOccurrence();
  const queue = usePendingCompletions();
  const folds = useCollapsibleSections();

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
    () => buildHome(occurrences.data ?? [], tasks.data ?? [], today, timeZone),
    [occurrences.data, tasks.data, today, timeZone],
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
    !loading && !failed && Object.values(sections).every((section) => section.length === 0);

  const renderRow = (item: HomeItem) => {
    const epic = item.task.epicId ? epicById.get(item.task.epicId) : undefined;
    const coins = item.occurrence?.rewardSnapshotCoins ?? item.task.rewardCoins;

    // An undated one-off is scheduled on no day at all, so ticking it closes
    // TODAY — which is the only date the API accepts for one (T-06).
    //
    // `undated ? today` rather than `item.scheduledOn ?? today`: unticking
    // leaves the occurrence row behind as `pending`, so an undated one-off that
    // was ticked and untangled once carries an old date around forever. Sending
    // it back is how you get "an undated task can only be completed today" on a
    // task that looks perfectly ordinary.
    const undated = item.task.type === "oneoff" && !item.task.dueAt;
    const ref = {
      taskId: item.task.id,
      scheduledOn: undated ? today : (item.scheduledOn ?? today),
    };

    // A future occurrence is not completable; T-05 returns 400. Rendering it
    // inert is better than firing a request that is guaranteed to fail.
    const future = item.scheduledOn !== null && item.scheduledOn > today;
    const waiting = queue.isPending(ref);

    // Only an undated one-off can be pinned: a fresh completion is validated
    // against the schedule, and that is its single exception. The swipe still
    // responds on the others and says why, rather than reading as broken.
    const pinBlocked =
      item.task.type === "routine"
        ? "Routines follow their own schedule."
        : item.task.dueAt
          ? "This one already has a due date."
          : undefined;

    return (
      <SwipeRow
        key={item.key}
        disabled={selecting}
        pinBlockedReason={pinBlocked}
        onPin={() => updateTask.mutate({ id: item.task.id, patch: { pinnedOn: today } })}
        onDelete={() => deleteTask.mutate(item.task.id)}
      >
        <TaskRow
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
          onEdit={() => setViewing({ item, ref })}
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
      </SwipeRow>
    );
  };

  return (
    <>
      <WalletCard
        balance={wallet.data?.balance}
        loading={wallet.isLoading}
        pendingCoins={queue.pendingCoins}
        action={
          /* Settings is not a primary destination — five tabs already fill a
             phone bar — so it rides in the wallet's corner, where the app
             opens. A glyph, like every other icon in the system, with a real
             accessible name and 44px to aim at (TD-24). */
          <Link
            to="/settings"
            aria-label="Settings"
            className="-mt-2 -mr-2 flex min-h-11 min-w-11 items-center justify-center text-3xl text-ink-secondary no-underline"
          >
            {/* U+FE0E forces TEXT presentation. Without it iOS renders U+2699 as
                a full-colour emoji gear, which is the one thing this monochrome
                glyph set has nowhere to put. */}
            <span aria-hidden>{"\u2699\uFE0E"}</span>
          </Link>
        }
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

      {viewing && (
        <TaskView
          task={viewing.item.task}
          epic={viewing.item.task.epicId ? (epicById.get(viewing.item.task.epicId) ?? null) : null}
          done={viewing.item.done || queue.isPending(viewing.ref)}
          // A future occurrence is not completable and the API says so with a
          // 400; the button stays away rather than promising otherwise.
          onToggleDone={
            viewing.item.scheduledOn !== null && viewing.item.scheduledOn > today
              ? undefined
              : () => {
                  const item = viewing.item;
                  const ref = viewing.ref;
                  const coins = item.occurrence?.rewardSnapshotCoins ?? item.task.rewardCoins;
                  if (!(item.done || queue.isPending(ref))) {
                    queue.complete(ref, { title: item.task.title, coins });
                  } else if (queue.isPending(ref)) {
                    queue.cancel(ref);
                  } else {
                    void uncomplete.mutateAsync(ref);
                  }
                  setViewing(null);
                }
          }
          onEdit={() => {
            setEditing({ task: viewing.item.task, nonce: Date.now() });
            setViewing(null);
          }}
          onDelete={() => {
            deleteTask.mutate(viewing.item.task.id);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}

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
          {/* Order is what you act on first: today's work, then the loose
              captures, then what slipped. Completed today sits below them as a
              record, and the fortnight ahead is reference material. */}
          <Section
            tone="today"
            title="For today"
            items={sections.forToday}
            render={renderRow}
            open={folds.isOpen("today")}
            onToggle={() => folds.toggle("today")}
          />
          <Section
            tone="general"
            title="General"
            items={sections.general}
            render={renderRow}
            open={folds.isOpen("general")}
            onToggle={() => folds.toggle("general")}
          />
          <Section
            tone="missed"
            title="Missed"
            items={sections.missed}
            render={renderRow}
            open={folds.isOpen("missed")}
            onToggle={() => folds.toggle("missed")}
          />
          <Section
            tone="completed"
            title="Completed today"
            items={sections.completedToday}
            render={renderRow}
            open={folds.isOpen("completed")}
            onToggle={() => folds.toggle("completed")}
          />
          <Section
            tone="backlog"
            title="Routine backlog"
            items={sections.routineBacklog}
            render={renderRow}
            open={folds.isOpen("backlog")}
            onToggle={() => folds.toggle("backlog")}
          />
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
  open,
  onToggle,
}: {
  tone: SectionTone;
  title: string;
  items: HomeItem[];
  count?: string;
  render: (item: HomeItem) => React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading tone={tone} count={count ?? items.length} open={open} onToggle={onToggle}>
        {title}
      </SectionHeading>
      {/* The count stays visible while collapsed — folding a section away
          should not also hide how much is in it. */}
      {open && <div className="flex flex-col gap-2">{items.map(render)}</div>}
    </section>
  );
}
