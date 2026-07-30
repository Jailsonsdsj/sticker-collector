import { type ImageKind, imageKey, sha256Hex } from "@sticker-collector/shared";
import { ApiError } from "./api";
import { clearToken, getToken } from "./session";

export interface UploadResult {
  key: string;
  /** False when the bytes were already stored and nothing was sent. */
  uploaded: boolean;
}

/**
 * Stores image bytes, addressed by their own hash.
 *
 * The HEAD comes first so identical bytes are never sent twice. That is not an
 * optimisation for its own sake — it is what makes "create from an existing
 * album" (A-10) cost zero bytes, since the new album's stickers reference keys
 * that are already in the bucket.
 *
 * This does not go through `api()`: the body is raw JPEG rather than JSON, and
 * `api()` stringifies everything it is given.
 */
export async function uploadImage(bytes: Uint8Array): Promise<UploadResult> {
  const key = imageKey(await sha256Hex(bytes));
  const path = `/api/images/${key}`;

  const existing = await send(path, { method: "HEAD" });
  if (existing.ok) return { key, uploaded: false };
  if (existing.status !== 404) throw await toError(existing);

  const stored = await send(path, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: bytes as BodyInit,
  });
  if (!stored.ok) throw await toError(stored);

  return { key, uploaded: true };
}

/** `<img src>` for a stored key — the cookie authenticates it, so no token is needed. */
export function imageSrc(key: string): string {
  return `/api/images/${key}`;
}

export type { ImageKind };

async function send(path: string, init: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.headers as Record<string, string>),
      // A write needs the header specifically: the route refuses a cookie-only
      // PUT, since a cookie rides along on cross-site requests.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function toError(res: Response): Promise<ApiError> {
  if (res.status === 401) {
    clearToken();
    return new ApiError(401, "unauthorized");
  }
  const detail = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(res.status, detail?.error ?? `upload failed (${res.status})`);
}
