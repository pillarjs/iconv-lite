"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()

// WHATWG Encoding Standard indexes (vendored for the WPT runner); used as the independent reference.
const jis0208 = require("./wpt/data/whatwg-multibyte-indexes.json").jis0208

// Binary string (one char per byte) -> backend bytes (Buffer in Node, Uint8Array in the browser).
function buf (binary) {
  const arr = []
  for (let i = 0; i < binary.length; i++) { arr.push(binary.charCodeAt(i)) }
  return utils.bytes(arr)
}

// ISO-2022-JP output is 7-bit; turn the backend bytes into a binary string for readable assertions.
function enc (str) {
  return Array.prototype.map.call(iconv.encode(str, "iso-2022-jp"), (b) => String.fromCharCode(b)).join("")
}

function dec (binary) {
  return iconv.decode(buf(binary), "iso-2022-jp")
}

function decodeChunks (chunks) {
  const decoder = iconv.getDecoder("iso-2022-jp")
  let res = ""
  for (const chunk of chunks) { res += decoder.write(buf(chunk)) }
  const trail = decoder.end()
  return trail ? res + trail : res
}

function encodeChunks (strs) {
  const encoder = iconv.getEncoder("iso-2022-jp")
  const parts = strs.map((str) => encoder.write(str))
  const trail = encoder.end()
  if (trail) { parts.push(trail) }
  return Array.prototype.map.call(utils.concatBufs(parts), (b) => String.fromCharCode(b)).join("")
}

const ESC_ASCII = "\x1b(B"
const ESC_ROMAN = "\x1b(J"
const ESC_JIS0208 = "\x1b$B"

// Behavior follows the WHATWG Encoding Standard (https://encoding.spec.whatwg.org/#iso-2022-jp),
// with one deliberate difference in the encoder: it shifts back to ASCII before CR/LF (RFC 1468
// requires lines to end in ASCII), where WHATWG would stay in the Roman set.

