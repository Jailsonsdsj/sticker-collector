import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";

// The session is an HS256 JWT, returned in the login body AND set as this cookie
// (architecture.md §0.2). Cookie flags are fixed: HttpOnly; Secure; SameSite=Strict.
export const SESSION_COOKIE = "sc_session";
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
  const token = await sign({ sub: userId, iat, exp }, c.env.TOKEN_SIGNING_KEY, "HS256");

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });

  return token;
}
