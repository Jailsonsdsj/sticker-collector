import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialDraft } from "../lib/albumDraft";
import { loadDraft, saveDraft } from "../lib/draftStore";
import { AlbumNew } from "./AlbumNew";

/**
 * The wizard's orchestration: crop → upload → draft → persist → seal.
 *
 * `ImageCropper` is stubbed because it needs a canvas, which jsdom does not
 * have — so the pixels stay untested here, exactly as they were in A-02. What
 * is tested is everything around them, which is where the failures that lose a
 * user's work actually live.
 *
 * IndexedDB is real (via `fake-indexeddb`), so "abandoning mid-wizard loses
 * nothing" is proven against the same code path the browser runs.
 */

const CROPPED = new Uint8Array([0xff, 0xd8, 1, 2, 3]);

vi.mock("../components/ImageCropper", () => ({
  ImageCropper: ({ onCommit }: { onCommit: (bytes: Uint8Array) => void }) => (
    <button type="button" onClick={() => onCommit(CROPPED)}>
      commit crop
    </button>
  ),
}));

const uploadImage = vi.fn();
vi.mock("../lib/imageUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/imageUpload")>()),
  uploadImage: (bytes: Uint8Array) => uploadImage(bytes),
}));

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * A DATA router, not `MemoryRouter`. The wizard blocks navigation while it
 * holds unsaved work, and `useBlocker` only exists on a data router — under
 * `MemoryRouter` every test here throws. `App` uses `createBrowserRouter`, so
 * this is also the closer environment.
 */
