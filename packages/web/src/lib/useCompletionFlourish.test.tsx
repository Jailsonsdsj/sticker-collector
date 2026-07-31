import { render } from "@testing-library/react";
import gsap from "gsap";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompletionFlourish } from "./useCompletionFlourish";

function Row({ done }: { done: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCompletionFlourish(ref, done);
  return <div ref={ref}>a task</div>;
}

const withMotion = (on: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("no-preference"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));

afterEach(() => vi.restoreAllMocks());

describe("the flourish a tick earns", () => {
  it("plays when a task becomes done", () => {
    // The toast that used to say "saved" is gone, so the tick itself has to
    // land: a row that merely greys out looks like one that failed to save.
    withMotion(true);
    const timeline = vi.spyOn(gsap, "timeline");

    const { rerender } = render(<Row done={false} />);
    expect(timeline).not.toHaveBeenCalled();

    rerender(<Row done={true} />);
    expect(timeline).toHaveBeenCalled();
  });

  it("does not play on mount, however many rows are already done", () => {
    // Otherwise every finished row flourishes on first paint, and again after
    // every refetch — "you finished something" becomes wallpaper.
    withMotion(true);
    const timeline = vi.spyOn(gsap, "timeline");

    render(<Row done={true} />);

    expect(timeline).not.toHaveBeenCalled();
  });

  it("does not play when a task is un-done", () => {
    withMotion(true);
    const timeline = vi.spyOn(gsap, "timeline");

    const { rerender } = render(<Row done={true} />);
    rerender(<Row done={false} />);

    expect(timeline).not.toHaveBeenCalled();
  });

  it("plays again on a second completion", () => {
    withMotion(true);
    const timeline = vi.spyOn(gsap, "timeline");

    const { rerender } = render(<Row done={false} />);
    rerender(<Row done={true} />);
    rerender(<Row done={false} />);
    rerender(<Row done={true} />);

    expect(timeline).toHaveBeenCalledTimes(2);
  });

  it("stays still when motion is unwelcome", () => {
    withMotion(false);
    const timeline = vi.spyOn(gsap, "timeline");

    const { rerender } = render(<Row done={false} />);
    rerender(<Row done={true} />);

    expect(timeline).not.toHaveBeenCalled();
  });
});
