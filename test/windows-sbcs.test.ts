import { expect } from "vitest"
import utils from "./helpers/utils.js"
import type { _sbcs as SBCSCodec } from "../encodings/sbcs-codec.js"
import Iconv from "../lib/iconv.js"
import indexes from "./wpt/data/whatwg-windows-indexes.json" with { type: "json" }
const iconv = utils.requireIconv()

// Legacy labels from https://encoding.spec.whatwg.org/encodings.json.
const legacyLabels: Record<string, string[]> = {
  "windows-1252": [
    "ansi_x3.4-1968", "ascii", "cp819", "csisolatin1", "ibm819", "iso-8859-1",
    "iso-ir-100", "iso8859-1", "iso88591", "iso_8859-1", "iso_8859-1:1987",
    "l1", "latin1", "us-ascii"
  ],
  "windows-1254": [
    "csisolatin5", "iso-8859-9", "iso-ir-148", "iso8859-9", "iso88599",
    "iso_8859-9", "iso_8859-9:1989", "l5", "latin5"
  ],
  "windows-874": ["iso-8859-11", "iso8859-11", "iso885911", "tis-620"]
}

// Independent WHATWG indexes, refreshed by test/wpt/gen-indexes.ts.
// Include 0xFF, which the upstream single-byte-decoder test omits.
describe("Windows single-byte WHATWG mappings", function () {
  const allBytes = Array.from({ length: 256 }, (_, i) => i)
  const c1Bytes = allBytes.slice(0x80, 0xA0)

  for (const [encoding, index] of Object.entries(indexes)) {
    const cp = encoding.slice("windows-".length)
    const aliases = [
      encoding, "win" + cp, "cp" + cp, cp,
      cp === "874" ? "dos-874" : "x-cp" + cp,
      ...(legacyLabels[encoding] || [])
    ]
    const codePoints = allBytes.map(byte => byte < 0x80 ? byte : index[byte - 0x80])
    const expected = String.fromCodePoint(...codePoints.map(code => code ?? 0xFFFD))
    const validBytes = allBytes.filter(byte => codePoints[byte] !== null)
    const validText = String.fromCodePoint(...validBytes.map(byte => codePoints[byte]!))
    const unassignedBytes = allBytes.filter(byte => codePoints[byte] === null)
    const c1Text = expected.slice(0x80, 0xA0)

    if (legacyLabels[encoding]) {
      it(encoding + " shares its codec with legacy labels regardless of lookup order or spelling", function () {
        for (const alias of legacyLabels[encoding]) {
          for (const first of [alias, encoding]) {
            const instance = new Iconv(iconv.backend)
            const codec = instance.getCodec(first)
            expect(instance.getCodec(encoding)).toBe(codec)
            expect(instance.getCodec(" \t\n\f\r" + alias.toUpperCase() + " \t\n\f\r")).toBe(codec)
            instance.defaultCharSingleByte = "!"
            expect(instance.encode("\uFFFD", alias)).toStrictEqual(utils.bytes([0x21]))
            expect(instance.encode("\uFFFD", encoding)).toStrictEqual(utils.bytes([0x21]))
          }
        }
      })
    }

    it(encoding + " only replaces unassigned bytes with the instance setting", function () {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(encoding)
      instance.defaultCharUnicode = "!"
      const customExpected = codePoints.map(code => code === null ? "!" : String.fromCodePoint(code)).join("")

      expect(instance.decode(utils.bytes(allBytes), encoding)).toBe(customExpected)
      expect(instance.getCodec(encoding)).toBe(codec)
      expect(instance.decode(utils.bytes(validBytes), encoding, { fatal: true })).toBe(validText)
      expect(instance.encode("!\uFFFD", encoding)).toStrictEqual(utils.bytes([0x21, 0x3F]))
      expect(iconv.decode(utils.bytes(allBytes), encoding)).toBe(expected)
    })

    it(encoding + " matches all 256 bytes and roundtrips assigned bytes through aliases", function () {
      for (const alias of aliases) {
        expect(iconv.decode(utils.bytes(allBytes), alias), alias).toBe(expected)
        expect(iconv.decode(utils.bytes(validBytes), alias, { fatal: true }), alias).toBe(validText)
        expect(iconv.encode(validText, alias), alias).toStrictEqual(utils.bytes(validBytes))
      }
    })

    it(encoding + " encodes every BMP scalar according to the WHATWG index", function () {
      const pointers = new Map()
      for (const byte of validBytes) {
        if (!pointers.has(codePoints[byte])) pointers.set(codePoints[byte], byte)
      }
      for (let high = 0; high < 0x100; high++) {
        if (high >= 0xD8 && high <= 0xDF) continue // Surrogates are not scalar values.
        const codes = allBytes.map(low => high * 0x100 + low)
        expect(iconv.encode(String.fromCodePoint(...codes), encoding)).toStrictEqual(utils.bytes(codes.map(code => pointers.get(code) ?? 0x3F)))
      }
    })

    it(encoding + " applies fatal mode to every byte", function () {
      for (const byte of allBytes) {
        const input = utils.bytes([byte])
        expect(iconv.decode(input, encoding, { fatal: false })).toBe(expected[byte])
        if (codePoints[byte] === null) {
          expect(() => iconv.decode(input, encoding, { fatal: true })).toThrowError(TypeError)
        } else {
          expect(iconv.decode(input, encoding, { fatal: true })).toBe(expected[byte])
        }
      }
    })

    it(encoding + " streams C1 mappings one byte at a time in fatal mode", function () {
      for (const alias of aliases) {
        const decoder = iconv.getDecoder(alias, { fatal: true })
        const encoder = iconv.getEncoder(alias)
        expect(decoder.write(utils.bytes([]))).toBe("")
        for (let i = 0; i < c1Bytes.length; i++) {
          expect(decoder.write(utils.bytes([c1Bytes[i]])), alias).toBe(c1Text[i])
          expect(encoder.write(c1Text[i]), alias).toStrictEqual(utils.bytes([c1Bytes[i]]))
        }
        expect(!decoder.end()).toBeTruthy()
        expect(!encoder.end()).toBeTruthy()
      }
    })

    it(encoding + " accepts C1 mappings in input and handler replacements", function () {
      for (const alias of aliases) {
        const calls: unknown[] = []
        const input = "A" + c1Text + "B\uFFFD"
        const actual = iconv.encode(input, alias, {
          invalidCharHandler (char, index) {
            calls.push({ char, index })
            return c1Text
          }
        })

        expect(calls, alias).toStrictEqual([{ char: "\uFFFD", index: 34 }])
        expect(actual, alias).toStrictEqual(utils.bytes([0x41, ...c1Bytes, 0x42, ...c1Bytes]))
      }
    })

    if (unassignedBytes.length) {
      it(encoding + " inserts custom replacements literally across chunk boundaries", function () {
        const instance = new Iconv(iconv.backend)
        for (const replacement of ["!", "🙂", "<bad>", "$&$`$'$$", "", "\u0000"]) {
          instance.defaultCharUnicode = replacement
          const decoder = instance.getDecoder(encoding)
          for (const byte of unassignedBytes) {
            expect(decoder.write(utils.bytes([0x41, byte]))).toBe("A" + replacement)
            expect(decoder.write(utils.bytes([]))).toBe("")
            expect(decoder.write(utils.bytes([byte, 0x81]))).toBe(replacement + "\u0081")
            expect(() => instance.decode(utils.bytes([byte]), encoding, { fatal: true })).toThrowError(TypeError)
          }
          expect(!decoder.end()).toBeTruthy()
        }
      })

      it(encoding + " snapshots the replacement for each decoder without changing cached tables", function () {
        const instance = new Iconv(iconv.backend)
        const defaultDecoder = instance.getDecoder(encoding)
        const codec = instance.getCodec(encoding)
        const originalTable = Array.from((codec as InstanceType<typeof SBCSCodec>).decodeBuf)
        instance.defaultCharUnicode = "!"
        const customDecoder = instance.getDecoder(aliases[1])
        const fatalDecoder = instance.getDecoder(encoding, { fatal: true })
        instance.defaultCharUnicode = "?"
        const input = utils.bytes(unassignedBytes)

        expect(defaultDecoder.write(input)).toBe("\uFFFD".repeat(input.length))
        expect(customDecoder.write(input)).toBe("!".repeat(input.length))
        expect(instance.decode(input, encoding)).toBe("?".repeat(input.length))
        expect(() => fatalDecoder.write(input)).toThrowError(TypeError)
        expect(fatalDecoder.write(utils.bytes([0x41, 0x81]))).toBe("A\u0081")
        expect(Array.from((codec as InstanceType<typeof SBCSCodec>).decodeBuf)).toStrictEqual(originalTable)
        expect(instance.getCodec(encoding)).toBe(codec)
      })

      it(encoding + " preserves replacement decoding and rejects invalid bytes through aliases", function () {
        for (const alias of aliases) {
          for (const byte of unassignedBytes) {
            const input = utils.bytes([0x41, byte, 0x42])
            expect(iconv.decode(input, alias)).toBe("A\uFFFDB")
            expect(() => iconv.decode(input, alias, { fatal: true })).toThrowError(TypeError)
          }
        }
        expect(iconv.encode("\uFFFD", encoding)).toStrictEqual(utils.bytes([0x3F]))
      })

      it(encoding + " keeps fatal mode per decoder and recovers after a failed write", function () {
        const decoder = iconv.getDecoder(encoding, Object.freeze({ fatal: true }))
        const loose = iconv.getDecoder(encoding, Object.freeze({ fatal: false }))
        for (const byte of unassignedBytes) {
          expect(decoder.write(utils.bytes([0x81]))).toBe("\u0081")
          expect(() => decoder.write(utils.bytes([0x41, byte, 0x42]))).toThrowError(TypeError)
          expect(decoder.write(utils.bytes([]))).toBe("")
          expect(decoder.write(utils.bytes([0x43]))).toBe("C")
          expect(loose.write(utils.bytes([byte]))).toBe("\uFFFD")
          expect(iconv.decode(utils.bytes([byte]), encoding)).toBe("\uFFFD")
        }
        expect(!decoder.end()).toBeTruthy()
        expect(!loose.end()).toBeTruthy()
      })

      it(encoding + " only validates the supplied Uint8Array view", function () {
        const input = utils.bytes([unassignedBytes[0], 0x41, unassignedBytes[0]])
        expect(iconv.decode(input.subarray(1, 2), encoding, { fatal: true })).toBe("A")
      })
    }
  }
})
