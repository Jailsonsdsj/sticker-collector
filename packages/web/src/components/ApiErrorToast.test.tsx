import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordError } from "../lib/errorLog";
import { ApiErrorToast } from "./ApiErrorToast";

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/albums"]}>
      <Routes>
        <Route path="/albums" element={<ApiErrorToast />} />
        <Route path="/settings" element={<p>the settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

const fail = (over: Partial<Parameters<typeof recordError>[0]> = {}) =>
  recordError({ method: "POST", path: "/api/tasks", status: 500, message: "boom", ...over });

describe("announcing a failed request", () => {
  it("says nothing until something fails", () => {
    mount();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("appears on a failure, without the user having to be on any screen", async () => {
    mount();

    fail();

    expect(await screen.findByText(/did not go through/i)).toBeInTheDocument();
  });

  it("stays quiet about an expired session", async () => {
    // The 401 already redirects to the login screen. Announcing it on the way
    // is noise about something the app is handling.
    mount();

    fail({ status: 401, message: "session expired" });
    // Flushed, so "not there" means "decided not to show it" rather than
    // "React has not re-rendered yet" — which is what makes this assertion
    // worth anything.
    await act(async () => {});

    expect(screen.queryByText(/did not go through/i)).not.toBeInTheDocument();
  });

  it("shows the next real failure even after an ignored 401", async () => {
    mount();

    fail({ status: 401, message: "session expired" });
    fail({ status: 500, message: "boom" });

    expect(await screen.findByText(/did not go through/i)).toBeInTheDocument();
  });

  it("shows one toast for a burst, not five", async () => {
    mount();

    fail({ path: "/api/one" });
    fail({ path: "/api/two" });
    fail({ path: "/api/three" });

    // A dropped connection fails every request in flight. That is one problem.
    await screen.findByText(/did not go through/i);
    expect(screen.getAllByText(/did not go through/i)).toHaveLength(1);
  });

  it("takes the user to the log", async () => {
    const user = userEvent.setup();
    mount();
    fail();
    await screen.findByText(/did not go through/i);

    await user.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.getByText("the settings screen")).toBeInTheDocument();
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    mount();
    fail();
    await screen.findByText(/did not go through/i);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText(/did not go through/i)).not.toBeInTheDocument();
  });

  it("speaks plainly about the failures that have a plain meaning", async () => {
    mount();

    fail({ status: 0, message: "Failed to fetch" });

    // "Failed to fetch" is a browser's words, not an answer to "what do I do".
    expect(await screen.findByText(/no connection/i)).toBeInTheDocument();
  });
});
