import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

/** React logs every caught error itself; the noise is not the test's fault. */
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function Boom({ throws }: { throws: boolean }): React.ReactElement {
  if (throws) throw new Error("undefined is not a function");
  return <p>The screen</p>;
}

describe("catching a render crash", () => {
  it("renders its children untouched when nothing throws", () => {
    render(
      <ErrorBoundary onError={vi.fn()}>
        <Boom throws={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("The screen")).toBeInTheDocument();
  });

  it("shows a screen instead of the white page React would leave behind", () => {
    render(
      <ErrorBoundary onError={vi.fn()}>
        <Boom throws={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "This screen broke" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not tell a crashed screen that it is offline", () => {
    // The caught error is a plain Error, which the offline heuristic would
    // otherwise read as a request that never left the device.
    render(
      <ErrorBoundary onError={vi.fn()}>
        <Boom throws={true} />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your data is untouched/i)).toBeInTheDocument();
  });

  it("reports the error rather than swallowing it", () => {
    // A single-user app has no telemetry, so the console is the only record
    // that exists when someone sends a screenshot.
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom throws={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0] as [Error])[0]).toBeInstanceOf(Error);
  });

  it("never shows the thrown message, which means nothing to the user", () => {
    render(
      <ErrorBoundary onError={vi.fn()}>
        <Boom throws={true} />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/undefined is not a function/)).not.toBeInTheDocument();
  });
});

describe("getting out again", () => {
  it("re-renders the children when the cause has passed", async () => {
    // Retrying is worth one attempt: the state that triggered the crash may
    // have moved on. A boundary with no way out is the blank screen again.
    function Harness() {
      const [throws, setThrows] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setThrows(false)}>
            Fix it
          </button>
          <ErrorBoundary onError={vi.fn()}>
            <Boom throws={throws} />
          </ErrorBoundary>
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "This screen broke" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fix it" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("The screen")).toBeInTheDocument();
  });

  it("crashes again rather than pretending, if the cause has not passed", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary onError={vi.fn()}>
        <Boom throws={true} />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("heading", { name: "This screen broke" })).toBeInTheDocument();
  });
});
