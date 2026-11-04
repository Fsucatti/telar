import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` serves the UI. `npm run dev:api` serves /api on this port.
    proxy: { "/api": "http://localhost:8787" },
  },
  // tests/ holds the Playwright tests, which have their own runner.
  test: { include: ["src/**/*.test.ts"] },
});
