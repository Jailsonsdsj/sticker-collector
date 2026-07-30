import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { getToken, setToken } from "./session";

/**
 * The 401 path is the one worth pinning: an expired session has to clear the
 * token so the app lands on /login, while any OTHER failure must leave it
 * alone. Getting that backwards logs the user out whenever the server hiccups.
 */

// A fresh Response per call: a body can only be read once, so a single shared
// instance makes the SECOND request in a test throw "Body has already been read".
function respond(status: number, body: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockImplementation(async () => respond(status, body));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("401", () => {
  it("clears the stored token", async () => {
    setToken("stale-token");
    reply(401, { error: "unauthorized" });

    await expect(api("/api/tasks")).rejects.toThrow(ApiError);
    expect(getToken()).toBeNull();
  });

  it("throws an ApiError carrying the status, so callers can redirect", async () => {
    setToken("stale-token");
    reply(401, { error: "unauthorized" });

    const error = await api("/api/tasks").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });
});

describe("every other failure leaves the session alone", () => {
  it.each([400, 402, 404, 409, 500, 503])("keeps the token on %i", async (status) => {
    setToken("good-token");
    reply(status, { error: "nope" });

    await expect(api("/api/tasks")).rejects.toThrow(ApiError);
    expect(getToken()).toBe("good-token"); // a server hiccup is not a logout
  });

  it("surfaces the server's message and issues", async () => {
    reply(400, { error: "bad request", issues: [{ path: ["title"] }] });

    const error = (await api("/api/tasks").catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.message).toBe("bad request");
    expect(error.issues).toEqual([{ path: ["title"] }]);
  });

  it("still fails cleanly when the body is not JSON", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>502</html>", { status: 502 }));

    const error = (await api("/api/tasks").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
  });
});

describe("the request it sends", () => {
  it("attaches the bearer token when there is one, and omits it when there is not", async () => {
    reply(200, {});

    await api("/api/tasks");
    expect(headersOf(0).Authorization).toBeUndefined();

    setToken("live-token");
    await api("/api/tasks");
    expect(headersOf(1).Authorization).toBe("Bearer live-token");
  });

  it("sends the idempotency key only when asked", async () => {
    reply(200, {});

    await api("/api/tasks", { method: "POST", body: { title: "x" }, idempotencyKey: "key-1" });
    expect(headersOf(0)["Idempotency-Key"]).toBe("key-1");

    await api("/api/tasks", { method: "POST", body: { title: "x" } });
    expect(headersOf(1)["Idempotency-Key"]).toBeUndefined();
  });

  it("serialises the body and sets the content type only when there is one", async () => {
    reply(200, {});

    await api("/api/tasks", { method: "POST", body: { title: "Stretch" } });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ title: "Stretch" }));
    expect(headersOf(0)["content-type"]).toBe("application/json");

    await api("/api/tasks");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(headersOf(1)["content-type"]).toBeUndefined();
  });

  it("sends the cookie too — image requests cannot carry a bearer header", async () => {
    reply(200, {});
    await api("/api/tasks");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
  });
});

describe("success", () => {
  it("returns the parsed body", async () => {
    reply(200, [{ id: "t1" }]);
    await expect(api("/api/tasks")).resolves.toEqual([{ id: "t1" }]);
  });

  it("tolerates a 204 with no body", async () => {
    reply(204);
    await expect(api("/api/tasks", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

function headersOf(call: number): Record<string, string | undefined> {
  return (fetchMock.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string | undefined>;
}
