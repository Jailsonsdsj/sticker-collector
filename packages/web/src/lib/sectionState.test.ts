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

    expect(result.current.isOpen("missed")).toBe(false);
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

    act(() => result.current.toggle("missed")); // closed by default → open
    expect(result.current.isOpen("missed")).toBe(true);

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
    localStorage.setItem(KEY, JSON.stringify({ today: "nope", missed: true }));

    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true); // falls back to the default
    expect(result.current.isOpen("missed")).toBe(true); // the valid entry survives
  });
});

describe("the defaults table", () => {
  it("names every section the home screen renders", () => {
    expect(Object.keys(SECTION_DEFAULTS).sort()).toEqual([
      "backlog",
      "completed",
      "general",
      "missed",
      "today",
    ]);
  });

  it("is what sectionIsOpen falls back to", () => {
    expect(sectionIsOpen({}, "missed")).toBe(false);
    expect(sectionIsOpen({ missed: true }, "missed")).toBe(true);
  });
});
