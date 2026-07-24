import { env } from "cloudflare:test";
import { deriveAuthKey } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { base64ToBytes, sha256Base64 } from "../src/lib/crypto";

// The full auth surface, exercised against the real Hono app + real D1 in the
// Workers runtime. The passphrase is stretched here exactly as the browser would
// (shared deriveAuthKey); only the derived authKey ever reaches the server.

const SALT = "dGVzdC1zYWx0LTE2Ynl0ZQ=="; // base64, not secret
const ITER = 1000; // low for test speed; production uses 600k. Server logic is iteration-agnostic.
const PASSPHRASE = "correct-horse-battery-staple";
const IP = "203.0.113.7";

// Mirror of the server's stored credential: sha256(authKey).
async function hashFor(authKeyB64: string): Promise<string> {
  return sha256Base64(base64ToBytes(authKeyB64));
}

async function seedUser(): Promise<void> {
  const authKey = await deriveAuthKey(PASSPHRASE, SALT, ITER);
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind("u1", await hashFor(authKey), SALT, ITER, "UTC", "2026-07-01T00:00:00Z")
    .run();
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": IP, ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

// No storage-isolation assumptions: wipe the single-user + rate-limit tables each test.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM user").run();
  await env.DB.prepare("DELETE FROM auth_attempt").run();
  await seedUser();
});

describe("GET /api/auth/salt", () => {
  it("returns the user's KDF params so the client can stretch the passphrase", async () => {
    const res = await app.fetch(get("/api/auth/salt"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ salt: SALT, iterations: ITER });
  });
});

describe("POST /api/auth/login", () => {
  it("rejects a wrong passphrase with 401", async () => {
    const wrong = await deriveAuthKey("not-the-passphrase", SALT, ITER);
    const res = await app.fetch(post("/api/auth/login", { authKey: wrong }), env);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await app.fetch(post("/api/auth/login", { nope: true }), env);
    expect(res.status).toBe(400);
  });

  it("accepts the derived authKey, returns a token, and sets a hardened cookie", async () => {
    const authKey = await deriveAuthKey(PASSPHRASE, SALT, ITER);
    const res = await app.fetch(post("/api/auth/login", { authKey }), env);
    expect(res.status).toBe(200);

    const { token } = (await res.json()) as { token: string };
    expect(typeof token).toBe("string");

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sc_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });
});

describe("rate limiting (10 per 15-min window per hashed IP)", () => {
  it("returns 429 on the 11th attempt", async () => {
    const wrong = await deriveAuthKey("nope", SALT, ITER);
    for (let i = 1; i <= 10; i++) {
      const res = await app.fetch(post("/api/auth/login", { authKey: wrong }), env);
      expect(res.status).toBe(401); // attempts 1..10: processed, wrong passphrase
    }
    const res = await app.fetch(post("/api/auth/login", { authKey: wrong }), env);
    expect(res.status).toBe(429); // 11th: blocked before verification
  });

  it("scopes the limit per IP — a different IP is unaffected", async () => {
    const wrong = await deriveAuthKey("nope", SALT, ITER);
    for (let i = 1; i <= 11; i++) {
      await app.fetch(post("/api/auth/login", { authKey: wrong }), env);
    }
    // a fresh IP still gets a real answer, not a 429.
    const authKey = await deriveAuthKey(PASSPHRASE, SALT, ITER);
    const res = await app.fetch(
      post("/api/auth/login", { authKey }, { "CF-Connecting-IP": "198.51.100.9" }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("requireAuth on a protected route (GET /api/me)", () => {
  async function login(): Promise<{ token: string; cookie: string }> {
    const authKey = await deriveAuthKey(PASSPHRASE, SALT, ITER);
    const res = await app.fetch(post("/api/auth/login", { authKey }), env);
    const { token } = (await res.json()) as { token: string };
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0] ?? ""; // "sc_session=<token>"
    return { token, cookie };
  }

  it("reaches the route with a valid Bearer token", async () => {
    const { token } = await login();
    const res = await app.fetch(get("/api/me", { Authorization: `Bearer ${token}` }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1" });
  });

  it("reaches the route with the session cookie", async () => {
    const { cookie } = await login();
    const res = await app.fetch(get("/api/me", { Cookie: cookie }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1" });
  });

  it("rejects a missing token with 401", async () => {
    const res = await app.fetch(get("/api/me"), env);
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token with 401", async () => {
    const res = await app.fetch(get("/api/me", { Authorization: "Bearer not.a.jwt" }), env);
    expect(res.status).toBe(401);
  });
});
