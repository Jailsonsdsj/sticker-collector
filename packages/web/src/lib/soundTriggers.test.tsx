import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * That each of the three moments actually plays something.
 *
 * The library itself is `sounds.test.ts`; this is the wiring, which is where a
 * feature like this rots — a sound is added to the settings screen, works when
 * previewed, and is never once heard because nothing calls it.
 */
const played: string[] = [];
vi.mock("./sounds", async (importOriginal) => {
  const real = await importOriginal<typeof import("./sounds")>();
  return { ...real, playSound: (event: string) => played.push(event) };
});

const { CompletionQueueProvider, usePendingCompletions } = await import("./completionQueue");
const { useBuySticker, usePullSticker, usePullPiece, useUnlockPieces } = await import(
  "./mutations"
);

let fetchMock: ReturnType<typeof vi.fn>;
let body: unknown;

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <CompletionQueueProvider onCommit={async () => undefined}>{children}</CompletionQueueProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  played.length = 0;
  body = { ok: true };
  fetchMock = vi.fn().mockImplementation(async () => json(body));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("ticking a task", () => {
  it("plays at the tick, not at the commit", async () => {
    // The coins appear the moment the box is pressed; a sound that waits out
    // the five-second undo window belongs to nothing the user did.
    const { result } = renderHook(() => usePendingCompletions(), { wrapper });

    act(() =>
      result.current.complete(
        { taskId: "t1", scheduledOn: "2026-09-13" },
        { title: "x", coins: 5 },
      ),
    );

    expect(played).toEqual(["taskDone"]);
  });

  it("plays once, not once per screen that can tick", async () => {
    const { result } = renderHook(() => usePendingCompletions(), { wrapper });
    const ref = { taskId: "t1", scheduledOn: "2026-09-13" };

    act(() => result.current.complete(ref, { title: "x", coins: 5 }));
    // The queue refuses to double-book the same day; the sound must not
    // double either.
    act(() => result.current.complete(ref, { title: "x", coins: 5 }));

    expect(played).toEqual(["taskDone"]);
  });
});

describe("a new sticker", () => {
  it("plays when one is bought", async () => {
    const { result } = renderHook(() => useBuySticker("a1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("s1");
    });

    expect(played).toEqual(["sticker"]);
  });

  it("plays when one is pulled", async () => {
    body = { duplicate: false };
    const { result } = renderHook(() => usePullSticker("a1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(played).toEqual(["sticker"]);
  });

  it("stays quiet on a duplicate", async () => {
    // The sound marks the shelf growing. Playing it for a copy you already had
    // would be the app celebrating the outcome you were hoping to avoid.
    body = { duplicate: true };
    const { result } = renderHook(() => usePullSticker("a1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(played).toEqual([]);
  });
});

describe("a new puzzle piece", () => {
  it("plays on a random pull", async () => {
    body = { pieces: [4] };
    const { result } = renderHook(() => usePullPiece("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(played).toEqual(["piece"]);
  });

  it("plays once for a purchase, however many pieces it bought", async () => {
    // Sixty tones fired together is not sixty rewards, it is a noise.
    body = { pieces: [1, 2, 3, 4, 5] };
    const { result } = renderHook(() => useUnlockPieces("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ pieces: [1, 2, 3, 4, 5] });
    });

    expect(played).toEqual(["piece"]);
  });

  it("stays quiet when a purchase granted nothing", async () => {
    body = { pieces: [] };
    const { result } = renderHook(() => useUnlockPieces("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ pieces: [] });
    });

    expect(played).toEqual([]);
  });
});

describe("when it goes wrong", () => {
  it("says nothing about a purchase that failed", async () => {
    fetchMock.mockImplementation(async () => new Response("nope", { status: 402 }));
    const { result } = renderHook(() => useBuySticker("a1"), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("s1");
      }),
    ).rejects.toBeTruthy();

    await waitFor(() => expect(played).toEqual([]));
  });
});
