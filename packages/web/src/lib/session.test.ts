import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreImageCookie, setToken } from "./session";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Images authenticate by cookie alone. A browser that dropped the cookie but
 * kept the token 401'd on every image until the next login — startup now asks
 * the Worker to put the cookie back.
 */
describe("restoreImageCookie", () => {
  it("sends the stored token to the restore endpoint", async () => {
    setToken("tok");
    await restoreImageCookie();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/cookie");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("does nothing when signed out", async () => {
    await restoreImageCookie();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, so a dead network cannot stop the app rendering", async () => {
    setToken("tok");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(restoreImageCookie()).resolves.toBeUndefined();
  });

  it("gives up after its timeout instead of holding the first render", async () => {
    setToken("tok");
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    await expect(restoreImageCookie(20)).resolves.toBeUndefined();
  });
});
