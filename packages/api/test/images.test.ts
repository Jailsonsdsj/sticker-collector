import { env } from "cloudflare:test";
import { IMAGE_SIZES, imageKey, sha256Hex } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { jpegSize } from "../src/lib/jpeg";

const SESSION_COOKIE = "sc_session";

let token: string;

async function makeUser(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", "2026-07-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  return sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
}

/**
 * A JPEG that is real enough for everything this route does. The Worker never
 * decodes an image — it reads the frame header and stores the bytes — so a
 * synthesised SOI/APP0/SOF0/EOI sequence exercises exactly the code paths a
 * camera JPEG would, and lets a test ask for dimensions that no encoder here
 * could produce.
 */
function jpeg(width: number, height: number, salt = 0): Uint8Array {
  const bytes = [
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10, // APP0, length 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11, // SOF0, length 17
    0x08, // 8-bit precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03, // 3 components
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    // Salt bytes, so two images of the same size can differ in content.
    0xff,
    0xfe,
    0x00,
    0x04,
    (salt >> 8) & 0xff,
    salt & 0xff,
    0xff,
    0xd9, // EOI
  ];
  return new Uint8Array(bytes);
}

const stickerBytes = (salt = 0) =>
  jpeg(IMAGE_SIZES.sticker.width, IMAGE_SIZES.sticker.height, salt);
const coverBytes = () => jpeg(IMAGE_SIZES.cover.width, IMAGE_SIZES.cover.height);