function wrapper({ children }: { children: ReactNode }) {
  const router = createMemoryRouter(
    [
      { path: "/albums/new", element: children },
      { path: "/albums/:id", element: <p>the sealed album</p> },
      { path: "/albums", element: <p>the shelf</p> },
    ],
    { initialEntries: ["/albums/new"] },
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const file = (name = "cat.jpg") => new File(["bytes"], name, { type: "image/jpeg" });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  uploadImage.mockReset().mockResolvedValue({ key: key(1), uploaded: true });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi
    .fn()
    .mockImplementation(async () => json({ album: { id: "alb-new" }, stickers: [] }, 201));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Renders and waits for the stored draft to have been restored.
 *
 * A pristine draft is met by the "scratch or existing?" chooser first, so this
 * answers it — the tests below are about what happens after that choice.
 */
async function open() {
  const user = userEvent.setup();
  render(<AlbumNew />, { wrapper });

  // Wait for the restore to settle into one of its two outcomes.
  await waitFor(() => {
    const asked = screen.queryByRole("button", { name: "Start from scratch" });
    const form = screen.queryByLabelText(/title/i);
    expect(asked ?? form).not.toBeNull();
  });

  const chooser = screen.queryByRole("button", { name: "Start from scratch" });
  if (chooser) await user.click(chooser);

  await screen.findByLabelText(/title/i);
  return user;
}

/** Puts a picture through the picker: choose file → crop → upload. */
async function addImage(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.upload(screen.getByLabelText(label), file());
  await user.click(await screen.findByRole("button", { name: "commit crop" }));
}

const sealedDraft = async () => {
  await saveDraft({
    ...initialDraft,
    title: "Kitchen heroes",
    coverKey: key(999),
    stickers: [{ imageKey: key(1), tier: "legendary", title: "", description: "" }],
  });
};

describe("adding images", () => {
  it("uploads a cover and keeps only its key", async () => {
    // The draft never holds bytes — that is what makes persisting it cheap.
    uploadImage.mockResolvedValue({ key: key(42), uploaded: true });
    const user = await open();

    await addImage(user, /choose cover/i);

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(CROPPED));
    await waitFor(async () => expect((await loadDraft())?.coverKey).toBe(key(42)));
  });

  it("adds a sticker with the key the server stored it under", async () => {
    uploadImage.mockResolvedValue({ key: key(7), uploaded: true });
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Stickers" }));

    await addImage(user, /add sticker/i);

    await waitFor(async () => {
      const stored = await loadDraft();
      expect(stored?.stickers).toEqual([
        { imageKey: key(7), tier: "common", title: "", description: "" },
      ]);
    });
  });

  it("adds nothing when the upload fails, and says so", async () => {
    // A draft entry pointing at bytes that were never stored would fail at seal,
    // long after the cause is visible.
    uploadImage.mockRejectedValue(new Error("wrong dimensions"));
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Stickers" }));

    await addImage(user, /add sticker/i);

    expect(await screen.findByRole("alert")).toHaveTextContent("wrong dimensions");
    expect((await loadDraft())?.stickers ?? []).toHaveLength(0);
  });

  it("counts the same picture once", async () => {
    uploadImage.mockResolvedValue({ key: key(7), uploaded: false });
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Stickers" }));

    await addImage(user, /add sticker/i);
    await addImage(user, /add sticker/i);

    await waitFor(async () => expect((await loadDraft())?.stickers).toHaveLength(1));
  });
});

describe("abandoning mid-wizard", () => {
  it("restores everything on the way back in", async () => {
    await sealedDraft();
    await open();

    expect(await screen.findByDisplayValue("Kitchen heroes")).toBeInTheDocument();
  });

  it("re-tiers the sticker that was tapped", async () => {
    await sealedDraft();
    const user = await open();
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Stickers" }));

    await user.click(screen.getByRole("button", { name: "rare tier" }));

    await waitFor(async () => {
      const stored = await loadDraft();
      expect(stored?.stickers).toEqual([
        { imageKey: key(1), tier: "rare", title: "", description: "" },
      ]);
    });
  });

  it("restores the tier assignments, not just the text", async () => {
    await sealedDraft();
    const user = await open();
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Stickers" }));
    expect(screen.getByText("legendary")).toBeInTheDocument();
  });

  it("does not overwrite the stored draft with an empty one on the way in", async () => {
    // The restore is asynchronous; a save that fired first would wipe it.
    await sealedDraft();
    await open();
    await waitFor(async () => expect((await loadDraft())?.title).toBe("Kitchen heroes"));
  });

  it("survives being opened and closed before the draft has loaded", async () => {
    // The restore is asynchronous, so an unguarded save on mount would write the
    // empty initial draft over the stored one — and a user who opened the wizard
    // and immediately backed out would lose the lot.
    await sealedDraft();

    const { unmount } = render(<AlbumNew />, { wrapper });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect((await loadDraft())?.title).toBe("Kitchen heroes");
  });

  it("persists a change without waiting for a save button", async () => {
    const user = await open();
    await user.type(screen.getByLabelText(/title/i), "Kitchen");

    await waitFor(async () => expect((await loadDraft())?.title).toBe("Kitchen"));
  });
});

describe("sealing", () => {
  async function readyToSeal() {
    await sealedDraft();
    const user = await open();
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Seal" }));
    return user;
  }

  it("sends the whole arrangement in one request", async () => {
    const user = await readyToSeal();
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(post).toBeDefined();
      const [url, init] = post as [string, RequestInit];
      expect(url).toBe("/api/albums");
      const body = JSON.parse(init.body as string);
      expect(body.title).toBe("Kitchen heroes");
      // Untouched title/description leave as null, not "": an empty box means
      // the author wrote nothing, and "" would make that indistinguishable from
      // a deliberately blank name.
      expect(body.stickers).toEqual([
        { imageKey: key(1), tier: "legendary", title: null, description: null },
      ]);
      expect(body.odds).toEqual({ common: 60, rare: 25, epic: 12, legendary: 3 });
    });
  });

  it("tidies the draft on the way out rather than sending it raw", async () => {
    // The draft is a working document; the request body is not. A stray space
    // in a title, or an empty description, should not reach the database.
    await saveDraft({
      ...initialDraft,
      title: "  Kitchen heroes  ",
      description: "   ",
      coverKey: key(999),
      stickers: [{ imageKey: key(1), tier: "common", title: "", description: "" }],
    });
    const user = await open();
    // RTL normalises whitespace in its matchers, so the padding has to be read
    // off the element itself.
    await waitFor(() =>
      expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
        "  Kitchen heroes  ",
      ),
    );
    await user.click(screen.getByRole("tab", { name: "Seal" }));
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post as [string, RequestInit])[1].body as string);
      expect(body.title).toBe("Kitchen heroes");
      expect(body.description).toBeNull();
    });
  });

  it("clears the draft and opens the album", async () => {
    const user = await readyToSeal();
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    expect(await screen.findByText("the sealed album")).toBeInTheDocument();
    expect(await loadDraft()).toBeNull();
  });

  it("keeps the draft when the seal is refused", async () => {
    // Losing an hour of arrangement to a failed request is the worst outcome
    // available here.
    fetchMock.mockImplementation(async () => json({ error: "bad request" }, 400));
    const user = await readyToSeal();

    await user.click(screen.getByRole("button", { name: "Seal album" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("bad request");
    expect((await loadDraft())?.title).toBe("Kitchen heroes");
    expect(screen.queryByText("the sealed album")).not.toBeInTheDocument();
  });

  it("will not seal an incomplete album, and says what is missing", async () => {
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Seal" }));

    expect(screen.getByRole("button", { name: "Seal album" })).toBeDisabled();
    expect(screen.getByText("An album needs a title.")).toBeInTheDocument();
    expect(screen.getByText("Choose a cover image.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one sticker.")).toBeInTheDocument();
  });

  it("will not seal on broken odds", async () => {
    await saveDraft({
      ...initialDraft,
      title: "Kitchen heroes",
      coverKey: key(999),
      stickers: [{ imageKey: key(1), tier: "common", title: "", description: "" }],
      odds: { common: 10, rare: 25, epic: 12, legendary: 3 },
    });
    const user = await open();
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Seal" }));

    expect(screen.getByRole("button", { name: "Seal album" })).toBeDisabled();
    expect(screen.getByText(/add up to 100/)).toBeInTheDocument();
  });

  it("warns about a tier that can never be pulled, without blocking", async () => {
    await saveDraft({
      ...initialDraft,
      title: "Kitchen heroes",
      coverKey: key(999),
      stickers: [{ imageKey: key(1), tier: "epic", title: "", description: "" }],
      odds: { common: 70, rare: 30, epic: 0, legendary: 0 },
    });
    const user = await open();
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Seal" }));

    expect(screen.getByText("Some stickers can only be bought directly")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seal album" })).toBeEnabled();
  });
});

describe("starting from an existing album", () => {
  const SOURCE = {
    album: {
      id: "alb-source",
      title: "Kitchen heroes",
      description: "Everyone who feeds me",
      coverKey: key(999),
      derivedFromAlbumId: null,
      unlockPrice: 750,
      randomPrice: 41,
      prices: { common: 11, rare: 22, epic: 33, legendary: 44 },
      odds: { common: 70, rare: 20, epic: 10, legendary: 0 },
      hideLocked: false,
      lockedCoverKey: null,
      unlockedAt: "2026-07-02T00:00:00Z",
      completedAt: "2026-07-20T00:00:00Z",
      sealedAt: "2026-07-01T00:00:00Z",
      createdAt: "2026-07-01T00:00:00Z",
      editionNumber: 1,
      owned: 2,
      total: 2,
      percent: 100,
      status: "completed",
      remaining: 0,
      almostThere: false,
      affordable: false,
    },
    stickers: [
      {
        id: "s1",
        albumId: "alb-source",
        imageKey: key(1),
        title: null,
        description: null,
        tier: "common",
        slotIndex: 0,
        quantity: 1,
      },
      {
        id: "s2",
        albumId: "alb-source",
        imageKey: key(2),
        title: null,
        description: null,
        tier: "legendary",
        slotIndex: 1,
        quantity: 4,
      },
    ],
  };

  function serveSource() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") {
        return json({ album: { id: "alb-new" }, stickers: [] }, 201);
      }
      if (url.startsWith("/api/albums?")) return json([SOURCE.album]);
      if (url.startsWith("/api/albums/")) return json(SOURCE);
      return json([]);
    });
  }

  async function copySource() {
    serveSource();
    const user = userEvent.setup();
    render(<AlbumNew />, { wrapper });

    await user.click(await screen.findByRole("button", { name: /existing album/ }));
    await user.click(await screen.findByRole("button", { name: /Kitchen heroes/ }));
    await screen.findByLabelText(/title/i);
    return user;
  }

  it("asks the question before anything has been decided", async () => {
    serveSource();
    render(<AlbumNew />, { wrapper });

    expect(await screen.findByRole("button", { name: "Start from scratch" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
  });

  it("does not ask again when a draft is waiting", async () => {
    // Being asked to choose again would look like the work had been lost.
    await sealedDraft();
    serveSource();
    render(<AlbumNew />, { wrapper });

    expect(await screen.findByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start from scratch" })).not.toBeInTheDocument();
  });

  it("inherits the artwork, the title and the prices", async () => {
    await copySource();

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Kitchen heroes");
    await waitFor(async () => {
      const stored = await loadDraft();
      expect(stored?.coverKey).toBe(key(999));
      expect(stored?.unlockPrice).toBe(750);
      expect(stored?.stickers).toEqual([
        { imageKey: key(1), tier: "common", title: "", description: "" },
        { imageKey: key(2), tier: "legendary", title: "", description: "" },
      ]);
    });
  });

  it("uploads nothing at all", async () => {
    // The claim of the whole mode: a new version without re-importing artwork.
    const user = await copySource();
    await user.click(screen.getByRole("tab", { name: "Seal" }));
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST"),
      ).toBe(true),
    );
    expect(uploadImage).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => (url as string).startsWith("/api/images"))).toBe(
      false,
    );
  });

  it("tells the server which album it is a version of", async () => {
    const user = await copySource();
    await user.click(screen.getByRole("tab", { name: "Seal" }));
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/albums" && (init as RequestInit)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post as [string, RequestInit])[1].body as string);
      expect(body.derivedFromAlbumId).toBe("alb-source");
      expect(body.stickers).toHaveLength(2);
    });
  });

  it("leaves the source album alone", async () => {
    const user = await copySource();
    await user.click(screen.getByRole("tab", { name: "Seal" }));
    await user.click(screen.getByRole("button", { name: "Seal album" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST"),
      ).toBe(true),
    );
    // Every write went to the collection endpoint, never to the source.
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method !== "GET" && (init as RequestInit)?.method,
    );
    expect(writes.every(([url]) => url === "/api/albums")).toBe(true);
  });

  it("lets the inherited set be edited before sealing", async () => {
    const user = await copySource();
    await user.click(screen.getByRole("tab", { name: "Stickers" }));

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0] as HTMLElement);

    await waitFor(async () => expect((await loadDraft())?.stickers).toHaveLength(1));
  });

  it("starts empty when the user chooses scratch", async () => {
    serveSource();
    const user = userEvent.setup();
    render(<AlbumNew />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Start from scratch" }));

    expect(((await screen.findByLabelText(/title/i)) as HTMLInputElement).value).toBe("");
    expect((await loadDraft())?.derivedFromAlbumId ?? null).toBeNull();
  });
});

