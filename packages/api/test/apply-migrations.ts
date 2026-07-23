import { applyD1Migrations, env } from "cloudflare:test";

// Bring the isolated test D1 up to the same schema as production (0001_init:
// all tables, indexes, CHECKs, and the five invariant triggers) before any test runs.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
