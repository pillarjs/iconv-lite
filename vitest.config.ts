import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: ["node", "web"].map(backend => ({
      // Exercise TypeScript sources; native import tests exercise dist.
      resolve: {
        alias: [
          { find: /^iconv-lite$/, replacement: fileURLToPath(new URL("./lib/index-node.ts", import.meta.url)) },
          { find: /^iconv-lite\/web$/, replacement: fileURLToPath(new URL("./lib/index-web.ts", import.meta.url)) },
          { find: /^iconv-lite\/encodings\//, replacement: fileURLToPath(new URL("./encodings/", import.meta.url)) }
        ]
      },
      test: {
        name: backend,
        environment: "node",
        globals: true,
        include: ["test/*.test.ts"],
        setupFiles: ["./test/env/" + backend + "-backend.ts"],
        allowOnly: false
      }
    })),
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "encodings/**/*.ts", "backends/**/*.ts"],
      exclude: ["**/*.d.ts", "lib/index-web.ts"],
      reporter: ["text", "lcov", "html"],
      thresholds: { statements: 90, branches: 90, functions: 95, lines: 90 }
    }
  }
})