describe("leaving the wizard", () => {
  it("asks before dropping work, and stays put when told to keep editing", async () => {
    await sealedDraft();
    const user = await open();
    await screen.findByDisplayValue("Kitchen heroes");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByText("Discard this album?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    // Still in the wizard, and the draft is untouched.
    expect(screen.getByDisplayValue("Kitchen heroes")).toBeInTheDocument();
    expect((await loadDraft())?.title).toBe("Kitchen heroes");
  });

  it("clears the stored draft on discard, so the next visit starts empty", async () => {
    // The bug: back out of a new album, tap New album again, and last time's
    // title and stickers were already filled in.
    await sealedDraft();
    const user = await open();
    await screen.findByDisplayValue("Kitchen heroes");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    expect(await screen.findByText("the shelf")).toBeInTheDocument();
    expect(await loadDraft()).toBeNull();
  });

  it("does not ask when there is nothing to lose", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: "Close" }));

    // An empty wizard has no work in it; a confirmation would be a speed bump
    // in front of nothing.
    expect(await screen.findByText("the shelf")).toBeInTheDocument();
    expect(screen.queryByText("Discard this album?")).toBeNull();
  });

  it("does not ask when the album was just sealed", async () => {
    await sealedDraft();
    const user = await open();
    await screen.findByDisplayValue("Kitchen heroes");
    await user.click(screen.getByRole("tab", { name: "Seal" }));

    await user.click(screen.getByRole("button", { name: "Seal album" }));

    // Sealing navigates to the new album. Asking "discard?" about the album it
    // just created would be nonsense.
    expect(await screen.findByText("the sealed album")).toBeInTheDocument();
    expect(screen.queryByText("Discard this album?")).toBeNull();
  });
});
