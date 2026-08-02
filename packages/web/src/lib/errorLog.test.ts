import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearErrors, ERROR_LOG_LIMIT, listErrors, onError, recordError } from "./errorLog";

const failure = (over: Partial<Parameters<typeof recordError>[0]> = {}) =>
  recordError({ method: "POST", path: "/api/tasks", status: 500, message: "boom", ...over });

beforeEach(() => localStorage.clear());

describe("keeping the log", () => {
  it("starts empty and survives nothing having happened", () => {
    expect(listErrors()).toEqual([]);
  });

  it("puts the newest first", () => {
    failure({ path: "/api/one" });
    failure({ path: "/api/two" });

    // The list is read from the top; a log that appends is a log you scroll to
    // the bottom of every time.
    expect(listErrors().map((entry) => entry.path)).toEqual(["/api/two", "/api/one"]);
  });

  it("survives a reload", () => {
    // The whole reason it is in storage: the interesting failures happen on a
    // phone with no debugger attached, and an in-memory log is empty by the
    // time anyone thinks to look.
    failure();
    expect(JSON.parse(localStorage.getItem("sc_error_log") ?? "[]")).toHaveLength(1);
  });

  it("keeps a bounded ring", () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 20; i++) failure({ path: `/api/${i}` });

    // A failing poll can produce hundreds in a minute, and a quota error raised
    // while logging an error is a comedy nobody needs.
    const entries = listErrors();
    expect(entries).toHaveLength(ERROR_LOG_LIMIT);
    expect(entries[0]?.path).toBe(`/api/${ERROR_LOG_LIMIT + 19}`);
  });

  it("stamps the time it happened", () => {
    const entry = failure();
    expect(entry.at).toBeGreaterThan(0);
  });

  it("clears on request", () => {
    failure();
    clearErrors();
    expect(listErrors()).toEqual([]);
  });

  it("reads a corrupt log as empty rather than throwing", () => {
    // This is a screen the user opens *because* something is already broken.
    localStorage.setItem("sc_error_log", "{not json");
    expect(listErrors()).toEqual([]);
  });

  it("reads valid JSON that is not a list as empty too", () => {
    // The subtler corruption: it parses, so the catch never fires, and every
    // consumer then treats an object as an array.
    localStorage.setItem("sc_error_log", '{"nope":1}');

    expect(listErrors()).toEqual([]);
    expect(() => failure()).not.toThrow();
    expect(listErrors()).toHaveLength(1);
  });

  it("still alerts when storage refuses to keep it", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const seen = vi.fn();
    onError(seen);

    expect(() => failure()).not.toThrow();
    // Losing the history is better than losing the alert.
    expect(seen).toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("telling someone", () => {
  it("notifies subscribers with the whole log", () => {
    const seen = vi.fn();
    const off = onError(seen);

    failure({ path: "/api/one" });

    expect(seen).toHaveBeenCalledWith([expect.objectContaining({ path: "/api/one" })]);
    off();
  });

  it("stops notifying once unsubscribed", () => {
    const seen = vi.fn();
    onError(seen)();

    failure();

    expect(seen).not.toHaveBeenCalled();
  });

  it("notifies on a clear too, so an open screen empties itself", () => {
    const seen = vi.fn();
    const off = onError(seen);

    clearErrors();

    expect(seen).toHaveBeenCalledWith([]);
    off();
  });
});
