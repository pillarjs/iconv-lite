import { expect } from "vitest"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-multibyte-indexes.json" with { type: "json" }

const iconv = utils.requireIconv()

describe("EUC-JP derived indexes", function () {
  for (const [name, index, prefix] of [["JIS X 0208", indexes.jis0208, []], ["JIS X 0212", indexes.jis0212, [0x8F]]] as const) {
    it(`decodes every ${name} cell against the vendored WHATWG index`, function () {
      const bytes = []
      let expected = ""
      for (let pointer = 0; pointer < 94 * 94; pointer++) {
        bytes.push(...prefix, 0xA1 + Math.floor(pointer / 94), 0xA1 + pointer % 94)
        expected += index[pointer] == null ? "\uFFFD" : String.fromCodePoint(index[pointer]!)
      }
      expect(iconv.decode(utils.bytes(bytes), "eucjp")).toBe(expected)
      const decoder = iconv.getDecoder("eucjp")
      let actual = ""
      // Boundaries move across both two- and three-byte sequences.
      for (let offset = 0; offset < bytes.length; offset += 127) actual += decoder.write(utils.bytes(bytes.slice(offset, offset + 127)))
      actual += decoder.end() || ""
      expect(actual).toBe(expected)
    })
  }

  it("uses two-byte mappings for duplicates while retaining JIS X 0212-only characters", function () {
    const text = "\uFF5E\u2116\u02D8"
    const expected = utils.bytes("a1 c1 ad e2 8f a2 af")
    expect(iconv.encode(text, "eucjp")).toStrictEqual(expected)
    expect(iconv.decode(expected, "eucjp")).toBe(text)
    // Old three-byte spellings remain valid when decoding.
    expect(iconv.decode(utils.bytes("8f a2 b7 8f a2 f1"), "eucjp")).toBe("\uFF5E\u2116")
    const encoder = iconv.getEncoder("eucjp")
    expect(encoder.write(text.slice(0, 1))).toStrictEqual(utils.bytes("a1 c1"))
    expect(encoder.write(text.slice(1))).toStrictEqual(utils.bytes("ad e2 8f a2 af"))
    expect(encoder.end()).toBeUndefined()
  })

  it("applies WHATWG encoder substitutions without invoking the invalid-character handler", function () {
    const text = "\u00A5\u203E\u2212\uFF0D"
    const expected = utils.bytes("5c 7e a1 dd a1 dd")
    const options = { invalidCharHandler () { throw new Error("Representable character rejected") } }
    expect(iconv.encode(text, "eucjp", options)).toStrictEqual(expected)
    expect(iconv.decode(expected, "eucjp")).toBe("\\~\uFF0D\uFF0D")
    for (let split = 0; split <= text.length; split++) {
      const encoder = iconv.getEncoder("eucjp", options)
      const chunks = [encoder.write(text.slice(0, split)), encoder.write(""), encoder.write(text.slice(split))]
      expect(utils.bytes(chunks.flatMap(chunk => Array.from(chunk!)))).toStrictEqual(expected)
      expect(encoder.end()).toBeUndefined()
    }
    // WAVE DASH has no WHATWG substitution to FULLWIDTH TILDE.
    expect(iconv.encode("\u301C", "eucjp")).toStrictEqual(utils.bytes("3f"))
  })

  it("prefers the first JIS X 0208 pointer for every overlapping character in the WPT indexes", function () {
    const jis0212 = new Set(indexes.jis0212)
    const checked = new Set<number>()
    for (let pointer = 0; pointer < 94 * 94; pointer++) {
      const code = indexes.jis0208[pointer]
      if (code == null || !jis0212.has(code) || checked.has(code)) continue
      checked.add(code)
      const expected = utils.bytes([0xA1 + Math.floor(pointer / 94), 0xA1 + pointer % 94])
      expect(iconv.encode(String.fromCodePoint(code), "eucjp"), `U+${code.toString(16)}`).toStrictEqual(expected)
    }
    expect(checked.size).toBe(281)
  })

  it("prefers JIS X 0208 with JIS X 0212 fallback for every BMP character", function () {
    const expected = new Map<number, number[]>()
    for (let code = 0; code < 128; code++) expected.set(code, [code])
    for (let code = 0xFF61; code <= 0xFF9F; code++) expected.set(code, [0x8E, 0xA1 + code - 0xFF61])
    for (const [index, prefix] of [[indexes.jis0208, []], [indexes.jis0212, [0x8F]]] as const) {
      for (let pointer = 0; pointer < 94 * 94; pointer++) {
        const code = index[pointer]
        if (code != null && !expected.has(code)) expected.set(code, [...prefix, 0xA1 + Math.floor(pointer / 94), 0xA1 + pointer % 94])
      }
    }
    expected.set(0xA5, [0x5C])
    expected.set(0x203E, [0x7E])
    expected.set(0x2212, [0xA1, 0xDD])
    let text = ""
    const bytes = []
    for (let code = 0; code <= 0xFFFF; code++) {
      // Separate surrogates so each malformed code unit is one replacement.
      text += String.fromCharCode(code) + " "
      bytes.push(...(expected.get(code) || [0x3F]), 0x20)
    }
    expect(iconv.encode(text, "eucjp")).toStrictEqual(utils.bytes(bytes))
  })

  it("rejects ICU-only mappings and C1 bytes, including custom replacements and fatal mode", function () {
    for (const bytes of [[0x80], [0x85], [0x9F], [0x8F, 0xF3, 0xA1], [0x8F, 0xF3, 0xB4], [0x8F, 0xF3, 0xB7]]) {
      expect(iconv.decode(utils.bytes(bytes), "eucjp")).toBe("\uFFFD")
      expect(iconv.decode(utils.bytes(bytes), "eucjp", { defaultCharUnicode: "[invalid]" })).toBe("[invalid]")
      expect(() => iconv.decode(utils.bytes(bytes), "eucjp", { fatal: true })).toThrow(TypeError)
    }
  })

  it("copies unread bytes after fatal errors when the caller reuses its buffer", function () {
    const decoder = iconv.getDecoder("eucjp", { fatal: true })
    const bytes = utils.bytes([0xA4, 0xA4, 0xA1, 0x22, 0xA4, 0xA2])
    expect(() => decoder.write(bytes)).toThrow(TypeError)
    bytes.fill(0)
    expect(decoder.write(utils.bytes([]))).toBe("\"あ")
    expect(decoder.end()).toBe("")
  })

  it("handles JIS X 0208 pairs around other planes, invalid input and chunk boundaries", function () {
    for (const [hex, expected] of [
      ["a4 a2 8f a2 af a4 a4", "あ˘い"],
      ["a4 a2 8e b6 a4 a4", "あｶい"],
      ["a4 a2 a1 22 a4 a4", "あ[invalid]\"い"],
      ["a4 a2 a9 a1 a4 a4", "あ[invalid]い"],
      ["a4 a2 a4", "あ[invalid]"]
    ]) {
      const bytes = utils.bytes(hex)
      for (let split = 0; split <= bytes.length; split++) {
        const decoder = iconv.getDecoder("eucjp", { defaultCharUnicode: "[invalid]" })
        const actual = decoder.write(bytes.subarray(0, split)) + decoder.write(bytes.subarray(split)) + (decoder.end() || "")
        expect(actual, `${hex}, split ${split}`).toBe(expected)
      }
    }
  })

  it("replaces surrogate pairs once and preserves pending surrogates across empty writes", function () {
    for (const [text, expected] of [
      ["\uD800\uD801\uDC00", "!!"],
      ["\uDC00\uD800あ\uDFFF", "!!あ!"],
      ["\uD800\uDC00\uD800", "!!"],
      ["\uD800˘\uDC00", "!˘!"],
      ["\uD800\uDC00日本", "!日本"]
    ]) {
      for (const invalidCharHandler of [undefined, () => undefined]) {
        for (let split = 0; split <= text.length; split++) {
          const encoder = iconv.getEncoder("eucjp", { defaultCharByte: 0x21, invalidCharHandler })
          const actual = utils.concatBufs([
            encoder.write(text.slice(0, split)), encoder.write(""), encoder.write(text.slice(split)),
            encoder.end() || utils.bytes([])
          ])
          expect(actual).toStrictEqual(iconv.encode(expected, "eucjp"))
        }
      }
    }
  })
})
