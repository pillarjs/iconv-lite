"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()
const hex = utils.hex

const testStr = "1a\u044F\u4E2D\u6587\u2603\uD83D\uDCA9"
const testStr2 = "\u275DStray high \uD977\uD83D\uDE31 and low\uDDDD\u2614 surrogate values.\u275E"
// Strict UTF-32: the lone surrogates (U+D977 high, U+DDDD low) can't be represented and become U+FFFD;
// the valid pair (\uD83D\uDE31) survives.
const testStr2Fixed = testStr2.replace("\uD977", "\uFFFD").replace("\uDDDD", "\uFFFD")
const utf32leBuf = utils.bytes("31 00 00 00 61 00 00 00 4f 04 00 00 2d 4e 00 00 87 65 00 00 03 26 00 00 a9 f4 01 00")
const utf32beBuf = utils.bytes("00 00 00 31 00 00 00 61 00 00 04 4f 00 00 4e 2d 00 00 65 87 00 00 26 03 00 01 f4 a9")
const utf32leBufWithBOM = utils.concatBufs([utils.bytes("ff fe 00 00"), utf32leBuf])
const utf32beBufWithBOM = utils.concatBufs([utils.bytes("00 00 fe ff"), utf32beBuf])
// 0x12345678 is above the U+10FFFF maximum -> ill-formed.
const utf32leBufWithInvalidChar = utils.concatBufs([utf32leBuf, utils.bytes("12 34 56 78")])
const utf32beBufWithInvalidChar = utils.concatBufs([utf32beBuf, utils.bytes("12 34 56 78")])
const sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<\u4FC4\u8BED>\u0434\u0430\u043D\u043D\u044B\u0435</\u4FC4\u8BED>"

