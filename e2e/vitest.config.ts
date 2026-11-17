import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    globalSetup: ["e2e/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One anvil node; files deploy their own contracts but share the chain.
    fileParallelism: false,
    reporters: ["default", "json"],
    outputFile: { json: "e2e/results.json" },
  },
});
