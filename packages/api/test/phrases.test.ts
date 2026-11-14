import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

let token: string;

async function makeUser(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id,auth_key_hash,kdf_salt,kdf_iterations,timezone,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, "h", "s", 600000, "UTC", "2026-07-01T00:00:00Z")
    .run();
  const { sign } = await import("hono/jwt");
  const iat = Math.floor(Date.now() / 1000);
  return sign({ sub: id, iat, exp: iat + 3600 }, env.TOKEN_SIGNING_KEY, "HS256");
}

function call(method: string, path: string, body?: unknown, as = token) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", Authorization: `Bearer ${as}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

type PhraseBody = { id: string; text: string; createdAt: string };
const list = async (as = token) =>
  (await (await call("GET", "/api/phrases", undefined, as)).json()) as PhraseBody[];

beforeEach(async () => {
  token = await makeUser();
});

describe("motivational phrases", () => {
  it("adds phrases, trimmed, and lists them oldest first", async () => {
    const first = await call("POST", "/api/phrases", { text: "  Keep going  " });
    expect(first.status).toBe(201);
    expect(((await first.json()) as PhraseBody).text).toBe("Keep going");
    await call("POST", "/api/phrases", { text: "One more" });

    expect((await list()).map((p) => p.text)).toEqual(["Keep going", "One more"]);
  });

  it("rejects an empty or overlong phrase", async () => {
    expect((await call("POST", "/api/phrases", { text: "   " })).status).toBe(400);
    expect((await call("POST", "/api/phrases", { text: "x".repeat(141) })).status).toBe(400);
  });

  it("removes a phrase", async () => {
    const created = (await (
      await call("POST", "/api/phrases", { text: "Gone soon" })
    ).json()) as PhraseBody;
    expect((await call("DELETE", `/api/phrases/${created.id}`)).status).toBe(200);
    expect(await list()).toEqual([]);
    expect((await call("DELETE", `/api/phrases/${created.id}`)).status).toBe(404);
  });

  it("keeps each user's phrases to themselves", async () => {
    const created = (await (
      await call("POST", "/api/phrases", { text: "Mine" })
    ).json()) as PhraseBody;
    const other = await makeUser();

    expect(await list(other)).toEqual([]);
    expect((await call("DELETE", `/api/phrases/${created.id}`, undefined, other)).status).toBe(404);
    expect(await list()).toHaveLength(1);
  });

  it("travels with a backup and comes back on restore", async () => {
    await call("POST", "/api/phrases", { text: "Backed up" });
    const manifest = (await (await call("GET", "/api/backup/manifest")).json()) as {
      motivationalPhrases: unknown[];
    };
    expect(manifest.motivationalPhrases).toHaveLength(1);

    const fresh = await makeUser();
    const restored = await call("POST", "/api/backup/restore", manifest, fresh);
    expect(restored.status).toBe(201);
    expect((await list(fresh)).map((p) => p.text)).toEqual(["Backed up"]);
  });
});
