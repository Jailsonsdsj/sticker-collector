import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/dist/**", "**/node_modules/**"],
    projects: [
      { extends: true, root: "packages/shared", test: { name: "shared" } },
      // api runs in the Workers pool with a real D1 — see packages/api/vitest.config.ts.
      "packages/api/vitest.config.ts",
      { extends: true, root: "packages/web", test: { name: "web" } },
    ],
  },
});