describe("UTF-32LE codec #node-web", function () {
  it("encodes basic strings correctly", function () {
    assert.equal(hex(iconv.encode(testStr, "UTF32-LE")), hex(utf32leBuf))
  })

  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf32leBuf, "ucs4le"), testStr)
  })

  it("decodes an empty buffer to an empty string", function () {
    assert.equal(iconv.decode(utils.bytes([]), "utf-32le"), "")
  })

  it("emits U+FFFD for a trailing incomplete code unit", function () {
    assert.equal(iconv.decode(utils.bytes("61 00 00 00 00"), "UTF32-LE"), "a\uFFFD")
  })

  it("replaces a surrogate code point with U+FFFD when decoding", function () {
    // 0x0000D800 is a (high) surrogate code point: invalid in UTF-32.
    assert.equal(iconv.decode(utils.bytes("00 d8 00 00"), "utf-32le"), "\uFFFD")
  })

  it("replaces an out-of-range code point with U+FFFD when decoding", function () {
    assert.equal(iconv.decode(utf32leBufWithInvalidChar, "utf-32le"), testStr + "\uFFFD")
    // A code point with the high bit set (0x80000000) is far above U+10FFFF.
    assert.equal(iconv.decode(utils.bytes("00 00 00 80"), "utf-32le"), "\uFFFD")
  })

  it("validates the Unicode scalar-value boundaries (D76)", function () {
    // Valid scalar values: 0..D7FF and E000..10FFFF.
    assert.equal(iconv.decode(utils.bytes("ff d7 00 00"), "utf-32le"), "\uD7FF") // last before surrogates
    assert.equal(iconv.decode(utils.bytes("00 e0 00 00"), "utf-32le"), "\uE000") // first after surrogates
    assert.equal(iconv.decode(utils.bytes("ff ff 10 00"), "utf-32le"), "\uDBFF\uDFFF") // U+10FFFF, the maximum
    // Not scalar values: surrogate code points (D800..DFFF) and anything above U+10FFFF.
    assert.equal(iconv.decode(utils.bytes("ff df 00 00"), "utf-32le"), "\uFFFD") // U+DFFF, last surrogate
    assert.equal(iconv.decode(utils.bytes("00 00 11 00"), "utf-32le"), "\uFFFD") // U+110000, just past the maximum
  })

  it("replaces lone surrogates with U+FFFD when encoding", function () {
    assert.equal(escape(iconv.decode(iconv.encode(testStr2, "UTF32-LE"), "UTF32-LE")), escape(testStr2Fixed))
  })

  it("replaces a trailing unpaired high surrogate with U+FFFD", function () {
    // 'a' is written, the lone high surrogate is held, then end() flushes it as U+FFFD.
    assert.equal(hex(iconv.encode("a\uD800", "UTF32-LE")), hex(utils.bytes("61 00 00 00 fd ff 00 00")))
  })

  it("throws on ill-formed input in fatal mode", function () {
    assert.throws(function () { iconv.decode(utils.bytes("00 d8 00 00"), "utf-32le", { fatal: true }) })
    assert.throws(function () { iconv.decode(utils.bytes("61 00 00"), "utf-32le", { fatal: true }) }) // truncated
  })

  it("decodes a code point split across chunk boundaries", utils.checkDecoderChunks("utf-32le", [
    { inputs: ["61", "00 00", "00 62 00 00 00"], outputs: ["", "", "ab"] }
  ]))

  it("decodes correctly when split at every byte boundary", function () {
    for (let at = 1; at < utf32leBuf.length; at++) {
      const decoder = iconv.getDecoder("utf-32le")
      const res = decoder.write(utf32leBuf.slice(0, at)) + decoder.write(utf32leBuf.slice(at)) + (decoder.end() || "")
      assert.equal(res, testStr, "split at byte " + at)
    }
  })

  it("decodes both 4-byte-aligned and unaligned input", function () {
    // The fast path views aligned input as a Uint32Array; unaligned input falls back to byte reads.
    const ab = new ArrayBuffer(utf32leBuf.length + 4)
    const aligned = new Uint8Array(ab, 0, utf32leBuf.length)
    aligned.set(utf32leBuf)
    const unaligned = new Uint8Array(ab.slice(0), 2, utf32leBuf.length) // byteOffset 2 -> not 4-aligned
    unaligned.set(utf32leBuf)
    assert.equal(iconv.decode(aligned, "utf-32le"), testStr)
    assert.equal(iconv.decode(unaligned, "utf-32le"), testStr)
  })
})

describe("UTF-32BE codec #node-web", function () {
  it("encodes basic strings correctly", function () {
    assert.equal(hex(iconv.encode(testStr, "UTF32-BE")), hex(utf32beBuf))
  })

  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf32beBuf, "ucs4be"), testStr)
  })

  it("emits U+FFFD for a trailing incomplete code unit", function () {
    assert.equal(iconv.decode(utils.bytes("00 00 00 61 00"), "UTF32-BE"), "a\uFFFD")
  })

  it("replaces a surrogate code point with U+FFFD when decoding", function () {
    assert.equal(iconv.decode(utils.bytes("00 00 d8 00"), "utf-32be"), "\uFFFD")
  })

  it("replaces an out-of-range code point with U+FFFD when decoding", function () {
    assert.equal(iconv.decode(utf32beBufWithInvalidChar, "utf-32be"), testStr + "\uFFFD")
  })

  it("replaces lone surrogates with U+FFFD when encoding", function () {
    assert.equal(escape(iconv.decode(iconv.encode(testStr2, "UTF32-BE"), "UTF32-BE")), escape(testStr2Fixed))
  })

  it("replaces a trailing unpaired high surrogate with U+FFFD", function () {
    assert.equal(hex(iconv.encode("a\uD800", "UTF32-BE")), hex(utils.bytes("00 00 00 61 00 00 ff fd")))
  })

  it("decodes a code point split across chunk boundaries", utils.checkDecoderChunks("utf-32be", [
    { inputs: ["00 00", "00 61 00 00 00 62"], outputs: ["", "ab"] }
  ]))

  it("decodes correctly when split at every byte boundary", function () {
    for (let at = 1; at < utf32beBuf.length; at++) {
      const decoder = iconv.getDecoder("utf-32be")
      const res = decoder.write(utf32beBuf.slice(0, at)) + decoder.write(utf32beBuf.slice(at)) + (decoder.end() || "")
      assert.equal(res, testStr, "split at byte " + at)
    }
  })
})

