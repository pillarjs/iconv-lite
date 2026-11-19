import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
const ascii = String.fromCharCode(...Array.from({ length: 128 }, (_, code) => code))

describe("DBCS ASCII blocks", function () {
  for (const encoding of ["gbk", "gb18030", "cp936", "shiftjis", "eucjp", "cp949", "big5", "cp950"]) {
    it(`${encoding} preserves ASCII controls and offset byte views around the fast-path threshold`, function () {
      for (const length of [63, 64, 65, 127, 128, 129, 1024]) {
        const text = ascii.repeat(8).slice(0, length)
        const expected = utils.bytes(Array.from(text, char => char.charCodeAt(0)))
        const encoded = iconv.encode(text, encoding)
        expect(encoded.constructor).toBe(utils.BytesType)
        expect(encoded).toStrictEqual(expected)
        const padded = new Uint8Array(length + 6).fill(0xFF)
        padded.set(expected, 3)
        for (const fatal of [false, true]) {
          expect(iconv.decode(padded.subarray(3, 3 + length), encoding, { fatal })).toBe(text)
        }
      }
    })
  }

  it("does not skip a trailing non-ASCII character or byte", function () {
    const text = "A".repeat(128)
    expect(utils.hex(iconv.encode(text + "中", "gbk"))).toBe("41 ".repeat(128) + "d6 d0")
    const bytes = utils.bytes("41 ".repeat(128) + "d6 d0")
    expect(iconv.decode(bytes, "gbk")).toBe(text + "中")
  })

  it("flushes pending surrogates and Big5 sequences before an ASCII block", function () {
    const text = "A".repeat(128)
    const gbk = iconv.getEncoder("gbk", { defaultCharByte: 0x21 })
    expect(gbk.write("\uD800")).toStrictEqual(utils.bytes([]))
    expect(utils.hex(gbk.write(text))).toBe("21 " + "41 ".repeat(128).trim())
    expect(gbk.end()).toBeUndefined()
    const big5 = iconv.getEncoder("big5")
    expect(big5.write("Ê")).toStrictEqual(utils.bytes([]))
    expect(utils.hex(big5.write(text))).toBe("88 66 " + "41 ".repeat(128).trim())
  })

  it("handles a pending multibyte lead before an ASCII block, including fatal mode", function () {
    const bytes = utils.bytes(Array(128).fill(0x20))
    const decoder = iconv.getDecoder("gbk")
    expect(decoder.write(utils.bytes([0x81]))).toBe("")
    expect(decoder.write(bytes)).toBe("\uFFFD" + " ".repeat(128))
    const fatal = iconv.getDecoder("gbk", { fatal: true })
    expect(fatal.write(utils.bytes([0x81]))).toBe("")
    expect(() => fatal.write(bytes)).toThrow(TypeError)
    expect(fatal.write(utils.bytes([]))).toBe(" ".repeat(128))
  })

  it("retains an incomplete sequence after a fast ASCII prefix", function () {
    const text = "A".repeat(128)
    const encoder = iconv.getEncoder("gb18030")
    expect(encoder.write(text + "\uD83D")).toStrictEqual(utils.bytes(Array(128).fill(0x41)))
    expect(utils.hex(encoder.write("\uDE00"))).toBe("94 39 fc 36")
    expect(encoder.end()).toBeUndefined()
    const decoder = iconv.getDecoder("gbk")
    expect(decoder.write(utils.bytes("41 ".repeat(128) + "94 39"))).toBe(text)
    expect(decoder.write(utils.bytes("fc 36"))).toBe("😀")
    expect(decoder.end() || "").toBe("")
  })

  it("respects custom tables that remap ASCII or use ASCII sequence prefixes", function () {
    const instance = new Iconv(iconv.backend)
    instance.addEncoding({
      remappedascii: { type: "_dbcs", table: () => [["0", ascii.replace("A", "Ω")]] },
      asciisequence: { type: "_dbcs", table: () => [["0", ascii], ["8140", "\u0FFFaX"]] }
    })
    expect(instance.encode("A".repeat(128), "remappedascii")).toStrictEqual(utils.bytes(Array(128).fill(0x3F)))
    expect(instance.decode(utils.bytes(Array(128).fill(0x41)), "remappedascii")).toBe("Ω".repeat(128))
    expect(utils.hex(instance.encode("aX".repeat(64), "asciisequence"))).toBe("81 40 ".repeat(64).trim())
  })
})
