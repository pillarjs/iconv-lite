import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

describe("invalidCharHandler (Unicode and binary)", function () {
  let iconv: Iconv<Uint8Array<ArrayBufferLike>>
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  for (const encoding of ["hex", "base64"]) {
    it(`${encoding} explicitly rejects the handler option`, function () {
      expect(() => iconv.getEncoder(encoding, { invalidCharHandler: () => "" })).toThrowError(expect.objectContaining({
        name: "TypeError", message: "invalidCharHandler is not supported for " + encoding
      }))
      const input = encoding === "hex" ? "4142" : "QUI="
      expect(iconv.encode(input, encoding, { invalidCharHandler: undefined })).toStrictEqual(iconv.encode(input, encoding))
    })
  }

  it("rejects non-function handlers instead of silently disabling validation", function () {
    for (const encoding of ["latin1", "shiftjis", "utf8", "utf16le", "utf32", "utf7", "cesu8", "binary"]) {
      expect(() => iconv.encode("test", encoding, { invalidCharHandler: true as never })).toThrowError(expect.objectContaining({
        name: "TypeError", message: "invalidCharHandler must be a function"
      }))
    }
  })

  for (const encoding of ["utf8", "utf32le", "utf32be", "utf32"]) {
    it(`${encoding} reports malformed input and replaces it at original positions`, function () {
      const calls: unknown[] = []
      const result = iconv.encode("A\uDC00🙂\uD800B\uD800", encoding, {
        invalidCharHandler (char: string, index: number) {
          calls.push([char, index])
          return index === 1 ? "replacement🙂" : ""
        }
      })
      expect(result).toStrictEqual(iconv.encode("Areplacement🙂🙂B", encoding))
      expect(calls).toStrictEqual([["\uDC00", 1], ["\uD800", 3], ["\uD800", 5]])
    })

    it(`${encoding} retains native fallback output and all valid scalar values`, function () {
      const input = "A\uD800B\uDC00🙂\uFFFD\u{10FFFF}\uD800"
      expect(iconv.encode(input, encoding, { invalidCharHandler () {} })).toStrictEqual(iconv.encode(input, encoding))
      expect(iconv.encode("🙂\uFFFD\u{10FFFF}", encoding, {
        invalidCharHandler () { throw new Error("valid scalar") }
      })).toStrictEqual(iconv.encode("🙂\uFFFD\u{10FFFF}", encoding))
    })

    it(`${encoding} preserves split pairs without invoking the handler`, function () {
      const encoder = iconv.getEncoder(encoding, { invalidCharHandler () { throw new Error("split pair") } })
      const chunks = [encoder.write("A\uD83D"), encoder.write(""), encoder.write("\uDE42B")]
      const tail = encoder.end()
      if (tail) chunks.push(tail)
      expect(utils.concatBufs(chunks)).toStrictEqual(iconv.encode("A🙂B", encoding))
    })

    it(`${encoding} can cancel at write or end, and rejects malformed replacements`, function () {
      expect(iconv.encode("A\uDC00B", encoding, { invalidCharHandler: () => true })).toBe(null)
      expect(iconv.encode("A\uD800", encoding, { invalidCharHandler: () => true })).toBe(null)
      let calls = 0
      expect(() => iconv.encode("\uD800", encoding, {
        invalidCharHandler () { calls++; return "\uD800" }
      })).toThrowError(/Replacement .* cannot be encoded/)
      expect(calls).toBe(1)
      const error = new Error("Invalid scalar")
      let caught: unknown
      try {
        iconv.encode("\uD800", encoding, { invalidCharHandler () { throw error } })
      } catch (err) {
        caught = err
      }
      expect(caught).toBe(error)
    })

    it(`${encoding} leaves no stale surrogate after cancelling a final character`, function () {
      let calls = 0
      const encoder = iconv.getEncoder(encoding, { invalidCharHandler () { return ++calls === 2 } })
      expect(encoder.write("\uD800\uD800")).toStrictEqual(iconv.encode("\uFFFD", encoding))
      expect(encoder.end()).toBe(null)
      expect(encoder.write("A")).toStrictEqual(iconv.encode("A", encoding, { addBOM: false }))
      const tail = encoder.end()
      expect(!tail || tail.length === 0).toBeTruthy()
      expect(calls).toBe(2)
    })

    it(`${encoding} excludes BOM from positions and preserves it after cancellation`, function () {
      const calls: unknown[] = []
      const options = Object.freeze({
        addBOM: true,
        invalidCharHandler (char: string, index: number) { calls.push([char, index]); return true }
      })
      const encoder = iconv.getEncoder(encoding, options)
      expect(encoder.write("\uDC00")).toBe(null)
      expect(encoder.write("A")).toStrictEqual(iconv.encode("A", encoding, { addBOM: true }))
      const tail = encoder.end()
      expect(!tail || tail.length === 0).toBeTruthy()
      expect(calls).toStrictEqual([["\uDC00", 0]])
      expect(iconv.encode("\uD800", encoding, options)).toBe(null)
      expect(calls[1]).toStrictEqual(["\uD800", 0])
    })
  }

  it("applies replacements to binary instead of truncating unrepresentable characters", function () {
    const calls: unknown[] = []
    const result = iconv.encode("ÿ世🙂", "binary", {
      invalidCharHandler (char: string, index: number) { calls.push([char, index]); return index === 1 ? "!!" : "" }
    })
    expect(Array.from(result!)).toStrictEqual([0xFF, 0x21, 0x21])
    expect(calls).toStrictEqual([["世", 1], ["🙂", 2]])
    expect(iconv.encode("世🙂", "binary", { invalidCharHandler () {} })).toStrictEqual(iconv.encode("世🙂", "binary"))
    expect(() => iconv.encode("世", "binary", { invalidCharHandler: () => "🙂" })).toThrowError(/Replacement .* cannot be encoded/)
  })

  for (const encoding of ["utf16le", "utf16be", "utf16", "cesu8", "utf7", "utf7imap"]) {
    it(`${encoding} retains its lossless UTF-16 code-unit behavior`, function () {
      const input = "A🙂\uD800B\uDC00"
      expect(iconv.encode(input, encoding, {
        invalidCharHandler () { throw new Error("These code units are preserved by this codec") }
      })).toStrictEqual(iconv.encode(input, encoding))
    })
  }
})
