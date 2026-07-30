import { env } from "cloudflare:test";
import { deriveAuthKey, KDF_ITERATIONS } from "@sticker-collector/shared";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { deriveUserCredential } from "../src/lib/provision";

/**
 * The provisioning script's credential must be one the **real login route**
 * accepts.
 *
 * This is the whole risk of G-01: the script runs once, against production,
 * on the only account there is. A derivation that is subtly wrong — hashing the
 * base64 text instead of the decoded bytes, say — produces a row that looks
 * perfectly valid and locks the single user out permanently. So the test
 * provisions exactly as the script does and then logs in through
 * `POST /api/auth/login`, rather than comparing against a second copy of the
 * hashing logic.
 */
const PASSPHRASE = "correct horse battery staple";

async function insert(credential: Awaited<ReturnType<typeof deriveUserCredential>>) {
  await env.DB.prepare(
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
     VALUES (?, ?, ?, ?, 'UTC', '2026-07-01T00:00:00Z')`,
  )
    .bind("user_prod", credential.authKeyHash, credential.kdfSalt, credential.kdfIterations)
    .run();
}

const login = (authKey: string) =>
  app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authKey }),
    },
    env,
  );

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM user").run();
});

describe("a provisioned credential", () => {
  it("logs in through the real route", async () => {
    const credential = await deriveUserCredential(PASSPHRASE);
    await insert(credential);

    // The browser's half, done exactly as the login screen does it — reading
    // the params back from the row, not from a local variable.
    const authKey = await deriveAuthKey(PASSPHRASE, credential.kdfSalt, credential.kdfIterations);

    const response = await login(authKey);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("token");
  });

  it("publishes the salt and iteration count the browser needs", async () => {
    const credential = await deriveUserCredential(PASSPHRASE);
    await insert(credential);

    const response = await app.request("/api/auth/salt", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      salt: credential.kdfSalt,
      iterations: credential.kdfIterations,
    });
  });

  it("rejects the wrong passphrase", async () => {
    await insert(await deriveUserCredential(PASSPHRASE));

    const wrong = await deriveUserCredential("not the passphrase");
    const authKey = await deriveAuthKey("not the passphrase", wrong.kdfSalt, wrong.kdfIterations);

    expect((await login(authKey)).status).toBe(401);
  });

  it("defaults to the shared iteration count, not a number typed into a script", () => {
    // The value used to be written out in seed.sql, verify-triggers.sh, the
    // architecture doc and every test fixture, with nothing tying them together.
    expect(KDF_ITERATIONS).toBe(600_000);
  });
});

describe("the salt", () => {
  it("is different every time, so two provisionings never share one", async () => {
    const a = await deriveUserCredential(PASSPHRASE);
    const b = await deriveUserCredential(PASSPHRASE);

    expect(a.kdfSalt).not.toBe(b.kdfSalt);
    // ...and therefore so is the stored hash, even for an identical passphrase.
    expect(a.authKeyHash).not.toBe(b.authKeyHash);
  });

  it("is accepted back by the KDF it came from", async () => {
    // A salt that cannot be decoded is the failure that only shows up at login.
    const credential = await deriveUserCredential(PASSPHRASE);
    await expect(
      deriveAuthKey(PASSPHRASE, credential.kdfSalt, credential.kdfIterations),
    ).resolves.toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("provisioning", () => {
  it("is absent from the router — no path, no method", () => {
    // Asserted against the registered routes rather than by probing URLs: an
    // unknown /api path falls through to `app.notFound`, which hands the
    // request to the SPA assets, so a 404 probe tests the asset binding rather
    // than the router. What the criterion actually says is that no provisioning
    // route is *mounted* — a permanent unauthenticated write path to the only
    // account is the thing being ruled out.
    const paths = app.routes.map((route) => route.path);

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path, `unexpected route: ${path}`).not.toMatch(
        /provision|register|signup|sign-up|create-user|users/i,
      );
    }
  });

  it("leaves exactly two ways to talk to auth", () => {
    // /salt is public by necessity (the browser needs the KDF params before it
    // can prove anything) and /login is the only write. Anything else appearing
    // under /api/auth deserves a second look.
    const auth = app.routes
      .filter((route) => route.path.startsWith("/api/auth"))
      .map((route) => `${route.method} ${route.path}`)
      .filter((entry) => !entry.startsWith("ALL "));

    expect([...new Set(auth)].sort()).toEqual(
      ["GET /api/auth/salt", "POST /api/auth/login"].sort(),
    );
  });
});
