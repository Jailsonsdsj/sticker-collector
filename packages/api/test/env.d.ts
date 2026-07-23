/// <reference types="@cloudflare/vitest-pool-workers/types" />

// `env` from `cloudflare:test` is typed as `Cloudflare.Env` (the namespace generated
// by `wrangler types`). Merge in the migrations array that vitest.config injects as a
// binding. Inline `import(...)` keeps this a script file so the augmentation lands on
// the GLOBAL `Cloudflare` namespace rather than a local one.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
  }
}
