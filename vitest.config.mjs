import { defineConfig } from "vitest/config"

// Phase 1 of the Mocha -> Vitest migration: run the Node test layers under Vitest, in parallel with
// the existing mocha scripts (nothing is removed yet). The karma/webpack browser tests and the WPT
// runner are untouched in this phase.
export default defineConfig({
  test: {
    // Coverage is aggregated across all projects (Node + Web backends), replacing the two merged c8
    // runs the mocha scripts used.
    coverage: {
      provider: "v8",
      include: ["encodings/**/*.js", "lib/**/*.js", "backends/**/*.js"],
      reporter: ["text", "html", "lcov"]
    },
    projects: [
      {
        // Node backend, mirrors `npm test`: every test file with the default (Node) backend.
        test: {
          name: "node",
          globals: true,
          testTimeout: 20000, // some full-table suites (dbcs/sbcs) are slow
          include: ["test/*.test.js"]
        }
      },
      {
        // Web backend in Node, mirrors `npm run test:node-web`: only the #node-web-tagged tests, with
        // the web backend selected via the same preload the mocha scripts use.
        test: {
          name: "node-web",
          globals: true,
          testTimeout: 20000,
          include: ["test/*.test.js"],
          setupFiles: ["./test/env/web-backend.js"],
          testNamePattern: "#node-web"
        }
      }
    ]
  }
})
