// Vendors the WHATWG indexes needed by decode-compare.ts and SBCS tests, from
// the canonical source the spec (and WPT) derive from:
//   https://encoding.spec.whatwg.org/indexes.json
//
// These drive a `new TextDecoder(enc).decode(canonicalBytes)` conformance check
// for shift_jis / euc-jp / euc-kr / big5 — the legacy multi-byte encodings that
// ship no TextDecoder `.any.js` test upstream (only iframe/XHR ones), and full
// Windows single-byte encode/decode checks in Node.js and Vitest Browser Mode.
//
//   node test/wpt/gen-indexes.ts

import fs from "fs"
import path from "path"

const URL = "https://encoding.spec.whatwg.org/indexes.json"
const TABLES = {
  "whatwg-multibyte-indexes.json": ["jis0208", "jis0212", "big5", "euc-kr"],
  "whatwg-windows-indexes.json": [874, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258]
    .map(cp => "windows-" + cp),
  "whatwg-koi8-mac-indexes.json": ["koi8-u", "macintosh", "x-mac-cyrillic"]
}

async function main () {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`GET ${URL} -> ${res.status}`)
  const indexes = await res.json() as Record<string, (number | null)[]>

  for (const [file, keys] of Object.entries(TABLES)) {
    const out: Record<string, (number | null)[]> = {}
    for (const k of keys) {
      if (!Array.isArray(indexes[k])) throw new Error(`missing index: ${k}`)
      out[k] = indexes[k]
    }

    const dest = path.join(import.meta.dirname, "data", file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, JSON.stringify(out) + "\n")
    console.log(`Wrote ${keys.join(", ")} to ${path.relative(process.cwd(), dest)}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
