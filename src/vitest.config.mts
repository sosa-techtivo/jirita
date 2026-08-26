import { defineConfig } from "vitest/config";

// Minimal config for this repo's first test suite — plain Node
// environment (no jsdom), since the initial tests are for a pure
// server-only helper (src/lib/server/app-base-url.ts), not React
// components.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
