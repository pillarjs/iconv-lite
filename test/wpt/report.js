"use strict"

// Runs the vendored WPT encoding tests against iconv-lite and emits a Markdown
// conformance report (per-file pass/fail + sample failing tests). Consumed by
// .github/workflows/wpt-conformance.yml to open/update a tracking issue.
//
//   node test/wpt/report.js

const path = require("path")
const wptRunner = require("wpt-runner")
const setup = require("./shim")

const wptRoot = path.join(__dirname, "upstream")
const MAX_LISTED = 15 // cap failing-test names listed per file

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
    if (current.failures.length < MAX_LISTED) current.failures.push(String(name).trim().replace(/\s+/g, " "))
  },
  reportStack () {}
}

wptRunner(wptRoot, {
  rootURL: "/",
  setup,
  reporter,
  filter: (testPath) => /\.(any|window)\.html$/.test(testPath)
})
  .then(() => {
    const totalFail = files.reduce((n, f) => n + f.fail, 0)
    const out = []
    out.push(`### Node ${process.version}\n`)
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
