const STORAGE_KEY = "sc_token";

/**
 * The session token.
 *
 * The Worker also sets an HttpOnly cookie (architecture.md §0.2) — that is what
 * `<img src="/api/images/…">` uses, since an image request cannot carry an
 * Authorization header. This copy exists for the JSON API, where a bearer token
 * is explicit about which requests are authenticated.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode, storage disabled
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* the cookie still carries the session */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * How long startup waits for the cookie before rendering anyway. Long enough
 * for a cold Worker; short enough that a dead network does not hold the app.
 */
export const COOKIE_RESTORE_TIMEOUT_MS = 1500;

/**
 * Re-set the image cookie from the stored token, before anything renders.
 *
 * Images authenticate by the HttpOnly cookie alone, and a browser can drop the
 * cookie while keeping `localStorage`. When it did, the JSON API kept working
 * and **every image 401'd** until the next login. This asks the Worker to put
 * the same token back in the cookie (it never extends the session).
 *
 * Before the first render, not after: an `<img>` that already failed does not
 * retry when the cookie comes back, so restoring it later would fix only the
 * next visit.
 *
 * Never throws and never blocks for long. Offline, slow or refused, the app
 * renders as it would have — an expired token is still caught by the first
 * API call, which clears it and shows the login screen.
 */
export async function restoreImageCookie(timeoutMs = COOKIE_RESTORE_TIMEOUT_MS): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await fetch("/api/auth/cookie", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Offline or timed out: render anyway.
  }
}
