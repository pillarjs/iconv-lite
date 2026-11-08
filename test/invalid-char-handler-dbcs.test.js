import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

describe("invalidCharHandler (DBCS)", function () {
  let iconv
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  for (const encoding of ["shiftjis", "gbk", "big5", "eucjp", "euckr"]) {
    it(`${encoding} replaces, skips and reports original character positions`, function () {
      const calls = []
      const result = iconv.encode("A🙂B🙂C", encoding, {
        invalidCharHandler (char, index) {
          calls.push([char, index])
          return index === 1 ? ":)".repeat(100) : ""
        }
      })
      expect(result).toStrictEqual(iconv.encode("A" + ":)".repeat(100) + "BC", encoding))
      expect(calls).toStrictEqual([["🙂", 1], ["🙂", 3]])
    })

    it(`${encoding} retains default bytes when the handler returns nothing`, function () {
      const input = "A🙂世\uD800B\uDC00"
      expect(iconv.encode(input, encoding, { invalidCharHandler () {} })).toStrictEqual(iconv.encode(input, encoding))
    })
  }

  it("does not report GB18030 characters that use the algorithmic mapping", function () {
    const input = "A🙂\uFFFD\u{10FFFF}"
    expect(iconv.encode(input, "gb18030", {
      invalidCharHandler () { throw new Error("representable character") }
    })).toStrictEqual(iconv.encode(input, "gb18030"))
  })

  it("preserves Big5 sequences split across writes", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler () { throw new Error("valid sequence") } })
    const chunks = [encoder.write("AÊ"), encoder.write(""), encoder.write("\u0304B")]
    expect(encoder.end()).toBe(undefined)
    expect(utils.concatBufs(chunks)).toStrictEqual(iconv.encode("AÊ\u0304B", "big5"))
  })

  it("lets a replacement finish a pending Big5 sequence", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => "\u0304" })
    const chunks = [encoder.write("AÊ"), encoder.write("🙂B")]
    expect(encoder.end()).toBe(undefined)
    expect(utils.concatBufs(chunks)).toStrictEqual(iconv.encode("AÊ\u0304B", "big5"))
    expect(iconv.encode("A🙂B", "big5", { invalidCharHandler: () => "Ê\u0304" })).toStrictEqual(iconv.encode("AÊ\u0304B", "big5"))
  })

  it("flushes pending sequences and replaces a final unpaired surrogate", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => "!" })
    const chunks = [encoder.write("AÊ\uD800"), encoder.end()]
    expect(utils.concatBufs(chunks)).toStrictEqual(iconv.encode("AÊ!", "big5"))
    expect(encoder.end()).toBe(undefined)
  })

  it("rejects unencodable replacements without invoking the handler again", function () {
    let calls = 0
    expect(() => iconv.encode("🙂", "shiftjis", {
      invalidCharHandler () { calls++; return "🙂" }
    })).toThrowError(/Replacement .* cannot be encoded/)
    expect(calls).toBe(1)
  })

  it("cancels a write and clears its pending sequence before reuse", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => true })
    expect(encoder.write("Ê").length).toBe(0)
    expect(encoder.write("🙂discarded")).toBe(null)
    expect(encoder.write("B")).toStrictEqual(iconv.encode("B", "big5"))
    expect(encoder.end()).toBe(undefined)
    expect(iconv.encode("A\uD800", "big5", { invalidCharHandler: () => true })).toBe(null)
  })

  it("reports a split supplementary character once at its original position", function () {
    const calls = []
    const encoder = iconv.getEncoder("shiftjis", {
      invalidCharHandler (char, index) { calls.push([char, index]); return "!" }
    })
    const chunks = [encoder.write("A\uD83D"), encoder.write("\uDE42B")]
    expect(utils.concatBufs(chunks)).toStrictEqual(utils.bytes([0x41, 0x21, 0x42]))
    expect(calls).toStrictEqual([["🙂", 1]])
  })
})
