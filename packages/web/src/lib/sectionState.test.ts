import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { collapsedSections, useCollapsibleSections } from "./sectionState";

beforeEach(() => localStorage.clear());

describe("folded sections", () => {
  it("start open, so nothing hides work by default", () => {
    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true);
    expect(result.current.isOpen("a-section-invented-tomorrow")).toBe(true);
  });

  it("toggle independently", () => {
    const { result } = renderHook(() => useCollapsibleSections());

    act(() => result.current.toggle("backlog"));

    expect(result.current.isOpen("backlog")).toBe(false);
    expect(result.current.isOpen("today")).toBe(true);
  });

  it("toggle back", () => {
    const { result } = renderHook(() => useCollapsibleSections());

    act(() => result.current.toggle("backlog"));
    act(() => result.current.toggle("backlog"));

    expect(result.current.isOpen("backlog")).toBe(true);
  });

  it("are remembered across visits", () => {
    // The whole point: a toggle that resets on reload is busywork.
    const first = renderHook(() => useCollapsibleSections());
    act(() => first.result.current.toggle("missed"));

    const second = renderHook(() => useCollapsibleSections());
    expect(second.result.current.isOpen("missed")).toBe(false);
  });

  it("store the collapsed set, not the open one", () => {
    // Storing "open" would mean a section added later defaults to hidden.
    const { result } = renderHook(() => useCollapsibleSections());
    act(() => result.current.toggle("today"));

    expect(collapsedSections()).toEqual(["today"]);
  });

  it("survive a corrupted value rather than taking the screen down", () => {
    localStorage.setItem("sc_collapsed_sections", "{not json");

    const { result } = renderHook(() => useCollapsibleSections());
    expect(result.current.isOpen("today")).toBe(true);
  });

  it("ignore a stored value of the wrong shape", () => {
    localStorage.setItem("sc_collapsed_sections", '{"today":true}');
    expect(collapsedSections()).toEqual([]);
  });
});
