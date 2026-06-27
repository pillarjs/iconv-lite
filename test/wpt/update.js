"use strict"

// Refreshes the vendored Web Platform Tests under test/wpt/upstream/ from
// upstream. Run by .github/workflows/wpt-update.yml on a schedule, which opens a
// PR when the files drift. To add/remove coverage, edit FILES below.
//
//   node test/wpt/update.js

const { execFileSync } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const WPT_REPO = "https://github.com/web-platform-tests/wpt.git"

// Curated, iconv-lite-relevant tests + their support files, as WPT-root-relative
// paths. The mirror keeps WPT's layout so absolute includes (/common/...) and
// relative includes (resources/...) resolve when served from the root.
const FILES = [
  "encoding/api-basics.any.js",
  "encoding/api-invalid-label.any.js",
  "encoding/api-surrogates-utf8.any.js",
  "encoding/textdecoder-arguments.any.js",
  "encoding/textdecoder-byte-order-marks.any.js",
  "encoding/textdecoder-eof.any.js",
  "encoding/textdecoder-fatal.any.js",
  "encoding/textdecoder-ignorebom.any.js",
  "encoding/textdecoder-labels.any.js",
  "encoding/textdecoder-mistakes.any.js",
  "encoding/textdecoder-utf16-surrogates.any.js",
  "encoding/textencoder-constructor-non-utf.any.js",
  "encoding/textencoder-utf16-surrogates.any.js",
  // Single-byte decoder mapping test — run (TextDecoder variant only) by the
  // vm-based runner in run-window.js, following the approach Node.js uses.
  "encoding/single-byte-decoder.window.js",
  // Multi-byte legacy decoders that use TextDecoder (shimmable). Only gbk and
  // gb18030 ship a `.any.js`; shift_jis/euc-jp/euc-kr/big5 are iframe-only.
  "encoding/legacy-mb-schinese/gbk/gbk-decoder.any.js",
  "encoding/legacy-mb-schinese/gb18030/gb18030-decoder.any.js",
  "encoding/legacy-mb-schinese/gb18030/resources/ranges.js",
  "encoding/resources/encodings.js",
  "common/subset-tests.js"
]

const SPARSE = ["encoding", "common"]

const upstream = path.join(__dirname, "upstream")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wpt-"))

try {
  console.log("Cloning WPT (sparse, shallow)...")
  execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", WPT_REPO, tmp], { stdio: "inherit" })
  execFileSync("git", ["sparse-checkout", "set", ...SPARSE], { cwd: tmp, stdio: "inherit" })
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmp }).toString().trim()

  fs.rmSync(upstream, { recursive: true, force: true })
  for (const file of FILES) {
    const dest = path.join(upstream, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(tmp, file), dest)
  }

  fs.writeFileSync(path.join(__dirname, "UPSTREAM"), `${WPT_REPO}\n${commit}\n`)
  console.log(`Updated ${FILES.length} files from web-platform-tests@${commit}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
