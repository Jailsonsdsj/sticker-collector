import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The web package's tests run in jsdom so components can actually be rendered
// and interacted with. Scope is deliberate: behaviour, not markup. No snapshots
// — a snapshot records what the DOM happens to be, which is exactly the thing
// that changes for good reasons and fails for no reason.
export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Comfortably above the 3 s async-query timeout in test/setup.ts. A query
    // that has to retry must fail as a missing element, naming what it looked
    // for — never as a bare "timed out", which says nothing.
    testTimeout: 20_000,
  },
});
