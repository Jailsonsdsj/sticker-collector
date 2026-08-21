import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The web package's tests run in jsdom so components can actually be rendered
// and interacted with. Scope is deliberate: behaviour, not markup. No snapshots
// — a snapshot records what the DOM happens to be, which is exactly the thing
// that changes for good reasons and fails for no reason.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The PWA plugin is not loaded here, so its virtual module cannot resolve
      // — and vite checks the specifier even for a dynamic import.
      "virtual:pwa-register": resolve(__dirname, "test/pwa-register-stub.ts"),
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    // `test/` too: not everything under test is a component. The manifest and
    // the static assets it promises are checkable facts about the built app.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
    // Comfortably above the 5 s async-query timeout in test/setup.ts. A query
    // that has to retry must fail as a missing element, naming what it looked
    // for — never as a bare "timed out", which says nothing.
    testTimeout: 20_000,
  },
});
