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
