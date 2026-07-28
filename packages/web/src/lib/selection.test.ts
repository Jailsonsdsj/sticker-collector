import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "./selection";

describe("useSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.ids).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it("toggles an id on and back off", () => {
    const { result } = renderHook(() => useSelection());

    act(() => result.current.toggle("a"));
    expect(result.current.has("a")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("a"));
    expect(result.current.has("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("never repeats an id, however many times it is picked", () => {
    // `bulkTaskIdsSchema` would happily accept duplicates, and the server would
    // soft-delete the same row twice. A set makes that unrepresentable.
    const { result } = renderHook(() => useSelection());
    act(() => {
      result.current.toggle("a");
      result.current.toggle("b");
      result.current.toggle("a");
      result.current.toggle("a");
    });
    expect(result.current.ids).toEqual(["a", "b"]);
  });

  it("returns ids in a stable order", () => {
    const { result } = renderHook(() => useSelection());
    act(() => {
      result.current.toggle("c");
      result.current.toggle("a");
      result.current.toggle("b");
    });
    expect(result.current.ids).toEqual(["a", "b", "c"]);
  });

  it("clears everything at once", () => {
    const { result } = renderHook(() => useSelection());
    act(() => {
      result.current.toggle("a");
      result.current.toggle("b");
    });
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });
});
