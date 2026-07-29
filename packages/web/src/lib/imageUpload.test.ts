import { imageKey, sha256Hex } from "@sticker-collector/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { imageSrc, uploadImage } from "./imageUpload";
import { getToken, setToken } from "./session";

const BYTES = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);

let fetchMock: ReturnType<typeof vi.fn>;
let key: string;

const call = (n: number) => fetchMock.mock.calls[n] as [string, RequestInit];
const methods = () =>
  fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method ?? "GET");

beforeEach(async () => {
  localStorage.clear();
  setToken("t0ken");
  key = imageKey(await sha256Hex(BYTES));
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("uploadImage", () => {
  it("addresses the bytes by their own hash", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));

    const result = await uploadImage(BYTES);

    expect(result).toEqual({ key, uploaded: true });
    expect(call(0)[0]).toBe(`/api/images/${key}`);
    expect(call(1)[0]).toBe(`/api/images/${key}`);
  });

  it("sends nothing when the bytes are already stored", async () => {
    // The property A-10 depends on: re-using an existing album's artwork must
    // upload zero bytes.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await uploadImage(BYTES);

    expect(result).toEqual({ key, uploaded: false });
    expect(methods()).toEqual(["HEAD"]);
  });

  it("asks before it sends, never the other way round", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await uploadImage(BYTES);

    expect(methods()).toEqual(["HEAD", "PUT"]);
  });

  it("sends the bearer token, which a cookie-only write would be refused without", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await uploadImage(BYTES);

    const headers = call(1)[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t0ken");
    expect(headers["content-type"]).toBe("image/jpeg");
  });

  it("sends the raw bytes, not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await uploadImage(BYTES);

    expect(call(1)[1].body).toBe(BYTES);
  });

  it("surfaces a rejected upload with its status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "wrong dimensions" }), { status: 422 }),
    );

    await expect(uploadImage(BYTES)).rejects.toMatchObject({
      status: 422,
      message: "wrong dimensions",
    });
  });

  it("clears the token on a 401, so an expired session reaches the login screen", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(uploadImage(BYTES)).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
  });

  it("does not treat a failed HEAD as permission to upload blindly", async () => {
    // 404 means "absent" and is the only status that should lead to a PUT.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(uploadImage(BYTES)).rejects.toMatchObject({ status: 500 });
    expect(methods()).toEqual(["HEAD"]);
  });
});

describe("imageSrc", () => {
  it("is a same-origin path, so the cookie authenticates the <img>", () => {
    expect(imageSrc(key)).toBe(`/api/images/${key}`);
  });
});
