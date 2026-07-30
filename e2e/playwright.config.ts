import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests: the two journeys the whole app exists to deliver.
 *
 * These run against the **real Worker** — Hono, Drizzle, D1 and R2 under
 * `wrangler dev` — not a mock. Everything below `packages/web` is already
 * covered by vitest; what is not covered anywhere else is whether the pieces
 * still fit together once money, triggers and content-addressed images are
 * involved.
 *
 * `pnpm test` is `vitest run` across the workspace, so these live in `e2e/`
 * with their own runner and their own script. A `*.spec.ts` under `packages/`
 * would be collected by both, and the vitest run would fail on the Playwright
 * imports.
 */
const PORT = 8787;

export default defineConfig({
  // The config lives beside the tests, not at the repo root — see e2e/tsconfig.json.
  testDir: ".",

  // The journeys are stateful — they spend a shared wallet against one seeded
  // database — so they cannot race each other. Correctness over wall-clock.
  fullyParallel: false,
  workers: 1,

  // A test that only passes on the third attempt is not evidence of anything;
  // CI gets one retry to absorb genuine port/boot flakiness and no more.
  retries: process.env.CI ? 1 : 0,

  // The PBKDF2 login runs 600k iterations in the browser, and the first request
  // pays for wrangler's cold start.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Seed first: the journeys assume the Forest Friends album, its twelve
    // stickers and their images. `pnpm seed` wipes local D1 every run, so the
    // suite starts from a known wallet rather than from whatever the last run
    // left behind.
    //
    // The build is not optional either — `wrangler dev` serves the SPA from
    // `packages/web/dist`, so a stale or absent build is a blank page that
    // looks like an application bug.
    command: "pnpm seed && pnpm build && pnpm dev",
    // Everything above is a root script; without this they would run in e2e/.
    cwd: "..",
    url: `http://localhost:${PORT}`,
    // Never reused, not even locally. These journeys spend a wallet and unlock
    // an album — both one-way — so a second run against a surviving server
    // starts from a state the first run created and fails on a button that is
    // no longer there. Re-seeding every run is what makes the suite repeatable;
    // the cost is ~15s of boot. (A dev server already on this port is therefore
    // a hard error, which is the honest outcome rather than a silent reuse.)
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
