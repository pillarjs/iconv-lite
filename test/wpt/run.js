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

const args = process.argv.slice(2)
const strict = args.includes("--strict")
const target = args.find((a) => !a.startsWith("--")) || ""

const wptRoot = path.join(__dirname, "upstream")

// Serve from the WPT root so both relative (resources/...) and absolute
// (/common/...) test includes resolve. wpt-runner expands `foo.any.js` /
// `foo.window.js` into runnable `.html` files; match those.
wptRunner(wptRoot, {
  rootURL: "/",
  setup,
  filter: (testPath) => /\.(any|window)\.html$/.test(testPath) && testPath.includes(target)
})
  .then((failures) => {
    console.log(`\n=== ${failures} failing WPT test(s) against iconv-lite ===`)
    process.exit(strict && failures > 0 ? 1 : 0)
  })
  .catch((err) => { console.error(err); process.exit(1) })
