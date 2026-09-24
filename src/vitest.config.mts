import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal config for this repo's first test suite — plain Node
// environment (no jsdom), since the initial tests are for a pure
// server-only helper (src/lib/server/app-base-url.ts), not React
// components.
export default defineConfig({
  // Same `@/*` → `./src/*` mapping as tsconfig.json, so tests can import
  // app modules (e.g. lib/tickets.ts) that use the alias internally.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
