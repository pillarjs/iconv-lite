import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ["verbose"],
    testTimeout: 30000,
    allowOnly: false,
    environment: "node",
    // Measure native ESM, without Vite's export getters in the codecs.
    experimental: { viteModuleRunner: false },
    include: ["performance/*.test.{js,ts}"],
    benchmark: { include: ["performance/*.bench.{js,ts}"] }
  }
})
