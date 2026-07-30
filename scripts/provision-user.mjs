/**
 * provision-user.mjs — create the single production user. Run once, locally.
 *
 *   pnpm provision                      # derive and PRINT the SQL (default)
 *   pnpm provision -- --execute         # ...and run it against LOCAL D1
 *   pnpm provision -- --execute --remote  # ...and run it against PRODUCTION
 *   pnpm provision -- --verify https://your-worker.workers.dev
 *
 * There is deliberately **no HTTP route** that does this. On a single-user app a
 * provisioning endpoint is a permanent unauthenticated write path to the only
 * account that exists; the operation is rare enough to be a local script and
 * dangerous enough that it should stay one.
 *
 * The derivation is NOT written here. `deriveUserCredential` comes from
 * `packages/api/src/lib/provision.ts`, which composes `packages/shared`'s KDF
 * with the same hash the login route verifies with — and a test provisions
 * through it and then logs in for real. If this script owned its own copy of
 * that logic, a subtle mismatch would produce a row that looks valid and locks
 * the only user out permanently.
 *
 * The passphrase is prompted with echo off, is never written to disk, never
 * passed as an argument (argv is visible to `ps`), and never printed.
 */

import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { KDF_ITERATIONS } from "@sticker-collector/shared";
import { deriveUserCredential } from "../packages/api/src/lib/provision.ts";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const flagValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const DB = "sticker-collector";
const USER_ID = "user_prod";
const TIMEZONE = flagValue("--timezone") ?? "Europe/Lisbon";

/**
 * Hidden prompts, backed by a queue rather than sequential `rl.question` calls.
 *
 * Two things bite here. A second readline interface cannot read piped stdin
 * after the first closes it, and even on one interface, piped input arrives as
 * a burst — readline emits every line before the second `question()` has been
 * registered, so the answer is discarded and the script hangs. Buffering lines
 * as they arrive makes the same code path work interactively and under a pipe,
 * which is what makes this script testable at all.
 *
 * Echo is suppressed wholesale (`_writeToOutput` is readline's own hook) and the
 * prompts are written by hand, so nothing typed reaches the screen or the
 * scrollback of whoever is watching.
 */
const rl = createInterface({ input: stdin, output: stdout, terminal: true });
rl._writeToOutput = () => {};

const buffered = [];
const waiting = [];
let closed = false;

rl.on("line", (line) => {
  const waiter = waiting.shift();
  if (waiter) waiter(line);
  else buffered.push(line);
});
// EOF with a prompt outstanding resolves empty rather than hanging forever;
// the length and confirmation checks below then refuse, which is the right
// outcome for "input ended early".
rl.on("close", () => {
  closed = true;
  for (const waiter of waiting.splice(0)) waiter("");
});

function askHidden(question) {
  stdout.write(question);
  return new Promise((resolve) => {
    const done = (line) => {
      stdout.write("\n");
      resolve(line);
    };
    const next = buffered.shift();
    if (next !== undefined) done(next);
    else if (closed) done("");
    else waiting.push(done);
  });
}

const passphrase = await askHidden("Passphrase (not echoed): ");
if (passphrase.trim().length < 12) {
  // Short enough to brute-force is short enough to refuse: this is the only
  // credential to the whole account, and there is no password reset.
  console.error("\nRefusing: use at least 12 characters. This is the only key to the account.");
  rl.close();
  process.exit(1);
}
const again = await askHidden("Confirm passphrase: ");
if (passphrase !== again) {
  console.error("\nThose do not match. Nothing was written.");
  rl.close();
  process.exit(1);
}

rl.close();

const credential = await deriveUserCredential(passphrase);

// INSERT OR REPLACE on a fixed id: running this twice rotates the credential
// rather than creating a second account. `user` is the one table where a
// duplicate row would be a second door.
const sql = `INSERT OR REPLACE INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
VALUES ('${USER_ID}', '${credential.authKeyHash}', '${credential.kdfSalt}', ${credential.kdfIterations}, '${TIMEZONE}', '${new Date().toISOString()}');`;

console.log(`\nDerived with ${KDF_ITERATIONS.toLocaleString()} PBKDF2 iterations.`);
console.log("The passphrase itself was neither stored nor printed.\n");
console.log(sql);

function d1(sqlText, remote, capture = false) {
  return spawnSync(
    "./node_modules/.bin/wrangler",
    [
      "d1",
      "execute",
      DB,
      remote ? "--remote" : "--local",
      "--command",
      sqlText,
      "--yes",
      ...(capture ? ["--json"] : []),
    ],
    {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      env: { ...process.env, CLOUDFLARE_TELEMETRY_DISABLED: "1" },
    },
  );
}

if (has("--execute")) {
  const remote = has("--remote");
  const target = remote ? "PRODUCTION (--remote)" : "local D1";

  /**
   * Refuse to add a SECOND user.
   *
   * `POST /api/auth/login` reads `SELECT ... FROM user LIMIT 1` with no ORDER
   * BY, so with two rows it is undefined which passphrase opens the app — and
   * the other row is a door you did not mean to leave open. Deleting it instead
   * would be worse: every task, album and ledger entry references a user, and
   * the ledger cannot be deleted at all, so a silent cleanup would either fail
   * on a foreign key or destroy history.
   *
   * So this reports and stops. Removing an existing account is a deliberate act,
   * not a side effect of provisioning.
   */
  const existing = d1(`SELECT id FROM user WHERE id <> '${USER_ID}';`, remote, true);
  const others = (() => {
    try {
      return JSON.parse(existing.stdout)[0]?.results?.map((row) => row.id) ?? [];
    } catch {
      return [];
    }
  })();

  if (others.length > 0 && !has("--force")) {
    console.error(`\nRefusing: ${target} already holds another user row (${others.join(", ")}).`);
    console.error("This app is single-user — a second row is a second way in, and which one");
    console.error("logs you in is undefined. Remove it deliberately, then re-run.");
    console.error("(--force provisions anyway, leaving both rows in place.)");
    process.exit(1);
  }

  console.log(`\nApplying to ${target}...`);

  const result = d1(sql, remote);
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  console.log("\n(Nothing was written. Re-run with --execute, or --execute --remote.)");
}

// Proves the credential end to end against a running app: fetch the KDF params
// the way the browser does, derive, and log in. A row that inserted cleanly can
// still be one nobody can use, and this is the only check that rules that out.
const verifyUrl = flagValue("--verify");
if (verifyUrl) {
  const { deriveAuthKey } = await import("@sticker-collector/shared");
  const base = verifyUrl.replace(/\/$/, "");

  const salt = await fetch(`${base}/api/auth/salt`).then((r) => r.json());
  const authKey = await deriveAuthKey(passphrase, salt.salt, salt.iterations);
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authKey }),
  });

  console.log(
    login.ok
      ? `\n✓ Logged in to ${base} with the passphrase you chose.`
      : `\n✗ Login FAILED against ${base} (${login.status}). The row is wrong — do not stop here.`,
  );
  if (!login.ok) process.exit(1);
}