describe("UTF-32 general codec #node-web", function () {
  it("matches the example from The Unicode Standard, Section 3.9", function () {
    // The standard's encoding-forms example: U+004D U+0430 U+4E8C U+10302. Per definition D90, each
    // scalar value maps to a 32-bit code unit with the same numeric value.
    const example = "M\u0430\u4E8C\uD800\uDF02"
    assert.equal(hex(iconv.encode(example, "utf-32le")), hex(utils.bytes("4d 00 00 00 30 04 00 00 8c 4e 00 00 02 03 01 00")))
    assert.equal(hex(iconv.encode(example, "utf-32be")), hex(utils.bytes("00 00 00 4d 00 00 04 30 00 00 4e 8c 00 01 03 02")))
    assert.equal(iconv.decode(utils.bytes("4d 00 00 00 30 04 00 00 8c 4e 00 00 02 03 01 00"), "utf-32le"), example)
    assert.equal(iconv.decode(utils.bytes("00 00 00 4d 00 00 04 30 00 00 4e 8c 00 01 03 02"), "utf-32be"), example)
  })

  it("uses the Section 3.10 byte order mark signatures", function () {
    // The BOM (U+FEFF) serializes to FF FE 00 00 (LE) and 00 00 FE FF (BE).
    assert.equal(hex(iconv.encode("\uFEFF", "utf-32le")), hex(utils.bytes("ff fe 00 00")))
    assert.equal(hex(iconv.encode("\uFEFF", "utf-32be")), hex(utils.bytes("00 00 fe ff")))
  })

  it("treats a non-leading U+FEFF as content (ZERO WIDTH NO-BREAK SPACE)", function () {
    // Only a leading BOM is a signature (stripped by default); elsewhere U+FEFF is kept.
    assert.equal(iconv.decode(utils.bytes("ff fe 00 00 41 00 00 00"), "utf-32le"), "A")
    assert.equal(iconv.decode(utils.bytes("41 00 00 00 ff fe 00 00"), "utf-32le"), "A\uFEFF")
  })

  it("adds a BOM when encoding, defaulting to UTF-32LE", function () {
    assert.equal(hex(iconv.encode(testStr, "utf-32")), hex(utf32leBufWithBOM))
  })

  it("doesn't add a BOM and uses UTF-32BE when specified", function () {
    assert.equal(hex(iconv.encode(testStr, "ucs4", { addBOM: false, defaultEncoding: "ucs4be" })), hex(utf32beBuf))
  })

  it("decodes UTF-32LE using the BOM", function () {
    assert.equal(iconv.decode(utf32leBufWithBOM, "utf-32"), testStr)
  })

  it("decodes UTF-32LE without a BOM (heuristic)", function () {
    assert.equal(iconv.decode(iconv.encode(sampleStr, "utf-32-le"), "utf-32"), sampleStr)
  })

  it("decodes UTF-32BE using the BOM (keeping it with stripBOM: false)", function () {
    assert.equal(iconv.decode(utf32beBufWithBOM, "utf-32", { stripBOM: false }), "\uFEFF" + testStr)
  })

  it("decodes UTF-32BE without a BOM (heuristic)", function () {
    assert.equal(iconv.decode(iconv.encode(sampleStr, "utf-32-be"), "utf-32"), sampleStr)
  })

  it("decodes short input, deciding endianness only at end()", function () {
    // 8 bytes is below the 32-byte detection threshold, so the codec is chosen only at end().
    assert.equal(iconv.decode(iconv.encode("1a", "utf-32le"), "utf-32"), "1a")
  })

  it("flushes a trailing incomplete code unit as U+FFFD when deciding at end()", function () {
    // 5 bytes (< 32): decided at end(), and the chosen decoder's end() yields the trailing U+FFFD.
    assert.equal(iconv.decode(utils.bytes("31 00 00 00 00"), "utf-32"), "1\uFFFD")
  })

  it("decodes across multiple chunks once endianness is decided", function () {
    const encoded = iconv.encode(sampleStr, "utf-32le")
    const decoder = iconv.getDecoder("utf-32")
    let res = decoder.write(encoded.slice(0, 40)) // >= 32 bytes: chooses + decodes
    res += decoder.write(encoded.slice(40)) // already chosen: decodes directly
    res += decoder.end() || ""
    assert.equal(res, sampleStr)
  })

  it("falls back to UTF-32LE for ambiguous (all-zero) input", function () {
    assert.equal(iconv.decode(utils.bytes(new Array(32).fill(0)), "utf-32"), "\0\0\0\0\0\0\0\0")
  })

  it("detects endianness from a long heuristic sample (> 100 code units)", function () {
    const longStr = "a".repeat(150)
    assert.equal(iconv.decode(iconv.encode(longStr, "utf-32le"), "utf-32"), longStr)
  })
})

