import { recordError } from "./errorLog";
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
 *
 * **Every failure is recorded here**, which is the only place that sees all of
 * them. A screen that catches an error still shows whatever it always showed;
 * the log is in addition, so a failure nobody caught is no longer silent.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const method = options.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    // Offline, DNS, a dropped connection: the request never reached the server,
    // so there is no status to report. Status 0 says exactly that.
    recordError({
      method,
      path,
      status: 0,
      message: cause instanceof Error ? cause.message : "network request failed",
    });
    throw cause;
  }

  if (res.status === 401) {
    clearToken();
    // Recorded, but the popup ignores it: an expired session already takes the
    // user to the login screen, and a modal about it on the way is noise about
    // something the app is already handling.
    recordError({ method, path, status: 401, message: "session expired" });
    throw new ApiError(401, "unauthorized");
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
      issues?: unknown;
    } | null;
    const message = detail?.error ?? `request failed (${res.status})`;
    recordError({ method, path, status: res.status, message });
    throw new ApiError(res.status, message, detail?.issues);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
