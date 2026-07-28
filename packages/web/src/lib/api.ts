import { clearToken, getToken } from "./session";

/** A non-2xx response, carrying the status so callers can branch on 401/402/409. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options {
  method?: string;
  body?: unknown;
  /** Mutations pass one so a retried request never applies twice (§4.4). */
  idempotencyKey?: string;
}

/**
 * The only place a fetch to the Worker is written.
 *
 * Same-origin, so the session cookie rides along automatically — the bearer
 * token is belt and braces for the JSON API. A 401 clears the stored token, so
 * an expired session lands on the login screen instead of a silent empty list.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401) {
    clearToken();
    throw new ApiError(401, "unauthorized");
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: unknown;
    } | null;
    throw new ApiError(
      res.status,
      detail?.error ?? `request failed (${res.status})`,
      detail?.issues,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
