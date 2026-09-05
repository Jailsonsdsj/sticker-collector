import { addDays, blockedBySteps, type Epic, type Task, todayIn } from "@sticker-collector/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { DailyReviewDialog } from "../components/DailyReviewDialog";
import { SearchField } from "../components/SearchField";
import { SectionHeading, type SectionTone } from "../components/SectionHeading";
import { SelectionBar } from "../components/SelectionBar";
import { StepsBlockedDialog } from "../components/StepsBlockedDialog";
import { SwipeRow } from "../components/SwipeRow";
import { TaskForm } from "../components/TaskForm";
import { TaskRow } from "../components/TaskRow";
import { TaskView } from "../components/TaskView";
import { Button, Dialog, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { WalletCard } from "../components/WalletCard";
import { ApiError } from "../lib/api";
import { type CompletionRef, usePendingCompletions } from "../lib/completionQueue";
import { buildReview, type DailyReview, markReviewed, shouldReview } from "../lib/dailyReview";
import {
  buildHome,
  filterHome,
  HOME_WINDOW_BACK,
  HOME_WINDOW_FORWARD,
  type HomeItem,
  isEmpty,
  startedToday,
} from "../lib/home";
import {
  useBulkDeleteTasks,
  useBulkDuplicateTasks,
  useCreateTask,
  useDeleteTask,
  useToggleSubtask,
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
  /** The task a tick was refused on, so the refusal can say why. */
  const [blocked, setBlocked] = useState<Task | null>(null);
  const [review, setReview] = useState<DailyReview | null>(null);
  /** Narrows every section as it is typed; never submitted. */
  const [query, setQuery] = useState("");
  const updateTask = useUpdateTask();
  const toggleSubtask = useToggleSubtask();

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

  /**
   * What the screen actually shows.
   *
   * Filtering the built sections rather than the tasks going in keeps a match
   * in the section it belongs to — finding a routine tells you it is in the
   * backlog, not merely that it exists.
   */
  const visible = useMemo(() => filterHome(sections, query), [sections, query]);
  const searching = query.trim() !== "";

  /**
   * The open sheet's task, as the cache has it now.
   *
   * `viewing` is React state holding the row as it was when the sheet opened,
   * so nothing that changes afterwards — a ticked step, most of all — reaches
   * it. Looked up fresh on every render instead.
   */
  const liveTask = viewing
    ? (tasks.data?.find((row) => row.id === viewing.item.task.id) ?? viewing.item.task)
    : null;

  const epicById = useMemo(
    () => new Map((epics.data ?? []).map((e: Epic) => [e.id, e])),
    [epics.data],
  );

  /**
   * Yesterday, read back on the first visit of the day.
   *
   * Built from the occurrences the home screen already fetched — its window
   * reaches seven days back — so the prompt costs no extra request and no
   * stored summary.
   */
  const yesterday = useMemo(
    () =>
      buildReview(
        addDays(today, -1),
        occurrences.data ?? [],
        tasks.data ?? [],
        epics.data ?? [],
        timeZone,
      ),
    [occurrences.data, tasks.data, epics.data, today, timeZone],
  );

  useEffect(() => {
    if (!shouldReview(today, yesterday)) return;
    // Marked before it is shown, not after: a modal the user dismisses by
    // navigating away must not come back on the next tab.
    markReviewed(today);
    setReview(yesterday);
  }, [today, yesterday]);

  if (unauthorised) return <Navigate to="/login" replace />;

  const loading = occurrences.isLoading || tasks.isLoading;
  // Either read failing makes the home screen wrong rather than empty: the
  // sections are built from `?? []`, so a dead network would otherwise render
  // "Nothing to do yet" to someone with a full day ahead of them.
  const failed = !loading && (occurrences.isError || tasks.isError);
  const empty = !loading && !failed && isEmpty(sections);
  /** Searched, and nothing came back — different from having no tasks at all. */
  const noMatches = !loading && !failed && !empty && isEmpty(visible);

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

    // Only an undated one-off can be *pinned* to today. A left swipe on
    // anything else still stops it — that part always applies — so the notice
    // only appears for a task that is not in progress either, where the gesture
    // would otherwise do nothing at all.
    const pinnable = item.task.type === "oneoff" && !item.task.dueAt;
    const pinBlocked =
      pinnable || item.task.startedAt
        ? undefined
        : item.task.type === "routine"
          ? "Routines follow their own schedule."
          : "This one already has a due date.";

    return (
      <SwipeRow
        key={item.key}
        disabled={selecting}
        pinBlockedReason={pinBlocked}
        // Right starts it. Left brings it back to today, which also stops it —
        // a task cannot be both "in progress" and "waiting for today", and the
        // opposite swipe is how each is undone.
        onStart={() =>
          updateTask.mutate({
            id: item.task.id,
            patch: { startedAt: new Date().toISOString() },
          })
        }
        onPin={() =>
          updateTask.mutate({
            id: item.task.id,
            // A routine cannot be pinned, but it can be stopped: sending only
            // the fields that apply keeps the API from refusing the whole
            // gesture.
            patch:
              item.task.type === "oneoff" && !item.task.dueAt
                ? { startedAt: null, pinnedOn: today }
                : { startedAt: null },
          })
        }
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
            // Stopped here rather than sent and refused. The Worker would say
            // no — that is where the rule actually lives — but a checkbox that
            // ticks, waits out its undo window and then springs back is a much
            // worse way to learn about it than being told.
            if (next && blockedBySteps(item.task, item.scheduledOn ?? today)) {
              setBlocked(item.task);
              return;
            }
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
          {/* Above the buttons: this screen is read far more often than it is
              added to. */}
          <SearchField id="task-search" noun="tasks" value={query} onChange={setQuery} />

          <div className="mb-5 flex gap-2">
            {/* The only way in now. The one-line quick-add sat above it and
                created an undated one-off with a default effort — the same
                thing this form produces in two more taps, with a section and a
                priority the capture box could not ask for. Two doors to one
                room, and the smaller one could not say where the task landed. */}
            <Button
              variant="outline"
              tone="violet"
              className="flex-1"
              onClick={() => setFormOpen(true)}
            >
              ＋ New task
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

      <StepsBlockedDialog task={blocked} today={today} onClose={() => setBlocked(null)} />

      <DailyReviewDialog review={review} heading="Yesterday" onClose={() => setReview(null)} />

      {viewing && (
        <TaskView
          // The LIVE row, not the snapshot `viewing` captured when the sheet
          // opened. `viewing` is React state, so a cache update — ticking a
          // step, say — never reaches it, and the checkbox sat unmoved until
          // the sheet was closed and reopened.
          task={liveTask ?? viewing.item.task}
          epic={liveTask?.epicId ? (epicById.get(liveTask.epicId) ?? null) : null}
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
          today={today}
          onToggleSubtask={(subtaskId, done) =>
            toggleSubtask.mutate({ taskId: viewing.item.task.id, subtaskId, done })
          }
          started={startedToday(liveTask ?? viewing.item.task, today, timeZone)}
          // Offered only where it would actually move the row. *In progress*
          // takes a routine through TODAY's occurrence alone, so starting one
          // on a day it does not run sets a flag and changes nothing on screen.
          // A one-off is a single row and always moves.
          onToggleStart={
            viewing.item.task.type === "oneoff" || viewing.item.scheduledOn === today
              ? () => {
                  updateTask.mutate({
                    id: viewing.item.task.id,
                    // The plain inverse of starting. Deliberately NOT the left
                    // swipe's behaviour, which also pins an undated capture to
                    // today: that gesture means "bring it back to today", and
                    // this button only means "stop".
                    patch: {
                      startedAt: viewing.item.task.startedAt ? null : new Date().toISOString(),
                    },
                  });
                  // Close, because the point of the button is the row moving
                  // to another section — which is behind this sheet.
                  setViewing(null);
                }
              : undefined
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
        routines={tasks.data ?? []}
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
        routines={tasks.data ?? []}
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

      {noMatches && (
        <EmptyState
          icon="⌕"
          title="No task matches that"
          description="Search looks at titles only."
          action={
            <Button variant="outline" tone="neutral" onClick={() => setQuery("")}>
              Clear the search
            </Button>
          }
        />
      )}

      {!loading && !failed && !empty && !noMatches && (
        <div className="flex flex-col gap-6">
          {/* Order is what you act on first: what is already underway, then
              today's work, then the loose captures. Completed today sits below
              them as a record, and the fortnight ahead is reference material.
              A routine's gone days are not here at all — they are the Week
              tab's business, where a week is the unit — but an overdue capture
              is, because there is only ever one of it. */}
          <Section
            tone="progress"
            title="In progress"
            items={visible.inProgress}
            render={renderRow}
            open={searching || folds.isOpen("progress")}
            onToggle={() => folds.toggle("progress")}
          />
          <Section
            tone="today"
            title="For today"
            items={visible.forToday}
            render={renderRow}
            open={searching || folds.isOpen("today")}
            onToggle={() => folds.toggle("today")}
          />
          <Section
            tone="missed"
            title="Missed"
            items={visible.missed}
            render={renderRow}
            open={searching || folds.isOpen("missed")}
            onToggle={() => folds.toggle("missed")}
          />
          <Section
            tone="general"
            title="General"
            items={visible.general}
            render={renderRow}
            open={searching || folds.isOpen("general")}
            onToggle={() => folds.toggle("general")}
          />
          <Section
            tone="completed"
            title="Completed today"
            items={visible.completedToday}
            render={renderRow}
            open={searching || folds.isOpen("completed")}
            onToggle={() => folds.toggle("completed")}
          />
          <Section
            tone="backlog"
            title="Routine backlog"
            items={visible.routineBacklog}
            render={renderRow}
            open={searching || folds.isOpen("backlog")}
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
