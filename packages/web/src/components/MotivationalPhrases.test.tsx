import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHRASE_INTERVAL_MS, phraseIndexAt } from "../lib/motivationalPhrases";
import { MotivationalPhrases } from "./MotivationalPhrases";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const phrase = (id: string, text: string) => ({ id, text, createdAt: "2026-11-01T00:00:00.000Z" });

let stored: ReturnType<typeof phrase>[];
let fetchMock: ReturnType<typeof vi.fn>;

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MotivationalPhrases />
    </QueryClientProvider>,
  );
}

const card = () => within(screen.getByRole("region", { name: "Motivational phrase" }));

beforeEach(() => {
  stored = [];
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return json(stored);
    if (method === "POST") {
      const { text } = JSON.parse(String(init?.body)) as { text: string };
      const created = phrase(`p${stored.length + 1}`, text);
      stored = [...stored, created];
      return json(created, 201);
    }
    const id = url.split("/").pop();
    stored = stored.filter((p) => p.id !== id);
    return json({ deleted: 1 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("phraseIndexAt", () => {
  it("advances once per five minutes and wraps around", () => {
    const at = (ms: number) => phraseIndexAt(new Date(ms), 3);
    expect(at(0)).toBe(0);
    expect(at(PHRASE_INTERVAL_MS - 1)).toBe(0);
    expect(at(PHRASE_INTERVAL_MS)).toBe(1);
    expect(at(3 * PHRASE_INTERVAL_MS)).toBe(0);
  });

  it("has nothing to show for an empty list", () => {
    expect(phraseIndexAt(new Date(), 0)).toBe(-1);
  });
});

describe("the motivational phrases card", () => {
  it("shows the phrases from the server and slides to the next after five minutes", async () => {
    stored = [phrase("a", "First"), phrase("b", "Second")];
    vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "setInterval", "Date"] });
    renderCard();
    await vi.waitFor(() => expect(card().getByText("First")).toBeInTheDocument());

    act(() => vi.advanceTimersByTime(PHRASE_INTERVAL_MS));
    expect(card().getByText("Second")).toBeInTheDocument();
    expect(card().queryByText("First")).not.toBeInTheDocument();
  });

  it("adds a phrase through the API", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a motivational phrase" }));
    fireEvent.change(screen.getByLabelText("New phrase"), { target: { value: "  Keep going  " } });
    fireEvent.submit(screen.getByLabelText("New phrase").closest("form") as HTMLFormElement);

    await waitFor(() => expect(card().getByText("Keep going")).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ text: "Keep going" });
  });

  it("removes a phrase through the API", async () => {
    stored = [phrase("a", "Only one")];
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Only one — edit phrases" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove “Only one”", hidden: true }));

    await waitFor(() =>
      expect(card().getByText(/No phrases yet — tap to add one/)).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === "/api/phrases/a" && init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});
