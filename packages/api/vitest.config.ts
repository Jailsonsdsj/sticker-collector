import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs the API package's tests inside the Workers runtime (Miniflare) with a real,
// local D1 database — so the triggers/CHECKs/NOT NULLs from 0001_init are exercised
// exactly as they are in production, not against a mock.
export default defineConfig(async () => {
  const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));
  const migrations = await readD1Migrations(migrationsDir);

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-07-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          // A real (in-memory) R2 for the image pipeline, so "no second object"
          // is asserted by listing the bucket rather than by trusting a mock.
          r2Buckets: ["IMAGES"],
          // TEST_MIGRATIONS is applied by the setup file before any test runs;
          // TOKEN_SIGNING_KEY stands in for the production Worker secret.
          bindings: {
            TEST_MIGRATIONS: migrations,
            TOKEN_SIGNING_KEY: "test-signing-key-not-secret",
          },
        },
      }),
    ],
    test: {
      name: "api",
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      /**
       * Runs on its own, after the other projects.
       *
       * Every file here boots a workerd isolate with its own D1. Sharing eight
       * cores with jsdom made `pnpm test` fail somewhere new roughly one run in
       * three — always a timing-sensitive test, always green on its own. A
       * suite that fails somewhere different each time is a suite people learn
       * to re-run instead of read.
       */
      sequence: { groupOrder: 1 },
    },
  };
});
