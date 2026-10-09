import { expect } from "vitest"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-multibyte-indexes.json" with { type: "json" }
const iconv = utils.requireIconv()

// WHATWG Encoding Standard indexes (vendored for the WPT runner); used as the independent reference.
const jis0208 = indexes.jis0208

// Binary string (one char per byte) -> backend bytes (Buffer in Node, Uint8Array in the browser).
function buf (binary: string) {
  const arr = []
  for (let i = 0; i < binary.length; i++) { arr.push(binary.charCodeAt(i)) }
  return utils.bytes(arr)
}

// ISO-2022-JP output is 7-bit; turn the backend bytes into a binary string for readable assertions.
function enc (str: string) {
  return Array.prototype.map.call(iconv.encode(str, "iso-2022-jp"), (b: number) => String.fromCharCode(b)).join("")
}

function dec (binary: string) {
  return iconv.decode(buf(binary), "iso-2022-jp")
}

function decodeChunks (chunks: string[]) {
  const decoder = iconv.getDecoder("iso-2022-jp")
  let res = ""
  for (const chunk of chunks) { res += decoder.write(buf(chunk)) }
  const trail = decoder.end()
  return trail ? res + trail : res
}

function encodeChunks (strs: string[]) {
  const encoder = iconv.getEncoder("iso-2022-jp")
  const parts = strs.map((str) => encoder.write(str))
  const trail = encoder.end()
  if (trail) { parts.push(trail) }
  return Array.prototype.map.call(utils.concatBufs(parts), (b: number) => String.fromCharCode(b)).join("")
}

const ESC_ASCII = "\x1b(B"
const ESC_ROMAN = "\x1b(J"
const ESC_JIS0208 = "\x1b$B"

// Behavior follows the WHATWG Encoding Standard (https://encoding.spec.whatwg.org/#iso-2022-jp),
// with one deliberate difference in the encoder: it shifts back to ASCII before CR/LF (RFC 1468
// requires lines to end in ASCII), where WHATWG would stay in the Roman set.

