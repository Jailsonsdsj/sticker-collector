import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SECTION_DEFAULTS, sectionIsOpen, useCollapsibleSections } from "./sectionState";

beforeEach(() => localStorage.clear());

const KEY = "sc_section_open";

describe("defaults", () => {
  it("open today's work and the day's record", () => {
    const { result } = renderHook(() => useCollapsibleSections());

    expect(result.current.isOpen("today")).toBe(true);
    expect(result.current.isOpen("general")).toBe(true);
    expect(result.current.isOpen("completed")).toBe(true);
  });

  it("fold what is reference rather than work in hand", () => {
    // Missed is what already slipped; the backlog is a fortnight that has not
    // happened. Either one open pushes today's list off the first screenful.
    const { result } = renderHook(() => useCollapsibleSections());

    expect(result.current.isOpen("backlog")).toBe(false);
    expect(result.current.isOpen("backlog")).toBe(false);
  });

  it("open anything not named, so a new section is never hidden by accident", () => {
    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("a-section-invented-tomorrow")).toBe(true);
  });
});

describe("choices", () => {
  it("override the default in both directions", () => {
    const { result } = renderHook(() => useCollapsibleSections());

    act(() => result.current.toggle("backlog")); // closed by default → open
    expect(result.current.isOpen("backlog")).toBe(true);

    act(() => result.current.toggle("today")); // open by default → closed
    expect(result.current.isOpen("today")).toBe(false);
  });

  it("are independent of each other", () => {
    const { result } = renderHook(() => useCollapsibleSections());

    act(() => result.current.toggle("general"));

    expect(result.current.isOpen("general")).toBe(false);
    expect(result.current.isOpen("today")).toBe(true);
  });

  it("survive a reload", () => {
    const first = renderHook(() => useCollapsibleSections());
    act(() => first.result.current.toggle("backlog"));

    const second = renderHook(() => useCollapsibleSections());
    expect(second.result.current.isOpen("backlog")).toBe(true);
  });

  it("store only what was actually toggled", () => {
    // Storing the resolved state would freeze today's defaults into every
    // install, so changing a default later would reach nobody.
    const { result } = renderHook(() => useCollapsibleSections());
    act(() => result.current.toggle("today"));

    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ today: false });
  });
});

describe("stored values that cannot be trusted", () => {
  it("ignore the previous format instead of misreading it", () => {
    // It used to be an array of collapsed ids. Read as a record that is
    // meaningless, so it is dropped rather than half-understood.
    localStorage.setItem(KEY, JSON.stringify(["today", "general"]));

    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true);
  });

  it("survive corruption", () => {
    localStorage.setItem(KEY, "{not json");

    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true);
  });

  it("drop entries that are not booleans", () => {
    localStorage.setItem(KEY, JSON.stringify({ today: "nope", backlog: true }));

    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true); // falls back to the default
    expect(result.current.isOpen("backlog")).toBe(true); // the valid entry survives
  });
});

describe("the defaults table", () => {
  it("names every collapsible section in the app", () => {
    expect(Object.keys(SECTION_DEFAULTS).sort()).toEqual([
      "backlog",
      "completed",
      "epics-achieved",
      "epics-active",
      "epics-next",
      "general",
      "missed",
      "progress",
      "today",
    ]);
  });

  it("folds what is a record rather than work in hand", () => {
    // Missed and the routine backlog on the home screen; finished epics on the
    // Epics screen. A year of achievements above the fold buries what is
    // running today.
    expect(SECTION_DEFAULTS["epics-achieved"]).toBe(false);
    expect(SECTION_DEFAULTS["epics-active"]).toBe(true);
    // What you are in the middle of is work in hand by definition.
    expect(SECTION_DEFAULTS.progress).toBe(true);
    expect(SECTION_DEFAULTS["epics-next"]).toBe(true);
  });

  it("folds a per-epic Done divider, whose id cannot be listed", () => {
    // One id per epic, so the table cannot name them. Finished subtasks are a
    // record of an epic, not a list of what is left in it.
    expect(sectionIsOpen({}, "epic-done-abc")).toBe(false);
    expect(sectionIsOpen({ "epic-done-abc": true }, "epic-done-abc")).toBe(true);
    // A different epic keeps its own answer.
    expect(sectionIsOpen({ "epic-done-abc": true }, "epic-done-xyz")).toBe(false);
  });

  it("still opens anything it has never heard of", () => {
    expect(sectionIsOpen({}, "something-new")).toBe(true);
  });

  it("is what sectionIsOpen falls back to", () => {
    expect(sectionIsOpen({}, "backlog")).toBe(false);
    expect(sectionIsOpen({ backlog: true }, "backlog")).toBe(true);
  });
});
