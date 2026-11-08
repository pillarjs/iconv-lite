import { pathToFileURL } from "node:url"
// Runs WPT mapping tests that need a specific query variant — they ship
// multiple `// META: variant=` blocks (TextDecoder / XMLHttpRequest / document)
// and the non-TextDecoder ones need a server. Following Node.js's WPTRunner
// approach, this evaluates the test in a `vm` context with a minimal testharness,
// the iconv-lite-backed TextDecoder/TextEncoder, and `location.search` pinned to
// the chosen variant — so only the TextDecoder branch runs.

import vm from "vm"
import fs from "fs"
import path from "path"
import setup from "./shim.ts"

const upstream = path.join(import.meta.dirname, "upstream")

// Which window tests to run, and the variant to pin (skips browser-only variants).
const WINDOW_TESTS = [
  { file: "encoding/single-byte-decoder.any.js", variant: "?TextDecoder" }
]

// Exclude these tests from jsdom, which does not select the TextDecoder variant.
function isWindowTest (testPath: string) {
  return WINDOW_TESTS.some((t) => t.file.replace(/\.js$/, ".html") === testPath)
}

function metaScripts (src: string, dir: string) {
  return Array.from(src.matchAll(/^\/\/ META:\s*script=(.+)$/gm)).map((m) => {
    const ref = m[1].trim()
    return ref.startsWith("/") ? path.join(upstream, ref.slice(1)) : path.join(dir, ref)
  })
}

function runWindowTest ({ file, variant }: { file: string, variant?: string }) {
  const full = path.join(upstream, file)
  const src = fs.readFileSync(full, "utf8")
  const scripts = metaScripts(src, path.dirname(full)).map((p) => fs.readFileSync(p, "utf8"))

  const result = { file, pass: 0, fail: 0, failures: [] as string[] }
  const sandbox = {
    console,
    self: {},
    TextDecoder: undefined as unknown,
    TextEncoder: undefined as unknown,
    location: { search: variant || "" },
    test (fn: () => void, name: string) {
      try { fn(); result.pass++ } catch (e) {
        result.fail++
        if (result.failures.length < 15) result.failures.push(`${name}: ${(e as Error).message}`.replace(/\s+/g, " ").trim())
      }
    },
    // Branches for other variants are skipped, but keep stubs so the file parses.
    async_test () {},
    promise_test () {},
    setup () {},
    done () {},
    add_completion_callback () {},
    format_value: (v: unknown) => String(v),
    assert_equals (actual: unknown, expected: unknown, msg?: string) {
      if (!Object.is(actual, expected)) throw new Error(`${msg || ""} — expected ${expected}, got ${actual}`)
    },
    assert_true (v: unknown, msg?: string) { if (v !== true) throw new Error(`${msg || ""} — expected true`) },
    assert_throws_js (ctor: Function, fn: () => void, msg?: string) {
      try { fn() } catch { return }
      throw new Error(`${msg || ""} — expected to throw`)
    }
  }
  setup(sandbox) // installs the iconv-lite-backed TextDecoder / TextEncoder
  vm.createContext(sandbox)
  vm.runInContext(scripts.concat(src).join("\n;\n"), sandbox, { filename: file })
  return result
}

export { WINDOW_TESTS, isWindowTest, runWindowTest }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const t of WINDOW_TESTS) {
    const r = runWindowTest(t)
    console.log(`${r.file} (${t.variant}) — ${r.pass} pass, ${r.fail} fail`)
    for (const f of r.failures) console.log(`  × ${f}`)
    if (r.fail > r.failures.length) console.log(`  …and ${r.fail - r.failures.length} more`)
  }
}
