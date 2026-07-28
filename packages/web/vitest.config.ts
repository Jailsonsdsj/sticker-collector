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
  },
});
