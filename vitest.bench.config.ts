import { defineConfig, type ViteUserConfig } from "vitest/config"

// Vitest 3 typechecks compatibility jobs; current Vitest runs benchmarks on LTS.
const test: NonNullable<ViteUserConfig["test"]> & {
  experimental: { viteModuleRunner: boolean }
} = {
  fileParallelism: false,
  maxWorkers: 1,
  reporters: ["verbose"],
  testTimeout: 30000,
  allowOnly: false,
  environment: "node",
  // Measure native ESM, without Vite's export getters in the codecs.
  experimental: { viteModuleRunner: false },
  include: ["performance/*.test.ts"],
  benchmark: { include: ["performance/*.bench.ts"] }
}

export default defineConfig({ test })
