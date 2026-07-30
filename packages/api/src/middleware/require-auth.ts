import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { SESSION_COOKIE, signingKey } from "../lib/session";

// Gates protected routes. Accepts the session either as a Bearer token (JSON API)
// or the HttpOnly cookie (image requests, which cannot set an Authorization header
// — architecture.md §5). Sets `userId` on the context for downstream handlers.
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: { userId: string };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? getCookie(c, SESSION_COOKIE);

  if (!token) return c.json({ error: "unauthorized" }, 401);

  // Read the key OUTSIDE the try: misconfiguration is not a failed login, and the
  // catch below would turn "the Worker has no signing key" into a 401 on every
  // request — a symptom that points nowhere near its cause.
  const key = signingKey(c.env);

  try {
    // alg must be explicit — this hono version does not default it. Rejects expired tokens.
    const payload = await verify(token, key, "HS256");
    if (typeof payload.sub !== "string") return c.json({ error: "unauthorized" }, 401);
    c.set("userId", payload.sub);
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
});