describe("ISO-2022-JP codec", function () {
  it("is registered under its WHATWG labels", function () {
    for (const label of ["iso-2022-jp", "ISO-2022-JP", "iso2022jp", "csISO2022JP"]) {
      expect(iconv.encodingExists(label), label).toBeTruthy()
    }
  })

  it("decodes the sample from issue #60", function () {
    const bytes = buf(atob("GyRCNElNfSQ3JD8lOyUtJWUlaiVGJSNCUDp2JEdCUDF+JE4/V0IuGyhC"))
    expect(iconv.decode(bytes, "iso-2022-jp")).toBe("管理したセキュリティ対策で対応の迅速")
  })

  it("decodes every character set", function () {
    expect(dec("Hello, world!\r\n")).toBe("Hello, world!\r\n")
    expect(dec(ESC_JIS0208 + "4IM}" + ESC_ASCII)).toBe("管理") // JIS X 0208-1983.
    expect(dec("\x1b$@4IM}" + ESC_ASCII)).toBe("管理") // JIS X 0208-1978, same table.
    expect(dec(ESC_ROMAN + "\\~a" + ESC_ASCII + "\\~")).toBe("¥‾a\\~") // JIS X 0201 Roman.
    expect(dec("\x1b(I!_" + ESC_ASCII)).toBe("｡ﾟ") // JIS X 0201 Katakana (decode only).
    expect(dec("a" + ESC_ASCII)).toBe("a") // A redundant escape after output is fine.
    expect(dec("")).toBe("")
  })

  it("decodes the whole JIS X 0208 plane like the WHATWG jis0208 index", function () {
    let input = ESC_JIS0208
    let expected = ""
    for (let pointer = 0; pointer < 94 * 94; pointer++) {
      input += String.fromCharCode(0x21 + Math.floor(pointer / 94), 0x21 + (pointer % 94))
      expected += jis0208[pointer] == null ? "�" : String.fromCodePoint(jis0208[pointer]!)
    }
    expect(dec(input + ESC_ASCII)).toBe(expected)
  })

  it("replaces ill-formed input with U+FFFD (WHATWG)", function () {
    // Bytes that are invalid in every state.
    expect(dec("a\x0e\x0f\x80\xffb")).toBe("a����b")
    expect(dec("\x1b(I`" + ESC_ASCII)).toBe("�") // Outside the katakana range.

    // Two escape sequences with no output between them (a WHATWG anti-spoofing rule).
    expect(dec(ESC_JIS0208 + ESC_ASCII + "a")).toBe("�a")
    expect(dec(ESC_ROMAN + "\\" + ESC_ASCII + ESC_ROMAN + "\\" + ESC_ASCII)).toBe("¥�¥")

    // Unknown escape sequences: an error, then the bytes after ESC are decoded in the current set.
    expect(dec("a\x1bxb")).toBe("a�xb")
    expect(dec("a\x1b$Ab")).toBe("a�$Ab") // ISO-2022-JP-2's GB 2312.
    expect(dec("a\x1b$(Db")).toBe("a�$(Db") // ISO-2022-JP-1's JIS X 0212.
    expect(dec(ESC_JIS0208 + "4I\x1b$Ab")).toBe("管�ち�") // "$A" re-read as a JIS pair.

    // Inside JIS X 0208.
    expect(dec(ESC_JIS0208 + ")!" + ESC_ASCII)).toBe("�") // Unassigned pair.
    expect(dec(ESC_JIS0208 + "4\nX")).toBe("��") // Bad trail byte is consumed.
    expect(dec(ESC_JIS0208 + "4" + ESC_ASCII + "a")).toBe("�a") // ESC as a trail byte.
    expect(dec(ESC_JIS0208 + "4I\n4I" + ESC_ASCII)).toBe("管�管") // No implicit reset at a newline.
  })

  it("replaces truncated input with U+FFFD at the end", function () {
    expect(dec(ESC_JIS0208 + "4")).toBe("�")
    expect(dec("a\x1b")).toBe("a�")
    expect(dec("a\x1b$")).toBe("a�$")
    expect(dec("a\x1b(")).toBe("a�(")
    expect(dec(ESC_JIS0208 + "4I\x1b$")).toBe("管��") // "$" is re-read as a lone lead byte.
    expect(dec(ESC_JIS0208 + "4I")).toBe("管") // A missing final ESC ( B is fine.
  })

  it("decodes across streaming chunk boundaries", function () {
    expect(decodeChunks(["\x1b", "$", "B4", "I\x1b(", "B"])).toBe("管")
    expect(decodeChunks([ESC_JIS0208 + "4", "IM", "}" + ESC_ASCII])).toBe("管理")
    expect(decodeChunks(["a\x1b", "x"])).toBe("a�x")
    expect(decodeChunks(["a\x1b$", "A"])).toBe("a�$A")
    expect(decodeChunks([ESC_JIS0208, ESC_ASCII, "a"])).toBe("�a")

    // Every split point gives the same result as a one-shot decode.
    const sample = "ab" + ESC_JIS0208 + "4IM}" + ESC_ROMAN + "\\x" + "\x1b(I!_" + "\x1b$@$\"" +
      ESC_ASCII + "\x1b" + "$A" + ESC_JIS0208 + "4" + ESC_ASCII + "z\x1b$"
    const whole = dec(sample)
    for (let i = 0; i <= sample.length; i++) {
      for (let j = i; j <= sample.length; j++) {
        expect(decodeChunks([sample.slice(0, i), sample.slice(i, j), sample.slice(j)]), `split at ${i}, ${j}`).toBe(whole)
      }
    }
  })

  it("encodes correctly", function () {
    expect(enc("")).toBe("")
    expect(enc("Hello, world!\r\n")).toBe("Hello, world!\r\n")
    expect(enc("管理")).toBe(ESC_JIS0208 + "4IM}" + ESC_ASCII)
    expect(enc("aあb")).toBe("a" + ESC_JIS0208 + "$\"" + ESC_ASCII + "b")
    expect(enc("管理したセキュリティ対策で対応の迅速")).toBe(ESC_JIS0208 + "4IM}$7$?%;%-%e%j%F%#BP:v$GBP1~$N?WB." + ESC_ASCII)

    // U+00A5 and U+203E use JIS X 0201 Roman; "\" and "~" switch back to ASCII.
    expect(enc("¥")).toBe(ESC_ROMAN + "\\" + ESC_ASCII)
    expect(enc("‾")).toBe(ESC_ROMAN + "~" + ESC_ASCII)
    expect(enc("¥a\\")).toBe(ESC_ROMAN + "\\a" + ESC_ASCII + "\\")
    expect(enc("¥管")).toBe(ESC_ROMAN + "\\" + ESC_JIS0208 + "4I" + ESC_ASCII)

    // U+2212 becomes U+FF0D; halfwidth katakana becomes fullwidth (WHATWG).
    expect(enc("−")).toBe(enc("－"))
    expect(enc("ｶﾞ｡")).toBe(enc("カ゛。"))
  })

  it("shifts back to ASCII before line breaks (RFC 1468)", function () {
    expect(enc("¥\n")).toBe(ESC_ROMAN + "\\" + ESC_ASCII + "\n")
    expect(enc("¥\r\n¥")).toBe(ESC_ROMAN + "\\" + ESC_ASCII + "\r\n" + ESC_ROMAN + "\\" + ESC_ASCII)
    expect(enc("管\n理")).toBe(ESC_JIS0208 + "4I" + ESC_ASCII + "\n" + ESC_JIS0208 + "M}" + ESC_ASCII)
  })

  it("encodes unmappable characters as '?' in ASCII", function () {
    expect(enc("a😀b")).toBe("a?b") // A surrogate pair is one character.
    expect(enc("\ud800")).toBe("?") // Lone surrogates.
    expect(enc("\udc00a")).toBe("?a")
    expect(enc("丂")).toBe("?") // JIS X 0212 only.
    expect(enc("é")).toBe("?")
    expect(enc("a\x1b\x0e\x0fb")).toBe("a???b") // Would otherwise change the decoder's state.
    expect(enc("管😀")).toBe(ESC_JIS0208 + "4I" + ESC_ASCII + "?")
    expect(enc("¥é")).toBe(ESC_ROMAN + "\\" + ESC_ASCII + "?")
  })

  it("keeps encoder state across writes", function () {
    expect(encodeChunks(["管", "理"])).toBe(enc("管理"))
    expect(encodeChunks(["¥", "¥"])).toBe(enc("¥¥"))
    expect(encodeChunks(["a\ud83d", "\ude00b"])).toBe("a?b")
    expect(encodeChunks(["a\ud83d"])).toBe("a?")
    expect(encodeChunks(["管", ""])).toBe(enc("管"))
  })

  it("encodes the JIS X 0208 plane like the WHATWG encoder", function () {
    const seen = new Set()
    for (let pointer = 0; pointer < 94 * 94; pointer++) {
      const codePoint = jis0208[pointer]
      if (codePoint == null || seen.has(codePoint)) { continue } // WHATWG uses the first pointer.
      seen.add(codePoint)
      const jis = String.fromCharCode(0x21 + Math.floor(pointer / 94), 0x21 + (pointer % 94))
      expect(enc(String.fromCodePoint(codePoint)), "U+" + codePoint.toString(16)).toBe(ESC_JIS0208 + jis + ESC_ASCII)
    }
  })

  it("round-trips random text", function () {
    // Deterministic pseudo-random text from ASCII, Roman and JIS X 0208 characters.
    let seed = 12345
    const random = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    const repertoire = ["\n", "\r", " ", "a", "Z", "\\", "~", "¥", "‾"]
    for (const codePoint of jis0208.slice(0, 94 * 94)) {
      if (codePoint != null) { repertoire.push(String.fromCodePoint(codePoint)) }
    }
    for (let round = 0; round < 200; round++) {
      let str = ""
      const length = random(40)
      for (let i = 0; i < length; i++) { str += repertoire[random(repertoire.length)] }
      const bytes = enc(str)
      for (let i = 0; i < bytes.length; i++) { expect(bytes.charCodeAt(i) < 0x80, "output must be 7-bit").toBeTruthy() }
      expect(dec(bytes)).toBe(str)
    }
  })

  it.each(["", "<invalid>", "$&🙂"])("uses literal replacement text %j across chunks and at EOF", function (replacement) {
    const options = { defaultCharUnicode: replacement }
    const input = "a\x1b$A" + ESC_JIS0208 + "4I\x1b$"
    const expected = "a" + replacement + "$A管" + replacement.repeat(2)
    expect(iconv.decode(buf(input), "iso-2022-jp", options)).toBe(expected)
    for (let split = 0; split <= input.length; split++) {
      const decoder = iconv.getDecoder("iso-2022-jp", options)
      const result = decoder.write(buf(input.slice(0, split))) + decoder.write(buf("")) +
        decoder.write(buf(input.slice(split))) + (decoder.end() || "")
      expect(result, `split at ${split}`).toBe(expected)
    }
  })

  it.each([
    "\x80", "\x0e", "\x0f", "\x1bx", "\x1b$A", "\x1b(I`", ESC_JIS0208 + ")!",
    ESC_JIS0208 + "\n", ESC_JIS0208 + "4\n", ESC_JIS0208 + "4" + ESC_ASCII,
    ESC_JIS0208 + ESC_ASCII, "\x1b", "\x1b$", ESC_JIS0208 + "4"
  ])("rejects malformed input %j in fatal mode at every chunk boundary", function (input) {
    const options = { fatal: true, defaultCharUnicode: "" }
    expect(() => iconv.decode(buf(input), "iso-2022-jp", options)).toThrow(TypeError)
    for (let split = 0; split <= input.length; split++) {
      const decoder = iconv.getDecoder("iso-2022-jp", options)
      expect(() => {
        decoder.write(buf(input.slice(0, split)))
        decoder.write(buf(input.slice(split)))
        decoder.end()
      }, `split at ${split}`).toThrow(TypeError)
      expect(decoder.write(buf("ok"))).toBe("ok")
      expect(decoder.end()).toBeUndefined()
    }
  })

  it("captures replacement options per conversion", function () {
    const options = { defaultCharByte: 0x21, defaultCharUnicode: "<invalid>" }
    const encoder = iconv.getEncoder("iso-2022-jp", options)
    const decoder = iconv.getDecoder("iso-2022-jp", options)
    options.defaultCharByte = 0x23
    options.defaultCharUnicode = "changed"
    expect(utils.hex(encoder.write("管\ud83d"))).toBe("1b 24 42 34 49")
    expect(utils.hex(encoder.write(""))).toBe("")
    expect(utils.hex(encoder.write("\ude00"))).toBe("1b 28 42 21")
    expect(encoder.end()).toBeUndefined()
    expect(decoder.write(buf("\x80"))).toBe("<invalid>")
    expect(decoder.write(buf("\x1b"))).toBe("")
    expect(decoder.end()).toBe("<invalid>")
    expect(enc("😀")).toBe("?")
    expect(dec("\x80")).toBe("�")
  })

  it.each([0x0e, 0x0f, 0x1b, 0x80, 0xff, -1, 256, 1.5, NaN])("rejects replacement byte %j", function (defaultCharByte) {
    expect(() => iconv.getEncoder("iso-2022-jp", { defaultCharByte })).toThrow(TypeError)
  })

  it("supports a handler without losing state on cancellation", function () {
    const calls: [string, number][] = []
    const encoder = iconv.getEncoder("iso-2022-jp", {
      invalidCharHandler (char, index) {
        calls.push([char, index])
        return char === "😀" ? true : "理"
      }
    })
    const head = encoder.write("管")
    expect(encoder.write("x\ud83d")).not.toBeNull()
    expect(encoder.write("\ude00理")).toBeNull()
    const tail = encoder.write("é")
    // The successful ASCII write ended JIS mode; the cancelled write must not change it.
    expect(utils.hex(tail)).toBe("1b 24 42 4d 7d")
    expect(calls).toEqual([["😀", 1], ["é", 0]])
    expect(utils.hex(head)).toBe("1b 24 42 34 49")
    expect(utils.hex(encoder.end())).toBe("1b 28 42")
    expect(encoder.end()).toBeUndefined()
  })

  it("validates handler replacements and uses one fallback per code point", function () {
    const options = { defaultCharByte: 0x21, invalidCharHandler: () => false }
    const encoder = iconv.getEncoder("iso-2022-jp", options)
    expect(utils.hex(encoder.write("\ud83d"))).toBe("")
    expect(utils.hex(encoder.write("\ude00"))).toBe("21")
    expect(utils.hex(encoder.write("\ud800"))).toBe("")
    expect(utils.hex(encoder.end())).toBe("21")
    expect(iconv.encode("é", "iso-2022-jp", { invalidCharHandler: () => true })).toBeNull()
    expect(utils.hex(iconv.encode("é", "iso-2022-jp", { invalidCharHandler: () => "" }))).toBe("")
    expect(() => iconv.encode("é", "iso-2022-jp", { invalidCharHandler: () => "\x1b" })).toThrow(TypeError)
    expect(utils.hex(iconv.encode("é", "iso-2022-jp", { invalidCharHandler: () => "ｶﾞ" }))).toBe(utils.hex(iconv.encode("カ゛", "iso-2022-jp")))
  })
})
