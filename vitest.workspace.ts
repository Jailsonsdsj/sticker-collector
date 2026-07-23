import { defineWorkspace } from "vitest/config";

// api switches to @cloudflare/vitest-pool-workers once its wrangler.jsonc lands (F-02).
export default defineWorkspace(["packages/*"]);
