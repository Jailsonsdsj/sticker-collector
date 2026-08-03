import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { listErrors, recordError } from "../lib/errorLog";
import { ErrorLogPanel } from "./ErrorLogPanel";

beforeEach(() => localStorage.clear());

const fail = (over: Partial<Parameters<typeof recordError>[0]> = {}) =>
  recordError({ method: "POST", path: "/api/tasks", status: 500, message: "boom", ...over });

describe("the error log in Settings", () => {
  it("says so when nothing has failed", () => {
    render(<ErrorLogPanel />);

    expect(screen.getByText("Nothing has failed")).toBeInTheDocument();
    // Nothing to clear, so no button offering to.
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows what failed, in the words needed to report it", () => {
    fail({ method: "PATCH", path: "/api/tasks/abc", status: 409, message: "version conflict" });
    render(<ErrorLogPanel />);

    // The status and the path are the half a bug report needs; a log that
    // shows only a friendly paraphrase cannot be used to report anything.
    expect(screen.getByText("409")).toBeInTheDocument();
    expect(screen.getByText("PATCH /api/tasks/abc")).toBeInTheDocument();
    expect(screen.getByText("version conflict")).toBeInTheDocument();
  });

  it("calls a request that never landed offline, not zero", () => {
    fail({ status: 0, message: "Failed to fetch" });
    render(<ErrorLogPanel />);

    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("lists the newest first", () => {
    fail({ path: "/api/older" });
    fail({ path: "/api/newer" });
    render(<ErrorLogPanel />);

    const paths = screen.getAllByText(/^POST /).map((node) => node.textContent);
    expect(paths[0]).toContain("/api/newer");
  });

  it("picks up a failure that happens while it is open", async () => {
    render(<ErrorLogPanel />);
    expect(screen.getByText("Nothing has failed")).toBeInTheDocument();

    fail({ path: "/api/live" });

    expect(await screen.findByText("POST /api/live")).toBeInTheDocument();
  });

  it("scrolls inside its own box instead of running down the screen", () => {
    // Fifty entries ran to several screens and pushed everything below it —
    // the backup panel included — off the end of Settings.
    for (let i = 0; i < 20; i++) fail({ path: `/api/${i}` });
    render(<ErrorLogPanel />);

    const list = screen.getByRole("list");
    expect(list.className).toContain("max-h-80");
    expect(list.className).toContain("overflow-y-auto");
    // Reaching the bottom must not drag the page along with it.
    expect(list.className).toContain("overscroll-contain");
  });

  it("clears the log, on the device as well as on the screen", async () => {
    const user = userEvent.setup();
    fail();
    render(<ErrorLogPanel />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("Nothing has failed")).toBeInTheDocument();
    // Not merely hidden: a "cleared" log that returns on the next reload is
    // worse than one that never cleared.
    expect(listErrors()).toEqual([]);
  });
});
