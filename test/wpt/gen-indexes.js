"use strict"

// Vendors the WHATWG multi-byte index tables needed by decode-compare.js, from
// the canonical source the spec (and WPT) derive from:
//   https://encoding.spec.whatwg.org/indexes.json
//
// These drive a `new TextDecoder(enc).decode(canonicalBytes)` conformance check
// for shift_jis / euc-jp / euc-kr / big5 — the legacy multi-byte encodings that
// ship no TextDecoder `.any.js` test upstream (only iframe/XHR ones).
//
//   node test/wpt/gen-indexes.js

const fs = require("fs")
const path = require("path")

const URL = "https://encoding.spec.whatwg.org/indexes.json"
const KEYS = ["jis0208", "jis0212", "big5", "euc-kr"]
const dest = path.join(__dirname, "data", "whatwg-multibyte-indexes.json")

async function main () {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`GET ${URL} -> ${res.status}`)
  const indexes = await res.json()

  const out = {}
  for (const k of KEYS) {
    if (!Array.isArray(indexes[k])) throw new Error(`missing index: ${k}`)
    out[k] = indexes[k]
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(out) + "\n")
  console.log(`Wrote ${KEYS.join(", ")} to ${path.relative(process.cwd(), dest)}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