describe("ISO-2022-JP codec #node-web", function () {
  it("is registered under its WHATWG labels", function () {
    for (const label of ["iso-2022-jp", "ISO-2022-JP", "iso2022jp", "csISO2022JP"]) {
      assert(iconv.encodingExists(label), label)
    }
  })

  it("decodes the sample from issue #60", function () {
    const bytes = Buffer.from("GyRCNElNfSQ3JD8lOyUtJWUlaiVGJSNCUDp2JEdCUDF+JE4/V0IuGyhC", "base64")
    assert.equal(iconv.decode(utils.bytes(Array.from(bytes)), "iso-2022-jp"), "管理したセキュリティ対策で対応の迅速")
  })

  it("decodes every character set", function () {
    assert.equal(dec("Hello, world!\r\n"), "Hello, world!\r\n")
    assert.equal(dec(ESC_JIS0208 + "4IM}" + ESC_ASCII), "管理") // JIS X 0208-1983.
    assert.equal(dec("\x1b$@4IM}" + ESC_ASCII), "管理") // JIS X 0208-1978, same table.
    assert.equal(dec(ESC_ROMAN + "\\~a" + ESC_ASCII + "\\~"), "¥‾a\\~") // JIS X 0201 Roman.
    assert.equal(dec("\x1b(I!_" + ESC_ASCII), "｡ﾟ") // JIS X 0201 Katakana (decode only).
    assert.equal(dec("a" + ESC_ASCII), "a") // A redundant escape after output is fine.
    assert.equal(dec(""), "")
  })

  it("decodes the whole JIS X 0208 plane like the WHATWG jis0208 index", function () {
    let input = ESC_JIS0208
    let expected = ""
    for (let pointer = 0; pointer < 94 * 94; pointer++) {
      input += String.fromCharCode(0x21 + Math.floor(pointer / 94), 0x21 + (pointer % 94))
      expected += jis0208[pointer] == null ? "�" : String.fromCodePoint(jis0208[pointer])
    }
    assert.equal(dec(input + ESC_ASCII), expected)
  })

  it("replaces ill-formed input with U+FFFD (WHATWG)", function () {
    // Bytes that are invalid in every state.
    assert.equal(dec("a\x0e\x0f\x80\xffb"), "a����b")
    assert.equal(dec("\x1b(I`" + ESC_ASCII), "�") // Outside the katakana range.

    // Two escape sequences with no output between them (a WHATWG anti-spoofing rule).
    assert.equal(dec(ESC_JIS0208 + ESC_ASCII + "a"), "�a")
    assert.equal(dec(ESC_ROMAN + "\\" + ESC_ASCII + ESC_ROMAN + "\\" + ESC_ASCII), "¥�¥")

    // Unknown escape sequences: an error, then the bytes after ESC are decoded in the current set.
    assert.equal(dec("a\x1bxb"), "a�xb")
    assert.equal(dec("a\x1b$Ab"), "a�$Ab") // ISO-2022-JP-2's GB 2312.
    assert.equal(dec("a\x1b$(Db"), "a�$(Db") // ISO-2022-JP-1's JIS X 0212.
    assert.equal(dec(ESC_JIS0208 + "4I\x1b$Ab"), "管�ち�") // "$A" re-read as a JIS pair.

    // Inside JIS X 0208.
    assert.equal(dec(ESC_JIS0208 + ")!" + ESC_ASCII), "�") // Unassigned pair.
    assert.equal(dec(ESC_JIS0208 + "4\nX"), "��") // Bad trail byte is consumed.
    assert.equal(dec(ESC_JIS0208 + "4" + ESC_ASCII + "a"), "�a") // ESC as a trail byte.
    assert.equal(dec(ESC_JIS0208 + "4I\n4I" + ESC_ASCII), "管�管") // No implicit reset at a newline.
  })

  it("replaces truncated input with U+FFFD at the end", function () {
    assert.equal(dec(ESC_JIS0208 + "4"), "�")
    assert.equal(dec("a\x1b"), "a�")
    assert.equal(dec("a\x1b$"), "a�$")
    assert.equal(dec("a\x1b("), "a�(")
    assert.equal(dec(ESC_JIS0208 + "4I\x1b$"), "管��") // "$" is re-read as a lone lead byte.
    assert.equal(dec(ESC_JIS0208 + "4I"), "管") // A missing final ESC ( B is fine.
  })

  it("decodes across streaming chunk boundaries", function () {
    assert.equal(decodeChunks(["\x1b", "$", "B4", "I\x1b(", "B"]), "管")
    assert.equal(decodeChunks([ESC_JIS0208 + "4", "IM", "}" + ESC_ASCII]), "管理")
    assert.equal(decodeChunks(["a\x1b", "x"]), "a�x")
    assert.equal(decodeChunks(["a\x1b$", "A"]), "a�$A")
    assert.equal(decodeChunks([ESC_JIS0208, ESC_ASCII, "a"]), "�a")

    // Every split point gives the same result as a one-shot decode.
    const sample = "ab" + ESC_JIS0208 + "4IM}" + ESC_ROMAN + "\\x" + "\x1b(I!_" + "\x1b$@$\"" +
      ESC_ASCII + "\x1b" + "$A" + ESC_JIS0208 + "4" + ESC_ASCII + "z\x1b$"
    const whole = dec(sample)
    for (let i = 0; i <= sample.length; i++) {
      for (let j = i; j <= sample.length; j++) {
        assert.equal(decodeChunks([sample.slice(0, i), sample.slice(i, j), sample.slice(j)]), whole, `split at ${i}, ${j}`)
      }
    }
  })

  it("encodes correctly", function () {
    assert.equal(enc(""), "")
    assert.equal(enc("Hello, world!\r\n"), "Hello, world!\r\n")
    assert.equal(enc("管理"), ESC_JIS0208 + "4IM}" + ESC_ASCII)
    assert.equal(enc("aあb"), "a" + ESC_JIS0208 + "$\"" + ESC_ASCII + "b")
    assert.equal(enc("管理したセキュリティ対策で対応の迅速"),
      ESC_JIS0208 + "4IM}$7$?%;%-%e%j%F%#BP:v$GBP1~$N?WB." + ESC_ASCII)

    // U+00A5 and U+203E use JIS X 0201 Roman; "\" and "~" switch back to ASCII.
    assert.equal(enc("¥"), ESC_ROMAN + "\\" + ESC_ASCII)
    assert.equal(enc("‾"), ESC_ROMAN + "~" + ESC_ASCII)
    assert.equal(enc("¥a\\"), ESC_ROMAN + "\\a" + ESC_ASCII + "\\")
    assert.equal(enc("¥管"), ESC_ROMAN + "\\" + ESC_JIS0208 + "4I" + ESC_ASCII)

    // U+2212 becomes U+FF0D; halfwidth katakana becomes fullwidth (WHATWG).
    assert.equal(enc("−"), enc("－"))
    assert.equal(enc("ｶﾞ｡"), enc("カ゛。"))
  })

  it("shifts back to ASCII before line breaks (RFC 1468)", function () {
    assert.equal(enc("¥\n"), ESC_ROMAN + "\\" + ESC_ASCII + "\n")
    assert.equal(enc("¥\r\n¥"), ESC_ROMAN + "\\" + ESC_ASCII + "\r\n" + ESC_ROMAN + "\\" + ESC_ASCII)
    assert.equal(enc("管\n理"), ESC_JIS0208 + "4I" + ESC_ASCII + "\n" + ESC_JIS0208 + "M}" + ESC_ASCII)
  })

  it("encodes unmappable characters as '?' in ASCII", function () {
    assert.equal(enc("a😀b"), "a?b") // A surrogate pair is one character.
    assert.equal(enc("\ud800"), "?") // Lone surrogates.
    assert.equal(enc("\udc00a"), "?a")
    assert.equal(enc("丂"), "?") // JIS X 0212 only.
    assert.equal(enc("é"), "?")
    assert.equal(enc("a\x1b\x0e\x0fb"), "a???b") // Would otherwise change the decoder's state.
    assert.equal(enc("管😀"), ESC_JIS0208 + "4I" + ESC_ASCII + "?")
    assert.equal(enc("¥é"), ESC_ROMAN + "\\" + ESC_ASCII + "?")
  })

  it("keeps encoder state across writes", function () {
    assert.equal(encodeChunks(["管", "理"]), enc("管理"))
    assert.equal(encodeChunks(["¥", "¥"]), enc("¥¥"))
    assert.equal(encodeChunks(["a\ud83d", "\ude00b"]), "a?b")
    assert.equal(encodeChunks(["a\ud83d"]), "a?")
    assert.equal(encodeChunks(["管", ""]), enc("管"))
  })

  it("encodes the JIS X 0208 plane like the WHATWG encoder", function () {
    const seen = new Set()
    for (let pointer = 0; pointer < 94 * 94; pointer++) {
      const codePoint = jis0208[pointer]
      if (codePoint == null || seen.has(codePoint)) { continue } // WHATWG uses the first pointer.
      seen.add(codePoint)
      const jis = String.fromCharCode(0x21 + Math.floor(pointer / 94), 0x21 + (pointer % 94))
      assert.equal(enc(String.fromCodePoint(codePoint)), ESC_JIS0208 + jis + ESC_ASCII, "U+" + codePoint.toString(16))
    }
  })

  it("round-trips random text", function () {
    // Deterministic pseudo-random text from ASCII, Roman and JIS X 0208 characters.
    let seed = 12345
    const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    const repertoire = ["\n", "\r", " ", "a", "Z", "\\", "~", "¥", "‾"]
    for (const codePoint of jis0208.slice(0, 94 * 94)) {
      if (codePoint != null) { repertoire.push(String.fromCodePoint(codePoint)) }
    }
    for (let round = 0; round < 200; round++) {
      let str = ""
      const length = random(40)
      for (let i = 0; i < length; i++) { str += repertoire[random(repertoire.length)] }
      const bytes = enc(str)
      for (let i = 0; i < bytes.length; i++) { assert(bytes.charCodeAt(i) < 0x80, "output must be 7-bit") }
      assert.equal(dec(bytes), str)
    }
  })
})
