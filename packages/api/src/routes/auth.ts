import { loginRequestSchema, type SaltResponse } from "@sticker-collector/shared";
import { Hono } from "hono";
import { base64ToBytes, constantTimeEqual, sha256Base64 } from "../lib/crypto";
import { recordAuthAttempt } from "../lib/rate-limit";
import { issueSession } from "../lib/session";

export const authRoutes = new Hono<{ Bindings: Env }>();

// GET /api/auth/salt — the single user's KDF params so the browser can stretch the
// passphrase. The salt is not secret (architecture.md §0.2).
authRoutes.get("/salt", async (c) => {
  const row = await c.env.DB.prepare("SELECT kdf_salt, kdf_iterations FROM user LIMIT 1").first<{
    kdf_salt: string;
    kdf_iterations: number;
  }>();
  if (!row) return c.json({ error: "not provisioned" }, 404);
  const body: SaltResponse = { salt: row.kdf_salt, iterations: row.kdf_iterations };
  return c.json(body);
});

// POST /api/auth/login — rate-limit first, then constant-time verify the derived
// authKey against the stored hash, then issue the session. The passphrase itself
// never reaches the server; only its PBKDF2 output (authKey) does.
authRoutes.post("/login", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { overLimit } = await recordAuthAttempt(c.env.DB, ip);
  if (overLimit) return c.json({ error: "too many attempts" }, 429);

  const parsed = loginRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "bad request" }, 400);

  const user = await c.env.DB.prepare("SELECT id, auth_key_hash FROM user LIMIT 1").first<{
    id: string;
    auth_key_hash: string;
  }>();

  let candidateHash: string;
  try {
    candidateHash = await sha256Base64(base64ToBytes(parsed.data.authKey));
  } catch {
    return c.json({ error: "invalid passphrase" }, 401);
  }

  // Compare even when there is no user, so timing does not reveal provisioning state.
  const stored = user?.auth_key_hash ?? "";
  if (!user || !constantTimeEqual(candidateHash, stored)) {
    return c.json({ error: "invalid passphrase" }, 401);
  }

  const token = await issueSession(c, user.id);
  return c.json({ token });
});
