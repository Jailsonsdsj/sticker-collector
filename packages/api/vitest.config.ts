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
          // handed to the setup file, which applies them before any test runs.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: "api",
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
