import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-koi8-mac-indexes.json" with { type: "json" }
const iconv = utils.requireIconv()

const encodings: {
  name: keyof typeof indexes
  labels: string[]
  removed: string
  changedBytes: number[]
}[] = [
  {
    name: "koi8-u",
    labels: ["koi8-u", "koi8-ru"],
    removed: "\u255D\u256C",
    changedBytes: [0xAE, 0xBE]
  },
  {
    name: "macintosh",
    labels: ["macintosh", "csmacintosh", "mac", "x-mac-roman"],
    removed: "\u2126\u00A4",
    changedBytes: [0xBD, 0xDB, 0xF0]
  },
  {
    name: "x-mac-cyrillic",
    labels: ["x-mac-cyrillic", "x-mac-ukrainian"],
    removed: "\u00A2\u2202\u00A4",
    changedBytes: [0xA2, 0xB6, 0xFF]
  }
]

// Independent WHATWG indexes, including byte 0xFF which the upstream WPT omits.
describe("KOI8 and Macintosh WHATWG mappings", function () {
  const allBytes = Array.from({ length: 256 }, (_, byte) => byte)

  for (const { name, labels, removed, changedBytes } of encodings) {
    const codePoints = allBytes.map(byte => byte < 128 ? byte : indexes[name][byte - 128])
    const expected = String.fromCodePoint(...codePoints)

    it(name + " decodes and roundtrips every byte through all web labels", function () {
      for (const label of labels) {
        for (const fatal of [false, true]) {
          expect(iconv.decode(utils.bytes(allBytes), label, { fatal }), label).toBe(expected)
        }
        expect(iconv.encode(expected, label), label).toStrictEqual(utils.bytes(allBytes))
      }
    })

    it(name + " streams all 256 bytes in fatal mode", function () {
      for (const label of labels) {
        const decoder = iconv.getDecoder(label, { fatal: true })
        const encoder = iconv.getEncoder(label)
        for (const byte of allBytes) {
          expect(decoder.write(utils.bytes([]))).toBe("")
          expect(decoder.write(utils.bytes([byte])), label).toBe(expected[byte])
          expect(encoder.write(expected[byte]), label).toStrictEqual(utils.bytes([byte]))
        }
        expect(!decoder.end()).toBeTruthy()
        expect(!encoder.end()).toBeTruthy()
      }
    })

    it(name + " encodes every BMP scalar according to the WHATWG index", function () {
      const pointers = new Map<number, number>()
      for (const byte of allBytes) {
        if (!pointers.has(codePoints[byte])) pointers.set(codePoints[byte], byte)
      }
      for (let high = 0; high < 256; high++) {
        if (high >= 0xD8 && high <= 0xDF) continue
        const codes = allBytes.map(low => high * 256 + low)
        expect(iconv.encode(String.fromCodePoint(...codes), name))
          .toStrictEqual(utils.bytes(codes.map(code => pointers.get(code) ?? 0x3F)))
      }
    })

    it(name + " shares the codec across labels, spelling and lookup order", function () {
      for (const first of labels) {
        const instance = new Iconv(iconv.backend)
        const codec = instance.getCodec(first)
        for (const label of labels) {
          expect(instance.getCodec(" \t" + label.toUpperCase() + "\r\n")).toBe(codec)
          expect(instance.decode(utils.bytes(allBytes), label, { defaultCharUnicode: "!" })).toBe(expected)
        }
      }
    })

    it(name + " accepts every assigned character in input and handler replacements", function () {
      for (const label of labels) {
        const calls: string[] = []
        const bytes = iconv.encode(expected + "\uFFFD", label, {
          invalidCharHandler (char) {
            calls.push(char)
            return expected
          }
        })
        expect(calls).toStrictEqual(["\uFFFD"])
        expect(bytes, label).toStrictEqual(utils.bytes([...allBytes, ...allBytes]))
      }
    })

    it(name + " uses custom replacements for removed characters after caching", function () {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(name)
      const input = expected + removed

      for (const replacement of new Set([0, 0x3F, ...changedBytes, 0xFF])) {
        const options = { defaultCharByte: replacement }
        const output = utils.bytes([...allBytes, ...Array.from(removed, () => replacement)])
        for (const label of labels) {
          expect(instance.encode(input, label, options), label).toStrictEqual(output)
          const calls: [string, number][] = []
          expect(instance.encode(input, label, {
            ...options,
            invalidCharHandler (char, index) { calls.push([char, index]) }
          }), label).toStrictEqual(output)
          expect(calls, label).toStrictEqual(Array.from(removed, (char, index) => [char, expected.length + index]))
          expect(instance.getCodec(label)).toBe(codec)
        }
      }
    })

    it(name + " accepts new mappings and rejects removed characters in handler replacements", function () {
      const instance = new Iconv(iconv.backend)
      instance.getCodec(name)
      const replacement = changedBytes.map(byte => expected[byte]).join("")

      for (const fallback of changedBytes) {
        for (const label of labels) {
          const calls: [string, number][] = []
          expect(instance.encode("A" + removed, label, {
            defaultCharByte: fallback,
            invalidCharHandler (char, index) {
              calls.push([char, index])
              return replacement
            }
          }), label).toStrictEqual(utils.bytes([0x41, ...Array.from(removed).flatMap(() => changedBytes)]))
          expect(calls, label).toStrictEqual(Array.from(removed, (char, index) => [char, index + 1]))
          for (const char of removed) {
            expect(() => instance.encode("\uFFFD", label, {
              defaultCharByte: fallback,
              invalidCharHandler () { return char }
            }), label).toThrowError(TypeError)
          }
        }
      }
    })
  }

  it("keeps Greek omega distinct from the ohm sign without normalization", function () {
    expect(iconv.decode(utils.bytes([0xBD]), "macintosh")).toBe("\u03A9")
    expect(iconv.encode("\u03A9\u2126", "macintosh")).toStrictEqual(utils.bytes([0xBD, 0x3F]))
  })

  it("accepts the Apple private-use character in Macintosh fatal decoding", function () {
    expect(iconv.decode(utils.bytes([0xF0]), "macintosh", { fatal: true })).toBe("\uF8FF")
    expect(iconv.encode("\uF8FF", "macintosh")).toStrictEqual(utils.bytes([0xF0]))
  })

  it("retains explicit KOI8-U code pages independently of the web labels", function () {
    for (const first of ["koi8-u", "cp21866"]) {
      const instance = new Iconv(iconv.backend)
      instance.getCodec(first)
      for (const label of [21866, "21866", "cp21866", "ibm1168"]) {
        expect(instance.decode(utils.bytes([0xAE, 0xBE]), label)).toBe("\u255D\u256C")
        expect(instance.encode("\u255D\u256C", label)).toStrictEqual(utils.bytes([0xAE, 0xBE]))
      }
      expect(instance.decode(utils.bytes([0xAE, 0xBE]), "koi8-u")).toBe("\u045E\u040E")
      expect(instance.getCodec("koi8-u")).not.toBe(instance.getCodec("cp21866"))
    }
  })

  it("retains the explicit legacy Macintosh codecs and numeric code pages", function () {
    for (const label of ["macroman", 10000]) {
      expect(iconv.decode(utils.bytes([0xBD, 0xDB, 0xF0]), label)).toBe("\u2126\u00A4\uFFFD")
      expect(iconv.encode("\u2126\u00A4", label)).toStrictEqual(utils.bytes([0xBD, 0xDB]))
    }
    for (const label of ["maccyrillic", 10007]) {
      expect(iconv.decode(utils.bytes([0xA2, 0xB6, 0xFF]), label)).toBe("\u00A2\u2202\u00A4")
      expect(iconv.encode("\u00A2\u2202\u00A4", label)).toStrictEqual(utils.bytes([0xA2, 0xB6, 0xFF]))
    }
    expect(iconv.decode(utils.bytes([0xA2, 0xB6, 0xFF]), "macukraine")).toBe("\u0490\u0491\u00A4")
  })
})
