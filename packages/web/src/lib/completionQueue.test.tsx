import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompletionQueueProvider,
  type CompletionRef,
  UNDO_WINDOW_MS,
  usePendingCompletions,
} from "./completionQueue";

/**
 * The done-when lives here: undo inside the window must issue NO request.
 *
 * Asserting "the request was reversed" would pass for a rollback implementation
 * too, and a rollback leaves two ledger rows behind. So every test below checks
 * that `onCommit` was never called — and then advances the clock well past the
 * window to prove nothing fires late either.
 */

const A: CompletionRef = { taskId: "t1", scheduledOn: "2026-08-05" };
const B: CompletionRef = { taskId: "t2", scheduledOn: "2026-08-05" };

function Harness({ refs = [A] }: { refs?: CompletionRef[] }) {
  const queue = usePendingCompletions();
  return (
    <div>
      <span data-testid="coins">{queue.pendingCoins}</span>
      {refs.map((ref, i) => (
        <div key={ref.taskId}>
          <span data-testid={`pending-${ref.taskId}`}>{String(queue.isPending(ref))}</span>
          <button
            type="button"
            onClick={() => queue.complete(ref, { title: `Task ${i}`, coins: 10 * (i + 1) })}
          >
            {`tick ${ref.taskId}`}
          </button>
          <button type="button" onClick={() => queue.cancel(ref)}>
            {`cancel ${ref.taskId}`}
          </button>
        </div>
      ))}
    </div>
  );
}

let onCommit: ReturnType<typeof vi.fn<(ref: CompletionRef) => Promise<unknown>>>;

function setup(refs?: CompletionRef[]) {
  onCommit = vi.fn().mockResolvedValue(undefined);
  // fireEvent, not userEvent: userEvent awaits its own internal delays, which
  // deadlocks against the fake timers these tests need to drive the window.
  // Every interaction here is a plain click, so nothing is lost.
  const view = render(
    <CompletionQueueProvider onCommit={onCommit}>
      <Harness refs={refs} />
    </CompletionQueueProvider>,
  );
  return { view, onCommit };
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("undo inside the window writes nothing — the done-when", () => {
  it("never issues the request, not even after the window would have closed", async () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    advance(UNDO_WINDOW_MS - 1);
    fireEvent.click(screen.getByRole("button", { name: "cancel t1" }));

    advance(UNDO_WINDOW_MS * 3); // nothing may fire late
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("undoing from the toast is the same as cancelling", async () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    expect(screen.getByText("+10 coins")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    advance(UNDO_WINDOW_MS * 3);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByText("+10 coins")).not.toBeInTheDocument();
  });

  it("takes the coins back off the balance", async () => {
    setup();
    const coins = () => screen.getByTestId("coins").textContent;

    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    expect(coins()).toBe("10"); // felt immediately

    fireEvent.click(screen.getByRole("button", { name: "cancel t1" }));
    expect(coins()).toBe("0");
  });
});

describe("after the window it is committed", () => {
  it("fires exactly once, with the reference that was ticked", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));

    expect(onCommit).not.toHaveBeenCalled(); // still reversible
    advance(UNDO_WINDOW_MS);

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(A);
  });

  it("stops being pending, so the toast and the optimistic coins clear", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    advance(UNDO_WINDOW_MS);

    expect(screen.getByTestId("pending-t1").textContent).toBe("false");
    expect(screen.getByTestId("coins").textContent).toBe("0");
    expect(screen.queryByText("+10 coins")).not.toBeInTheDocument();
  });

  it("does not fire again if the clock keeps running", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    advance(UNDO_WINDOW_MS * 5);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("several at once", () => {
  it("keeps each on its own timer, so undoing one leaves the other", async () => {
    setup([A, B]);

    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    fireEvent.click(screen.getByRole("button", { name: "tick t2" }));
    expect(screen.getByTestId("coins").textContent).toBe("30"); // 10 + 20

    fireEvent.click(screen.getByRole("button", { name: "cancel t1" }));
    expect(screen.getByTestId("coins").textContent).toBe("20");

    advance(UNDO_WINDOW_MS);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(B);
  });

  it("commits every one of them, not just the last", () => {
    // Scheduling a second completion must not disturb the first. A single
    // shared timer would look correct until two boxes were ticked in a row.
    setup([A, B]);
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    fireEvent.click(screen.getByRole("button", { name: "tick t2" }));

    advance(UNDO_WINDOW_MS);

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledWith(A);
    expect(onCommit).toHaveBeenCalledWith(B);
    expect(screen.getByTestId("coins").textContent).toBe("0");
  });

  it("ignores a second tick on an occurrence already waiting", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));

    expect(screen.getByTestId("coins").textContent).toBe("10"); // not 20
    advance(UNDO_WINDOW_MS);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("unmount", () => {
  it("flushes what is waiting rather than discarding it", async () => {
    const { view } = setup([A, B]);
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    fireEvent.click(screen.getByRole("button", { name: "tick t2" }));

    act(() => view.unmount());

    // The user ticked these and expects the coins; dropping them on a route
    // change would lose work silently.
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledWith(A);
    expect(onCommit).toHaveBeenCalledWith(B);
  });

  it("does not fire for something already undone", async () => {
    const { view } = setup();
    fireEvent.click(screen.getByRole("button", { name: "tick t1" }));
    fireEvent.click(screen.getByRole("button", { name: "cancel t1" }));

    act(() => view.unmount());
    expect(onCommit).not.toHaveBeenCalled();
  });
});
