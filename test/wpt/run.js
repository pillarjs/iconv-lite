"use strict"

// Runs the vendored Web Platform Tests (test/wpt/encoding/*.any.js) against
// iconv-lite using wpt-runner (jsdom) with the TextDecoder/TextEncoder shim from
// ./shim.js. The WPT files are unmodified upstream copies (see ./README.md).
//
//   npm run test:wpt                  # run all vendored encoding/*.any.js
//   node test/wpt/run.js textdecoder-fatal   # filter by filename substring
//   node test/wpt/run.js "" --strict         # exit non-zero on any failure

const path = require("path")
const wptRunner = require("wpt-runner")
const setup = require("./shim")
const { WINDOW_TESTS, runWindowTest } = require("./run-window")

const args = process.argv.slice(2)
const strict = args.includes("--strict")
const target = args.find((a) => !a.startsWith("--")) || ""

const wptRoot = path.join(__dirname, "upstream")

// vm-based window tests (Node.js-style runner) that jsdom can't run.
let windowFailures = 0
for (const t of WINDOW_TESTS.filter((t) => t.file.includes(target))) {
  const r = runWindowTest(t)
  windowFailures += r.fail
  console.log(`${r.file} (${t.variant}) — ${r.pass} pass, ${r.fail} fail`)
}

// Serve from the WPT root so both relative (resources/...) and absolute
// (/common/...) test includes resolve. jsdom runs the `.any.js` API tests;
// `.window.js` mapping tests are handled by the vm runner above.
//
// TODO: the `.window.js` non-TextDecoder variants (?XMLHttpRequest, ?document)
// and the legacy-mb iframe tests need the official WPT python server. Running
// those (e.g. via `wpt serve`) is future work to extend coverage.
wptRunner(wptRoot, {
  rootURL: "/",
  setup,
  filter: (testPath) => /\.any\.html$/.test(testPath) && testPath.includes(target)
})
  .then((failures) => {
    console.log(`\n=== ${failures + windowFailures} failing WPT test(s) against iconv-lite ===`)
    process.exit(strict && failures + windowFailures > 0 ? 1 : 0)
  })
  .catch((err) => { console.error(err); process.exit(1) })
