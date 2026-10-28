import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    env: { STERLING_HANDOFF_FILE: path.join(import.meta.dirname, "node_modules", ".cache", "test-handoffs.json") },
  },
});
