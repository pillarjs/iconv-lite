"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()

// EUC-JP decodes via the WHATWG TextDecoder and encodes via a reverse map derived from the same
// index (see encodings/eucjp.js). Representative bytes:
const HIRAGANA_A = String.fromCharCode(0x3042) // あ, JIS X 0208, bytes a4 a2
const KANA_A = String.fromCharCode(0xff71) // ｱ, half-width katakana, bytes 8e b1
const JISX0212 = String.fromCharCode(0x4e28) // a JIS X 0212 char, bytes 8f b0 a9
const YEN = String.fromCharCode(0x00a5) // ¥, JIS X 0201, byte 5c
const OVERLINE = String.fromCharCode(0x203e) // ‾, JIS X 0201, byte 7e

describe("EUC-JP codec #node-web", function () {
  this.timeout(10000)

  it("decodes ASCII, half-width katakana, JIS X 0208 and JIS X 0212", function () {
    assert.strictEqual(iconv.decode(utils.bytes([0x41, 0x42]), "eucjp"), "AB")
    assert.strictEqual(iconv.decode(utils.bytes([0x8e, 0xb1]), "eucjp"), KANA_A)
    assert.strictEqual(iconv.decode(utils.bytes([0xa4, 0xa2]), "eucjp"), HIRAGANA_A)
    assert.strictEqual(iconv.decode(utils.bytes([0x8f, 0xb0, 0xa9]), "eucjp"), JISX0212)
  })

  it("encodes and round-trips a mixed string", function () {
    const str = "A" + HIRAGANA_A + KANA_A + JISX0212
    // ASCII, JIS X 0208 and half-width katakana have a single encoding; the JIS X 0212 char has two
    // valid forms (3-byte 0x8F... and the 2-byte IBM area), so only assert it round-trips.
    assert.strictEqual(utils.hex(iconv.encode("A" + HIRAGANA_A + KANA_A, "eucjp")), "41 a4 a2 8e b1")
    assert.strictEqual(iconv.decode(iconv.encode(str, "eucjp"), "eucjp"), str)
  })

  it("encodes the JIS X 0201 yen sign and overline (per the WHATWG encoder)", function () {
    assert.strictEqual(utils.hex(iconv.encode(YEN, "eucjp")), "5c")
    assert.strictEqual(utils.hex(iconv.encode(OVERLINE, "eucjp")), "7e")
  })

  it("prefers the 2-byte jis0208 form for dual-mapped characters (matches the WHATWG encoder)", function () {
    // U+4E28 exists both in jis0208 (the 2-byte IBM-extension area) and in JIS X 0212 (3-byte). The
    // WHATWG encoder emits the 2-byte jis0208 form; the old libiconv table emitted the 3-byte one.
    const ch = String.fromCharCode(0x4e28)
    assert.strictEqual(utils.hex(iconv.encode(ch, "eucjp")), "f9 ad")
    // Both forms decode back to the same character, so it still round-trips.
    assert.strictEqual(iconv.decode(utils.bytes([0xf9, 0xad]), "eucjp"), ch)
    assert.strictEqual(iconv.decode(utils.bytes([0x8f, 0xb0, 0xa9]), "eucjp"), ch)
  })

  it("encodes U+2212 (MINUS SIGN) like U+FF0D, per the WHATWG encoder (step 6)", function () {
    const minus = String.fromCharCode(0x2212)
    const fullwidthHyphenMinus = String.fromCharCode(0xff0d)
    assert.strictEqual(utils.hex(iconv.encode(minus, "eucjp")), "a1 dd")
    assert.strictEqual(utils.hex(iconv.encode(fullwidthHyphenMinus, "eucjp")), "a1 dd")
    // Those bytes decode (per WHATWG) to U+FF0D, so U+2212 does not round-trip by design.
    assert.strictEqual(iconv.decode(utils.bytes([0xa1, 0xdd]), "eucjp"), fullwidthHyphenMinus)
  })

  it("encodes unmappable characters as defaultCharSingleByte ('?')", function () {
    assert.strictEqual(utils.hex(iconv.encode("\u{1F600}", "eucjp")), "3f 3f") // astral -> two '?'
    assert.strictEqual(utils.hex(iconv.encode("\uD800", "eucjp")), "3f") // lone surrogate
  })

  it("decodes invalid input as U+FFFD by default", function () {
    assert.strictEqual(iconv.decode(utils.bytes([0xff]), "eucjp"), "�")
    assert.strictEqual(iconv.decode(utils.bytes([0xa4]), "eucjp"), "�") // truncated lead
  })

  it("replaces the unused C1 bytes (0x80-0x9F) with U+FFFD, per WHATWG", function () {
    // Node's raw decoder leaks these as U+0080-U+009F; the codec corrects them to match the spec.
    for (const b of [0x80, 0x8d, 0x90, 0x9f]) {
      assert.strictEqual(iconv.decode(utils.bytes([b]), "eucjp"), "�", "byte 0x" + b.toString(16))
    }
    assert.strictEqual(iconv.decode(utils.bytes([0x41, 0x80, 0x42]), "eucjp"), "A�B")
    // 0x8E and 0x8F are real lead bytes, not C1 errors.
    assert.strictEqual(iconv.decode(utils.bytes([0x8e, 0xb1]), "eucjp"), KANA_A)
  })

  it("flushes a truncated trailing sequence as U+FFFD", function () {
    // A lead byte with no trailing byte(s) is incomplete and is flushed by the decoder's end().
    assert.strictEqual(iconv.decode(utils.bytes([0xa4]), "eucjp"), "�") // 2-byte, missing trail
    assert.strictEqual(iconv.decode(utils.bytes([0x8f, 0xb0]), "eucjp"), "�") // 3-byte, missing last
    assert.strictEqual(iconv.decode(utils.bytes([0x41, 0xa4]), "eucjp"), "A�")
  })

  it("flushes a truncated sequence split across chunks via end()", utils.checkDecoderChunks("eucjp", [
    { inputs: [[0xa4]], outputs: ["", "�"] }, // write() buffers, end() flushes U+FFFD
    { inputs: [[0x8f], [0xb0]], outputs: ["", "", "�"] }
  ]))

  it("re-processes an invalid trail byte after a lead, per WHATWG error handling", function () {
    // The Encoding Standard "prepends" an invalid trail byte back to the stream, so it is decoded on
    // its own after the U+FFFD emitted for the bad lead. (libiconv instead consumed the trail byte.)
    assert.strictEqual(iconv.decode(utils.bytes([0xa1, 0x41]), "eucjp"), "�A") // JIS X 0208 lead + ASCII
    assert.strictEqual(iconv.decode(utils.bytes([0x8e, 0x41]), "eucjp"), "�A") // 0x8E (SS2, kana) + ASCII
    assert.strictEqual(iconv.decode(utils.bytes([0x8f, 0x41]), "eucjp"), "�A") // 0x8F (SS3, JIS X 0212) + ASCII
  })

  it("throws in fatal mode on invalid input", function () {
    assert.throws(function () { iconv.decode(utils.bytes([0xff]), "eucjp", { fatal: true }) })
    assert.throws(function () { iconv.decode(utils.bytes([0x80]), "eucjp", { fatal: true }) }) // C1 byte
    assert.throws(function () { iconv.decode(utils.bytes([0xa4]), "eucjp", { fatal: true }) }) // truncated
    assert.strictEqual(iconv.decode(utils.bytes([0x41]), "eucjp", { fatal: true }), "A")
  })

  it("resolves aliases to the same codec", function () {
    const variations = ["eucjp", "euc-jp", "x-euc-jp", "cseucpkdfmtjapanese"]
    variations.forEach(function (enc) {
      assert.strictEqual(iconv.decode(utils.bytes([0xa4, 0xa2]), enc), HIRAGANA_A, "decode via " + enc)
      assert.strictEqual(utils.hex(iconv.encode(HIRAGANA_A, enc)), "a4 a2", "encode via " + enc)
    })
  })

  it("handles empty input", function () {
    assert.strictEqual(iconv.decode(utils.bytes([]), "eucjp"), "")
    assert.strictEqual(utils.hex(iconv.encode("", "eucjp")), "")
  })

  it("decodes multi-byte sequences split across chunks", utils.checkDecoderChunks("eucjp", [
    { inputs: [[0xa4], [0xa2]], outputs: ["", HIRAGANA_A] }, // 2-byte split
    { inputs: [[0x8f, 0xb0], [0xa9]], outputs: ["", JISX0212] }, // 3-byte split
    { inputs: [[0x41], [0x8f], [0xb0], [0xa9], [0x42]], outputs: ["A", "", "", JISX0212, "B"] }
  ]))

  it("round-trips every encodable BMP character", function () {
    let input = ""
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue // surrogates
      if (cp === 0x00a5 || cp === 0x203e) continue // yen/overline intentionally share bytes with \ and ~
      if (cp === 0x2212) continue // MINUS SIGN intentionally encodes like U+FF0D (encoder step 6)
      const ch = String.fromCharCode(cp)
      if (utils.hex(iconv.encode(ch, "eucjp")) === "3f" && ch !== "?") continue // unencodable -> '?'
      input += ch
    }
    // EUC-JP is self-synchronizing, so encoding then decoding the whole set reconstructs it.
    assert.strictEqual(iconv.decode(iconv.encode(input, "eucjp"), "eucjp"), input)
  })
})

