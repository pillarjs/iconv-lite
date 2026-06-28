"use strict"

// Conformance check for the legacy multi-byte decoders that ship no TextDecoder
// `.any.js` test upstream (shift_jis / euc-jp / euc-kr / big5 — only iframe/XHR
// tests exist). Following how TextDecoder polyfills are compared in practice, it
// generates the canonical bytes for every assigned pointer from the WHATWG index
// tables (spec encoder arithmetic) and asserts
//   new TextDecoder(enc).decode(bytes) === String.fromCodePoint(codePoint)
// against the iconv-lite-backed shim. gbk/gb18030 are already covered by the
// vendored `*-decoder.any.js` tests.

const installShim = require("./shim")
const indexes = require("./data/whatwg-multibyte-indexes.json")

// Pointers whose big5 decode yields two code points (special-cased; skipped here).
const BIG5_DUAL = new Set([1133, 1135, 1164, 1166])

// Returns canonical [{ bytes, cp }] pairs per the WHATWG encoder arithmetic.
function pairs (enc) {
  const out = []
  const push = (bytes, cp) => out.push({ bytes, cp })

  if (enc === "euc-kr") {
    const a = indexes["euc-kr"]
    for (let p = 0; p < a.length; p++) {
      if (a[p] == null) continue
      push([(p / 190 | 0) + 0x81, p % 190 + 0x41], a[p])
    }
  } else if (enc === "big5") {
    const a = indexes.big5
    for (let p = 0; p < a.length; p++) {
      if (a[p] == null || BIG5_DUAL.has(p)) continue
      let trail = p % 157
      trail += trail < 0x3F ? 0x40 : 0x62
      push([(p / 157 | 0) + 0x81, trail], a[p])
    }
  } else if (enc === "shift_jis") {
    const a = indexes.jis0208
    for (let p = 0; p < a.length; p++) {
      if (a[p] == null) continue
      const lead = p / 188 | 0
      const trail = p % 188
      push([lead + (lead < 0x1F ? 0x81 : 0xC1), trail + (trail < 0x3F ? 0x40 : 0x41)], a[p])
    }
    for (let b = 0xA1; b <= 0xDF; b++) push([b], 0xFF61 + (b - 0xA1)) // half-width katakana
  } else if (enc === "euc-jp") {
    const a = indexes.jis0208
    for (let p = 0; p < a.length && p < 94 * 94; p++) { // euc-jp 2-byte grid only
      if (a[p] == null) continue
      push([(p / 94 | 0) + 0xA1, p % 94 + 0xA1], a[p])
    }
    const c = indexes.jis0212
    for (let p = 0; p < c.length; p++) {
      if (c[p] == null) continue
      push([0x8F, (p / 94 | 0) + 0xA1, p % 94 + 0xA1], c[p])
    }
    for (let b = 0xA1; b <= 0xDF; b++) push([0x8E, b], 0xFF61 + (b - 0xA1)) // half-width katakana
  }
  return out
}

const ENCODINGS = ["shift_jis", "euc-jp", "euc-kr", "big5"]

function runDecodeCompare () {
  const win = {}
  installShim(win) // installs the iconv-lite-backed TextDecoder
  const TextDecoder = win.TextDecoder

  return ENCODINGS.map((enc) => {
    const decoder = new TextDecoder(enc)
    const result = { enc, pass: 0, fail: 0, failures: [] }
    for (const { bytes, cp } of pairs(enc)) {
      const expected = String.fromCodePoint(cp)
      const got = decoder.decode(new Uint8Array(bytes))
      if (got === expected) { result.pass++; continue }
      result.fail++
      if (result.failures.length < 15) {
        const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
        result.failures.push(`${enc} [${hex}] → expected U+${cp.toString(16).toUpperCase()}`)
      }
    }
    return result
  })
}

module.exports = { runDecodeCompare }

if (require.main === module) {
  for (const r of runDecodeCompare()) {
    console.log(`${r.enc}: ${r.pass} pass, ${r.fail} fail`)
    for (const f of r.failures) console.log(`  × ${f}`)
    if (r.fail > r.failures.length) console.log(`  …and ${r.fail - r.failures.length} more`)
  }
}
