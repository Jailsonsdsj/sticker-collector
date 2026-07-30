import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./pwa.config";

// The offline rules live in ./pwa.config.ts so they can be asserted as data —
// see test/pwa.test.ts.
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  build: {
    outDir: "dist",
  },
});