// Node-only: cross-check decode and encode against the native libiconv (the source of truth the old
// table was generated from). Not #node-web (needs the native `iconv` binding).
describe("EUC-JP vs libiconv", function () {
  this.timeout(10000)

  let Iconv
  try { Iconv = require("iconv").Iconv } catch (_e) {}

  // The handful of characters libiconv maps differently from the WHATWG/Unicode index.
  const iconvChanges = { "〜": "～", "‖": "∥", "−": "－", "¢": "￠", "£": "￡", "¬": "￢" }

  function * candidateSeqs () {
    for (let b = 0; b < 0x100; b++) yield [b]
    for (let t = 0xa1; t <= 0xfe; t++) yield [0x8e, t]
    for (let l = 0xa1; l <= 0xfe; l++) for (let t = 0xa1; t <= 0xfe; t++) yield [l, t]
    for (let l = 0xa1; l <= 0xfe; l++) for (let t = 0xa1; t <= 0xfe; t++) yield [0x8f, l, t]
  }

  it("decodes like libiconv wherever libiconv decodes the sequence", function () {
    if (!Iconv) return this.skip()
    const conv = new Iconv("eucjp", "utf-8")
    const errors = []
    for (const seq of candidateSeqs()) {
      const buf = Buffer.from(seq)
      let expected
      try { expected = conv.convert(buf).toString("utf-8") } catch (_e) { continue } // libiconv can't: we may decode a superset, skip
      if (expected.length !== 1) continue
      const ecp = expected.charCodeAt(0)
      if (ecp >= 0xe000 && ecp < 0xf900) continue // libiconv maps to Private Use Area; WHATWG to a real char
      const actual = iconv.decode(utils.bytes(seq), "eucjp")
      if (actual === expected) continue
      if (iconvChanges[expected] === actual) continue // known WHATWG vs libiconv difference
      errors.push(seq.map((b) => b.toString(16)).join("") + ": libiconv=" + esc(expected) + " iconv-lite=" + esc(actual))
    }
    assert.strictEqual(errors.length, 0, "decode mismatches:\n" + errors.slice(0, 30).join("\n"))
  })

  it("encodes at least every character libiconv can encode (no lost coverage)", function () {
    if (!Iconv) return this.skip()
    const fwd = new Iconv("utf-8", "eucjp")
    const errors = []
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue // surrogates
      if (cp >= 0xe000 && cp < 0xf900) continue // Private Use Area: iconv/ICU disagree, skipped like dbcs.test
      const ch = String.fromCharCode(cp)
      if (iconvChanges[ch]) continue // libiconv encodes the legacy variant; iconv-lite uses the WHATWG one
      let libCanEncode = true
      try { fwd.convert(Buffer.from(ch)) } catch (_e) { libCanEncode = false } // libiconv throws EILSEQ on unencodable
      if (!libCanEncode) continue
      // libiconv can encode this char, so iconv-lite must too.
      if (utils.hex(iconv.encode(ch, "eucjp")) === "3f" && ch !== "?") {
        errors.push("U+" + cp.toString(16) + " encodable by libiconv but iconv-lite emits '?'")
      }
    }
    assert.strictEqual(errors.length, 0, "lost coverage:\n" + errors.slice(0, 30).join("\n"))
  })

  function esc (s) { return Array.from(s).map((c) => "U+" + c.codePointAt(0).toString(16)).join(",") }
})
