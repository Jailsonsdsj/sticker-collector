import {
  hashFromImageKey,
  imageKindForSize,
  isImageKey,
  sha256Hex,
} from "@sticker-collector/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { jpegSize } from "../lib/jpeg";
import { idempotency } from "../middleware/idempotency";
import { requireAuth } from "../middleware/require-auth";

export const imageRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/**
 * A generous ceiling for a 1772×2480 JPEG at q0.92 — a photographic cover lands
 * around 600 KB, and it is the largest kind there is: a 1536×1536 puzzle is
 * barely half its pixels. The limit exists so a malformed client cannot make
 * the Worker hash an arbitrarily large body inside a 10 ms CPU budget.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** The bytes at a content address can never change, so they can be cached forever. */
const IMMUTABLE = "private, max-age=31536000, immutable";

/**
 * Writes require the bearer token specifically, not merely a valid session.
 *
 * `GET` has to accept the cookie — an `<img>` tag cannot send an `Authorization`
 * header, which is the whole reason images are served from the same origin
 * (architecture.md §5). But a cookie is sent automatically by the browser on
 * any cross-site request, so a cookie-authenticated write is reachable from a
 * page the user did not intend to load. Reading content-addressed bytes is the
 * safe half of that trade; writing is not, and a header is something a
 * cross-origin form cannot set.
 */
const requireBearer = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!c.req.header("Authorization")?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

/** The R2 key is the whole path after the mount point, since a key contains a slash. */
function keyFrom(path: string): string {
  const marker = "/api/images/";
  const at = path.indexOf(marker);
  return at === -1 ? "" : decodeURIComponent(path.slice(at + marker.length));
}

imageRoutes.use("*", requireAuth);

/**
 * PUT /api/images/img/<sha256>.jpg
 *
 * The client addresses the bytes it is sending; the Worker hashes them itself
 * and refuses if the two disagree. Trusting the client's key would let any
 * bytes be written to any address — and `immutable` on the way back out would
 * then be a lie, since the content at a key could change.
 *
 * Storing is skipped when the object already exists. That is what makes
 * "create from an existing album" cost zero bytes (A-10): the new album's
 * stickers reference keys that are already in the bucket.
 */
imageRoutes.put("*", requireBearer, idempotency, async (c) => {
  const claimedKey = keyFrom(c.req.path);
  if (!isImageKey(claimedKey)) return c.json({ error: "bad key" }, 400);

  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.byteLength === 0) return c.json({ error: "empty body" }, 400);
  if (body.byteLength > MAX_BYTES) return c.json({ error: "too large" }, 413);

  // Dimensions before hashing: a wrong-sized master is the failure that stays
  // invisible until the print export, so it is rejected at the only point where
  // the cause is still obvious.
  const size = jpegSize(body);
  if (!size) return c.json({ error: "not a jpeg" }, 415);
  const kind = imageKindForSize(size);
  if (!kind) {
    return c.json({ error: "wrong dimensions", got: size }, 422);
  }

  const digest = await sha256Hex(body);
  if (digest !== hashFromImageKey(claimedKey)) {
    return c.json({ error: "key does not match content" }, 400);
  }

  const existing = await c.env.IMAGES.head(claimedKey);
  if (existing) return c.json({ key: claimedKey, kind, created: false });

  await c.env.IMAGES.put(claimedKey, body, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: IMMUTABLE },
  });

  return c.json({ key: claimedKey, kind, created: true }, 201);
});

/**
 * HEAD /api/images/img/<sha256>.jpg
 *
 * Existence only. This is what lets the client skip the upload entirely when
 * the bytes are already stored, rather than sending them and being told they
 * were redundant.
 */
imageRoutes.on("HEAD", "*", async (c) => {
  const key = keyFrom(c.req.path);
  if (!isImageKey(key)) return c.body(null, 400);

  const object = await c.env.IMAGES.head(key);
  if (!object) return c.body(null, 404);

  return c.body(null, 200, {
    "content-type": "image/jpeg",
    "cache-control": IMMUTABLE,
    "content-length": String(object.size),
  });
});

/**
 * GET /api/images/img/<sha256>.jpg
 *
 * Authenticated by cookie or bearer, so the key can go straight into an
 * `<img src>`. No signed URLs, no public bucket, no token in a querystring
 * leaking into logs.
 */
imageRoutes.get("*", async (c) => {
  const key = keyFrom(c.req.path);
  if (!isImageKey(key)) return c.json({ error: "bad key" }, 400);

  const object = await c.env.IMAGES.get(key);
  if (!object) return c.json({ error: "not found" }, 404);

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": IMMUTABLE,
      etag: object.httpEtag,
      "content-length": String(object.size),
    },
  });
});
