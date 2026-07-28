import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickAdd } from "./mutations";

/**
 * The mutation layer, not the component. What matters here is what reaches the
 * wire and which caches are refreshed afterwards — a missed invalidation shows
 * up as "I added a task and nothing happened".
 */

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ id: "t1", title: "Buy milk" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const call = () => fetchMock.mock.calls[0] as [string, RequestInit];

describe("useQuickAdd", () => {
  it("posts only a title — the server owns what a quick-add is", async () => {
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    await result.current.mutateAsync("Buy milk");

    const [url, init] = call();
    expect(url).toBe("/api/tasks/quick-add");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Buy milk" });
  });

  it("carries an idempotency key, so a retried request cannot create two tasks", async () => {
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    await result.current.mutateAsync("Buy milk");

    const key = (call()[1].headers as Record<string, string>)["Idempotency-Key"];
    expect(key).toBeTypeOf("string");
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses a different key per submission, so two deliberate adds are two tasks", async () => {
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    await result.current.mutateAsync("Buy milk");
    await result.current.mutateAsync("Buy eggs");

    const keyOf = (i: number) =>
      ((fetchMock.mock.calls[i] as [string, RequestInit])[1].headers as Record<string, string>)[
        "Idempotency-Key"
      ];
    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it("refreshes the task list, every occurrence window and the wallet", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    await result.current.mutateAsync("Buy milk");

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    const invalidated = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([["tasks"], ["occurrences"], ["wallet"]]);
  });

  it("does not refresh anything when the request fails", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useQuickAdd(), { wrapper });

    await expect(result.current.mutateAsync("Buy milk")).rejects.toThrow();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
