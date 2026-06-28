"use strict"

// Runs the vendored WPT encoding tests against iconv-lite and emits a Markdown
// conformance report (per-file pass/fail + sample failing tests). Consumed by
// .github/workflows/wpt-conformance.yml to open/update a tracking issue.
//
//   node test/wpt/report.js

const path = require("path")
const wptRunner = require("wpt-runner")
const setup = require("./shim")
const { WINDOW_TESTS, runWindowTest } = require("./run-window")
const { runDecodeCompare } = require("./decode-compare")
const { version } = require("../../package.json")

// iconv-lite commit the report was generated against (for traceability).
function iconvCommit () {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try {
    return require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname }).toString().trim()
  } catch {
    return "unknown"
  }
}

const wptRoot = path.join(__dirname, "upstream")
const MAX_LISTED = 15 // cap failing-test names listed per file

// Test names can contain control chars / line separators (e.g. api-invalid-label
// wraps labels with U+0000, U+2028, U+2029) — escape them so the Markdown summary
// renders cleanly and no NUL byte truncates the output.
const clean = (s) => String(s)
  .replace(/\s+/g, " ") // collapse real whitespace (newlines, U+2028/9, NBSP) to a space
  // eslint-disable-next-line no-control-regex -- escape any remaining control bytes
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
  .trim()

const files = []
let current = null
const reporter = {
  startSuite (testPath) {
    current = { file: testPath, pass: 0, fail: 0, failures: [] }
    files.push(current)
  },
  pass () { if (current) current.pass++ },
  fail (name) {
    if (!current) return
    current.fail++
    if (current.failures.length < MAX_LISTED) current.failures.push(clean(name))
  },
  reportStack () {}
}

// jsdom runs the `.any.js` API tests; `.window.js` mapping tests run via the vm
// runner below. The `.window.js` server-backed variants (?XMLHttpRequest,
// ?document) and the legacy-mb iframe tests remain TODO (need the WPT server).
wptRunner(wptRoot, {
  rootURL: "/",
  setup,
  reporter,
  filter: (testPath) => /\.any\.html$/.test(testPath)
})
  .then(() => {
    // Append the vm-based window tests (Node.js-style runner).
    for (const t of WINDOW_TESTS) {
      const r = runWindowTest(t)
      files.push({ file: r.file.replace(/\.js$/, ".html"), pass: r.pass, fail: r.fail, failures: r.failures })
    }

    // Append the index-driven multi-byte decode-compare (shift_jis/euc-jp/euc-kr/big5).
    for (const r of runDecodeCompare()) {
      files.push({ file: `decode-compare: ${r.enc}`, pass: r.pass, fail: r.fail, failures: r.failures })
    }

    const totalFail = files.reduce((n, f) => n + f.fail, 0)
    const out = []
    out.push(`### Node ${process.version}\n`)
    out.push(`iconv-lite \`${version}\` @ \`${iconvCommit().slice(0, 12)}\`\n`)
    out.push("| Test file | ✓ pass | ✗ fail |")
    out.push("| --- | --- | --- |")
    for (const f of files.sort((a, b) => b.fail - a.fail)) {
      out.push(`| \`${f.file.replace("encoding/", "")}\` | ${f.pass} | ${f.fail || ""} |`)
    }
    out.push("")
    const failing = files.filter((f) => f.fail)
    if (failing.length) {
      out.push("<details><summary>Sample failing assertions</summary>\n")
      for (const f of failing) {
        out.push(`**${f.file.replace("encoding/", "")}** (${f.fail} failing)`)
        for (const name of f.failures) out.push(`- ${name}`)
        if (f.fail > f.failures.length) out.push(`- …and ${f.fail - f.failures.length} more`)
        out.push("")
      }
      out.push("</details>\n")
    }
    out.push(`_${totalFail} failing assertion(s) across ${failing.length} file(s)._`)
    process.stdout.write(out.join("\n") + "\n")
  })
  .catch((err) => { console.error(err); process.exit(1) })