// Node-only: cross-validate every valid code point against the reference C++ iconv when available.
// Not tagged #node-web (uses Buffer + the optional `iconv` binding), which the web/webpack build maps
// to an empty module, so these are skipped there.
describe("UTF-32 full code point round-trip", function () {
  let Iconv
  try { Iconv = require("iconv").Iconv } catch (_e) {}

  let cache
  function buildAll () {
    if (cache) { return cache }
    const Buffer = require("buffer").Buffer
    let str = ""
    const leBuf = Buffer.alloc(0x10F800 * 4)
    const beBuf = Buffer.alloc(0x10F800 * 4)
    let skip = 0
    for (let i = 0; i <= 0x10F7FF; i++) {
      if (i === 0xD800) { skip = 0x800 } // Jump over the surrogate range (not valid scalar values).
      const cp = i + skip
      str += String.fromCodePoint(cp)
      leBuf.writeUInt32LE(cp, i * 4)
      beBuf.writeUInt32BE(cp, i * 4)
    }
    cache = { str, leBuf, beBuf }
    return cache
  }

  it("handles encoding all valid code points (LE)", function () {
    if (!Iconv) { this.skip() }
    const { str, leBuf } = buildAll()
    assert.deepEqual(iconv.encode(str, "utf-32le"), leBuf)
    assert.deepEqual(new Iconv("UTF-8", "UTF-32LE").convert(str), leBuf)
  })

  it("handles decoding all valid code points (LE)", function () {
    if (!Iconv) { this.skip() }
    const { str, leBuf } = buildAll()
    assert.equal(iconv.decode(leBuf, "utf-32le"), str)
    assert.equal(new Iconv("UTF-32LE", "UTF-8").convert(leBuf).toString("utf8"), str)
  })

  it("handles encoding all valid code points (BE)", function () {
    if (!Iconv) { this.skip() }
    const { str, beBuf } = buildAll()
    assert.deepEqual(iconv.encode(str, "utf-32be"), beBuf)
    assert.deepEqual(new Iconv("UTF-8", "UTF-32BE").convert(str), beBuf)
  })

  it("handles decoding all valid code points (BE)", function () {
    if (!Iconv) { this.skip() }
    const { str, beBuf } = buildAll()
    assert.equal(iconv.decode(beBuf, "utf-32be"), str)
    assert.equal(new Iconv("UTF-32BE", "UTF-8").convert(beBuf).toString("utf8"), str)
  })
})

// Renders a string as \uXXXX escapes so surrogate mismatches are readable in assertion output.
function escape (s) {
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 32 && code < 127 && code !== 0x5C) {
      out += s.charAt(i)
    } else {
      out += "\\u" + ("000" + code.toString(16).toUpperCase()).slice(-4)
    }
  }
  return out
}
