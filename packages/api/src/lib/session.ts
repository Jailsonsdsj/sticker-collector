import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";

// The session is an HS256 JWT, returned in the login body AND set as this cookie
// (architecture.md §0.2). Cookie flags are fixed: HttpOnly; Secure; SameSite=Strict.
export const SESSION_COOKIE = "sc_session";

/**
 * The one binding this Worker cannot run without.
 *
 * Unset, it reaches hono as `undefined` and surfaces as "Cannot read properties
 * of undefined (reading 'includes')" from inside the JWT signer — a stack trace
 * that names neither the variable nor the file you have to create. That cost a
 * CI run to diagnose. It is checked here so the message says what to do.
 *
 * It is deliberately a throw, not a 500 with a friendly body: a Worker with no
 * signing key cannot authenticate anyone, so there is no degraded mode to offer.
 */
export function signingKey(env: Env): string {
  const key = env.TOKEN_SIGNING_KEY;
  if (!key) {
    throw new Error(
      "TOKEN_SIGNING_KEY is not set. Locally: cp .dev.vars.example .dev.vars. " +
        "In production: wrangler secret put TOKEN_SIGNING_KEY.",
    );
  }
  return key;
}
const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// Signs a session token for `userId` and attaches the Set-Cookie header.
// Returns the token so the handler can also send it in the response body.
export async function issueSession(
  c: Context<{ Bindings: Env }>,
  userId: string,
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const token = await sign({ sub: userId, iat, exp }, signingKey(c.env), "HS256");

  setSessionCookie(c, token, TOKEN_TTL_SECONDS);
  return token;
}

/**
 * The one place the session cookie's flags are written, so a login and a
 * restore (below) can never disagree about them.
 */
export function setSessionCookie(c: Context, token: string, maxAge: number): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge,
  });
}

/**
 * Put a still-valid bearer token back into the cookie.
 *
 * Images authenticate by cookie alone (`<img>` cannot send a header), and the
 * cookie was only ever set at login. A browser can drop the cookie and keep
 * `localStorage` — a "clear cookies", a privacy extension, Safari's storage
 * rules — and from then on the JSON API worked while **every image 401'd**,
 * with nothing in the app able to recover short of logging in again.
 *
 * The cookie gets the **same token** and only the time it has left: this
 * re-syncs the two copies of one session, it never extends it. Returns false
 * for a token that is invalid or expired.
 */
export async function restoreSessionCookie(
  c: Context<{ Bindings: Env }>,
  token: string,
  now: number = Date.now(),
): Promise<boolean> {
  const key = signingKey(c.env);
  let exp: unknown;
  try {
    ({ exp } = await verify(token, key, "HS256"));
  } catch {
    return false;
  }
  const remaining = typeof exp === "number" ? exp - Math.floor(now / 1000) : 0;
  if (remaining <= 0) return false;
  setSessionCookie(c, token, remaining);
  return true;
}
