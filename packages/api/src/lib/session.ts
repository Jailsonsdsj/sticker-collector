import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";

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

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });

  return token;
}