function put(key: string, body: Uint8Array, init: RequestInit = {}) {
  return app.fetch(
    new Request(`http://localhost/api/images/${key}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
      body: body as BodyInit,
      ...init,
    }),
    env,
  );
}

async function upload(body: Uint8Array): Promise<{ key: string; response: Response }> {
  const key = imageKey(await sha256Hex(body));
  return { key, response: await put(key, body) };
}

/** Every object in the bucket. The only honest way to assert "no second object". */
async function objectKeys(): Promise<string[]> {
  const listed = await env.IMAGES.list();
  return listed.objects.map((o) => o.key).sort();
}

beforeEach(async () => {
  token = await makeUser();
  for (const key of await objectKeys()) await env.IMAGES.delete(key);
});

describe("PUT — content addressing", () => {
  it("stores a sticker at its own digest", async () => {
    const { key, response } = await upload(stickerBytes());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ key, kind: "sticker", created: true });
    expect(await objectKeys()).toEqual([key]);
  });

  it("recognises a cover by its dimensions", async () => {
    const { response } = await upload(coverBytes());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ kind: "cover" });
  });

  it("creates no second object when identical bytes are uploaded again", async () => {
    const bytes = stickerBytes();
    const first = await upload(bytes);
    expect(first.response.status).toBe(201);

    const second = await upload(bytes);
    expect(second.response.status).toBe(200);
    await expect(second.response.json()).resolves.toEqual({
      key: first.key,
      kind: "sticker",
      created: false,
    });

    // The claim of the whole design: one object, not two.
    expect(await objectKeys()).toEqual([first.key]);
  });

  it("keeps different images apart", async () => {
    const a = await upload(stickerBytes(1));
    const b = await upload(stickerBytes(2));
    expect(a.key).not.toBe(b.key);
    expect(await objectKeys()).toEqual([a.key, b.key].sort());
  });

  it("refuses bytes that do not hash to the key they claim", async () => {
    // Otherwise any bytes could be written to any address, and `immutable` on
    // the way back out would be a lie.
    const bytes = stickerBytes(1);
    const wrongKey = imageKey(await sha256Hex(stickerBytes(2)));

    const response = await put(wrongKey, bytes);
    expect(response.status).toBe(400);
    expect(await objectKeys()).toEqual([]);
  });

  it("refuses a key that is not a content address", async () => {
    for (const bad of ["img/nope.jpg", "img/../escape.jpg", "cover.jpg"]) {
      const response = await put(bad, stickerBytes());
      expect(response.status).toBe(400);
    }
    expect(await objectKeys()).toEqual([]);
  });
});

describe("PUT — what it refuses to store", () => {
  it("rejects an image that is not exactly a canonical size", async () => {
    // A near-miss is the dangerous one: it uploads happily and breaks the print
    // export weeks later, where the cause is invisible.
    for (const [w, h] of [
      [591, 828],
      [590, 827],
      [1772, 2481],
      [1000, 1400],
      [827, 591],
    ] as const) {
      const bytes = jpeg(w, h);
      const key = imageKey(await sha256Hex(bytes));
      const response = await put(key, bytes);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ got: { width: w, height: h } });
    }
    expect(await objectKeys()).toEqual([]);
  });

  it("rejects bytes that are not a JPEG at all", async () => {
    const notJpeg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const key = imageKey(await sha256Hex(notJpeg));
    expect((await put(key, notJpeg)).status).toBe(415);
    expect(await objectKeys()).toEqual([]);
  });

  it("rejects an empty body", async () => {
    const key = imageKey(await sha256Hex(new Uint8Array()));
    expect((await put(key, new Uint8Array())).status).toBe(400);
  });
});

describe("authentication", () => {
  it("refuses an unauthenticated read", async () => {
    const { key } = await upload(stickerBytes());
    const response = await app.fetch(new Request(`http://localhost/api/images/${key}`), env);
    expect(response.status).toBe(401);
  });

  it("serves a read authenticated by cookie alone, which is what <img> can do", async () => {
    const { key } = await upload(stickerBytes());
    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("refuses a write authenticated by cookie alone", async () => {
    // A cookie rides along on any cross-site request; a bearer header does not.
    const bytes = stickerBytes(9);
    const key = imageKey(await sha256Hex(bytes));
    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        method: "PUT",
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
        body: bytes as BodyInit,
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(await objectKeys()).toEqual([]);
  });

  it("refuses a write with no session at all", async () => {
    const bytes = stickerBytes();
    const key = imageKey(await sha256Hex(bytes));
    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        method: "PUT",
        body: bytes as BodyInit,
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});

describe("GET and HEAD", () => {
  it("returns the exact bytes that were stored", async () => {
    const bytes = stickerBytes(3);
    const { key } = await upload(bytes);

    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    const returned = new Uint8Array(await response.arrayBuffer());
    expect([...returned]).toEqual([...bytes]);
  });

  it("marks the bytes immutable, because a content address cannot change", async () => {
    const { key } = await upload(stickerBytes());
    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("404s an unknown key rather than 500ing", async () => {
    const key = imageKey("b".repeat(64));
    const response = await app.fetch(
      new Request(`http://localhost/api/images/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(response.status).toBe(404);
  });

  it("answers HEAD with existence and no body — the check that skips an upload", async () => {
    const { key } = await upload(stickerBytes(4));
    const head = (path: string) =>
      app.fetch(
        new Request(`http://localhost${path}`, {
          method: "HEAD",
          headers: { Authorization: `Bearer ${token}` },
        }),
        env,
      );

    const found = await head(`/api/images/${key}`);
    expect(found.status).toBe(200);
    expect(await found.text()).toBe("");

    const missing = await head(`/api/images/${imageKey("c".repeat(64))}`);
    expect(missing.status).toBe(404);
  });
});

describe("jpegSize", () => {
  it("reads dimensions from the frame header", () => {
    expect(jpegSize(jpeg(591, 827))).toEqual({ width: 591, height: 827 });
    expect(jpegSize(jpeg(1772, 2480))).toEqual({ width: 1772, height: 2480 });
  });

  it("skips segments before the frame header instead of guessing an offset", () => {
    const withExif = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0x00,
      0x08,
      1,
      2,
      3,
      4,
      5,
      6, // APP1 with payload
      0xff,
      0xdb,
      0x00,
      0x05,
      1,
      2,
      3, // DQT
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x03,
      0x3b,
      0x02,
      0x4f,
      0x03,
      0x01,
      0x22,
      0x00,
      0x02,
      0x11,
      0x01,
      0x03,
      0x11,
      0x01,
      0xff,
      0xd9,
    ]);
    expect(jpegSize(withExif)).toEqual({ width: 591, height: 827 });
  });

  it("does not mistake a Huffman table for a frame header", () => {
    // 0xC4 sits inside the 0xC0-0xCF range but is DHT, not a frame. Reading it
    // as one would return two bytes of a Huffman table as the dimensions.
    const withDht = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc4, 0x00, 0x09, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0xff, 0xc0,
      0x00, 0x11, 0x08, 0x03, 0x3b, 0x02, 0x4f, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03,
      0x11, 0x01, 0xff, 0xd9,
    ]);
    expect(jpegSize(withDht)).toEqual({ width: 591, height: 827 });
  });

  it("returns null for anything it cannot read", () => {
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(jpegSize(new Uint8Array([0xff, 0xd8]))).toBeNull(); // truncated
    expect(jpegSize(new Uint8Array())).toBeNull();
    // SOI straight into scan data: no frame header to find.
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull();
  });
});
