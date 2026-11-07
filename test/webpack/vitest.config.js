import { defineConfig } from "vitest/config"
import { createRequire } from "node:module"

const { version } = createRequire(import.meta.url)("vitest/package.json")
const legacyProvider = version.startsWith("3.")
const launch = { executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] }
// Vitest 3 loads its built-in provider by name. Newer versions use the separate
// provider package; keep that import dynamic so compatibility jobs don't need it.
const providerPackage = "@vitest/browser-playwright"
const provider = legacyProvider ? "playwright" : (await import(providerPackage)).playwright({ launchOptions: launch })

export default defineConfig({
  test: {
    globals: true,
    include: ["browser.test.js"],
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
