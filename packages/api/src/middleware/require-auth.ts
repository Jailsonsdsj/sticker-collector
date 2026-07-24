import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { SESSION_COOKIE } from "../lib/session";

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

  try {
    // alg must be explicit — this hono version does not default it. Rejects expired tokens.
    const payload = await verify(token, c.env.TOKEN_SIGNING_KEY, "HS256");
    if (typeof payload.sub !== "string") return c.json({ error: "unauthorized" }, 401);
    c.set("userId", payload.sub);
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
});
