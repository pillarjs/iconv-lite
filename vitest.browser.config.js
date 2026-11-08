import { defineConfig } from "vitest/config"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { version } = require("vitest/package.json")
const legacyProvider = version.startsWith("3.")
const launch = { executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] }
// Vitest 3 loads its built-in provider by name. Newer versions use the separate
// provider package; keep that import dynamic so compatibility jobs don't need it.
const providerPackage = "@vitest/browser-playwright"
const provider = legacyProvider ? "playwright" : (await import(providerPackage)).playwright({ launchOptions: launch })

export default defineConfig({
  resolve: {
    alias: [
      { find: /^iconv-lite$/, replacement: fileURLToPath(new URL("./lib/index-web.ts", import.meta.url)) },
      { find: /^iconv-lite\/web$/, replacement: fileURLToPath(new URL("./lib/index-web.ts", import.meta.url)) },
      { find: /^iconv-lite\/encodings\//, replacement: fileURLToPath(new URL("./encodings/", import.meta.url)) }
    ]
  },
  test: {
    maxWorkers: 2,
    globals: true,
    include: ["test/*.test.{js,ts}", "test/browser/*.test.{js,ts}"],
    exclude: ["**/*.node.test.{js,ts}"],
    allowOnly: false,
    browser: {
      enabled: true,
      provider,
      headless: true,
      instances: [{
        browser: "chromium",
        ...(legacyProvider ? { launch } : {})
      }]
    }
  }
})
