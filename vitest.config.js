import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: ["node", "web"].map(backend => ({
      test: {
        name: backend,
        environment: "node",
        globals: true,
        include: ["test/*.test.js"],
        setupFiles: ["./test/env/" + backend + "-backend.js"],
        allowOnly: false
      }
    })),
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js", "encodings/**/*.js", "backends/**/*.js"],
      exclude: ["lib/index-web.js"],
      reporter: ["text", "lcov", "html"],
      thresholds: { statements: 90, branches: 90, functions: 95, lines: 90 }
    }
  }
})
