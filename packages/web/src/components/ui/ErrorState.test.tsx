import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { ErrorState, isOffline } from "./ErrorState";

describe("telling offline apart from broken", () => {
  it("treats anything that is not an ApiError as never having left the device", () => {
    // `api()` throws ApiError only once a response came back, so a TypeError
    // from fetch is the signature of a request that never reached the server.
    expect(isOffline(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOffline(undefined)).toBe(true);
  });

  it("treats a response — any response — as having reached the server", () => {
    expect(isOffline(new ApiError(500, "boom"))).toBe(false);
    expect(isOffline(new ApiError(404, "gone"))).toBe(false);
  });

  it("says the connection is missing, not that something failed", () => {
    render(<ErrorState error={new TypeError("Failed to fetch")} />);

    expect(screen.getByRole("heading", { name: "No connection" })).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("blames the server for a 5xx, and reassures that nothing was lost", () => {
    render(<ErrorState error={new ApiError(503, "unavailable")} />);

    expect(screen.getByRole("heading", { name: "That didn't load" })).toBeInTheDocument();
    expect(screen.getByText(/server had a problem/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was lost/i)).toBeInTheDocument();
  });

  it("does not promise a retry will help a 4xx", () => {
    render(<ErrorState error={new ApiError(400, "bad request")} />);

    expect(screen.getByText(/refused/i)).toBeInTheDocument();
    expect(screen.queryByText(/server had a problem/i)).not.toBeInTheDocument();
  });

  it("never puts a raw error message or status code on screen", () => {
    // Users cannot act on "unavailable" or on 503, and a stack-shaped string
    // reads as the app leaking its insides.
    render(<ErrorState error={new ApiError(503, "ECONNREFUSED upstream")} />);

    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
  });
});

describe("the state itself", () => {
  it("announces itself without stealing focus", async () => {
    // `alert` is read out; `alertdialog` would move focus and fight a user
    // who is already reaching for the tab bar.
    render(<ErrorState error={new ApiError(500, "boom")} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it("offers a retry that calls back", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState error={new ApiError(500, "boom")} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry when there is nothing to retry", () => {
    render(<ErrorState error={new ApiError(500, "boom")} />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("lets a screen name what failed", () => {
    render(<ErrorState error={new ApiError(500, "boom")} title="Your albums didn't load" />);
    expect(screen.getByRole("heading", { name: "Your albums didn't load" })).toBeInTheDocument();
  });

  it("lets a caller replace advice that does not apply to a request at all", () => {
    // A render crash is neither offline nor a bad response. Without this the
    // component would infer "you look offline" from a plain Error.
    render(<ErrorState description="Something went wrong drawing this screen." />);

    expect(screen.getByText("Something went wrong drawing this screen.")).toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });
});
