import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: ["node", "web"].map(backend => ({
      // Exercise sources during migration; native import tests exercise dist.
      resolve: {
        alias: [
          { find: /^iconv-lite$/, replacement: fileURLToPath(new URL("./lib/index-node.js", import.meta.url)) },
          { find: /^iconv-lite\/web$/, replacement: fileURLToPath(new URL("./lib/index-web.js", import.meta.url)) },
          { find: /^iconv-lite\/encodings\//, replacement: fileURLToPath(new URL("./encodings/", import.meta.url)) }
        ]
      },
      test: {
        name: backend,
        environment: "node",
        globals: true,
        include: ["test/*.test.{js,ts}"],
        setupFiles: ["./test/env/" + backend + "-backend.js"],
        allowOnly: false
      }
    })),
    coverage: {
      provider: "v8",
      include: ["lib/**/*.{js,ts}", "encodings/**/*.{js,ts}", "backends/**/*.{js,ts}"],
      exclude: ["**/*.d.ts", "lib/index-web.{js,ts}"],
      reporter: ["text", "lcov", "html"],
      thresholds: { statements: 90, branches: 90, functions: 95, lines: 90 }
    }
  }
})
