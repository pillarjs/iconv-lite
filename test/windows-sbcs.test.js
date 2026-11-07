import assert from "assert"
import utils from "./helpers/utils.js"
import Iconv from "../lib/iconv.js"
import indexes from "./wpt/data/whatwg-windows-indexes.json" with { type: "json" }
const iconv = utils.requireIconv()

// Legacy labels from https://encoding.spec.whatwg.org/encodings.json.
const legacyLabels = {
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

// Independent WHATWG indexes, refreshed by test/wpt/gen-indexes.js.
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
    const validText = String.fromCodePoint(...validBytes.map(byte => codePoints[byte]))
    const unassignedBytes = allBytes.filter(byte => codePoints[byte] === null)
    const c1Text = expected.slice(0x80, 0xA0)

    if (legacyLabels[encoding]) {
      it(encoding + " shares its codec with legacy labels regardless of lookup order or spelling", function () {
        for (const alias of legacyLabels[encoding]) {
          for (const first of [alias, encoding]) {
            const instance = new Iconv(iconv.backend)
            const codec = instance.getCodec(first)
            assert.strictEqual(instance.getCodec(encoding), codec)
            assert.strictEqual(instance.getCodec(" \t\n\f\r" + alias.toUpperCase() + " \t\n\f\r"), codec)
            instance.defaultCharSingleByte = "!"
            assert.deepStrictEqual(instance.encode("\uFFFD", alias), utils.bytes([0x21]))
            assert.deepStrictEqual(instance.encode("\uFFFD", encoding), utils.bytes([0x21]))
          }
        }
      })
    }

    it(encoding + " only replaces unassigned bytes with the instance setting", function () {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(encoding)
      instance.defaultCharUnicode = "!"
      const customExpected = codePoints.map(code => code === null ? "!" : String.fromCodePoint(code)).join("")

      assert.strictEqual(instance.decode(utils.bytes(allBytes), encoding), customExpected)
      assert.strictEqual(instance.getCodec(encoding), codec)
      assert.strictEqual(instance.decode(utils.bytes(validBytes), encoding, { fatal: true }), validText)
      assert.deepStrictEqual(instance.encode("!\uFFFD", encoding), utils.bytes([0x21, 0x3F]))
      assert.strictEqual(iconv.decode(utils.bytes(allBytes), encoding), expected)
    })

    it(encoding + " matches all 256 bytes and roundtrips assigned bytes through aliases", function () {
      for (const alias of aliases) {
        assert.strictEqual(iconv.decode(utils.bytes(allBytes), alias), expected, alias)
        assert.strictEqual(iconv.decode(utils.bytes(validBytes), alias, { fatal: true }), validText, alias)
        assert.deepStrictEqual(iconv.encode(validText, alias), utils.bytes(validBytes), alias)
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
        assert.deepStrictEqual(
          iconv.encode(String.fromCodePoint(...codes), encoding),
          utils.bytes(codes.map(code => pointers.get(code) ?? 0x3F))
        )
      }
    })

    it(encoding + " applies fatal mode to every byte", function () {
      for (const byte of allBytes) {
        const input = utils.bytes([byte])
        assert.strictEqual(iconv.decode(input, encoding, { fatal: false }), expected[byte])
        if (codePoints[byte] === null) {
          assert.throws(() => iconv.decode(input, encoding, { fatal: true }), TypeError)
        } else {
          assert.strictEqual(iconv.decode(input, encoding, { fatal: true }), expected[byte])
        }
      }
    })

    it(encoding + " streams C1 mappings one byte at a time in fatal mode", function () {
      for (const alias of aliases) {
        const decoder = iconv.getDecoder(alias, { fatal: true })
        const encoder = iconv.getEncoder(alias)
        assert.strictEqual(decoder.write(utils.bytes([])), "")
        for (let i = 0; i < c1Bytes.length; i++) {
          assert.strictEqual(decoder.write(utils.bytes([c1Bytes[i]])), c1Text[i], alias)
          assert.deepStrictEqual(encoder.write(c1Text[i]), utils.bytes([c1Bytes[i]]), alias)
        }
        assert.ok(!decoder.end())
        assert.ok(!encoder.end())
      }
    })

    it(encoding + " accepts C1 mappings in input and handler replacements", function () {
      for (const alias of aliases) {
        const calls = []
        const input = "A" + c1Text + "B\uFFFD"
        const actual = iconv.encode(input, alias, {
          invalidCharHandler (char, index) {
            calls.push({ char, index })
            return c1Text
          }
        })

        assert.deepStrictEqual(calls, [{ char: "\uFFFD", index: 34 }], alias)
        assert.deepStrictEqual(actual, utils.bytes([0x41, ...c1Bytes, 0x42, ...c1Bytes]), alias)
      }
    })

    if (unassignedBytes.length) {
      it(encoding + " inserts custom replacements literally across chunk boundaries", function () {
        const instance = new Iconv(iconv.backend)
        for (const replacement of ["!", "🙂", "<bad>", "$&$`$'$$", "", "\u0000"]) {
          instance.defaultCharUnicode = replacement
          const decoder = instance.getDecoder(encoding)
          for (const byte of unassignedBytes) {
            assert.strictEqual(decoder.write(utils.bytes([0x41, byte])), "A" + replacement)
            assert.strictEqual(decoder.write(utils.bytes([])), "")
            assert.strictEqual(decoder.write(utils.bytes([byte, 0x81])), replacement + "\u0081")
            assert.throws(() => instance.decode(utils.bytes([byte]), encoding, { fatal: true }), TypeError)
          }
          assert.ok(!decoder.end())
        }
      })

      it(encoding + " snapshots the replacement for each decoder without changing cached tables", function () {
        const instance = new Iconv(iconv.backend)
        const defaultDecoder = instance.getDecoder(encoding)
        const codec = instance.getCodec(encoding)
        const originalTable = Array.from(codec.decodeBuf)
        instance.defaultCharUnicode = "!"
        const customDecoder = instance.getDecoder(aliases[1])
        const fatalDecoder = instance.getDecoder(encoding, { fatal: true })
        instance.defaultCharUnicode = "?"
        const input = utils.bytes(unassignedBytes)

        assert.strictEqual(defaultDecoder.write(input), "\uFFFD".repeat(input.length))
        assert.strictEqual(customDecoder.write(input), "!".repeat(input.length))
        assert.strictEqual(instance.decode(input, encoding), "?".repeat(input.length))
        assert.throws(() => fatalDecoder.write(input), TypeError)
        assert.strictEqual(fatalDecoder.write(utils.bytes([0x41, 0x81])), "A\u0081")
        assert.deepStrictEqual(Array.from(codec.decodeBuf), originalTable)
        assert.strictEqual(instance.getCodec(encoding), codec)
      })

      it(encoding + " preserves replacement decoding and rejects invalid bytes through aliases", function () {
        for (const alias of aliases) {
          for (const byte of unassignedBytes) {
            const input = utils.bytes([0x41, byte, 0x42])
            assert.strictEqual(iconv.decode(input, alias), "A\uFFFDB")
            assert.throws(() => iconv.decode(input, alias, { fatal: true }), TypeError)
          }
        }
        assert.deepStrictEqual(iconv.encode("\uFFFD", encoding), utils.bytes([0x3F]))
      })

      it(encoding + " keeps fatal mode per decoder and recovers after a failed write", function () {
        const decoder = iconv.getDecoder(encoding, Object.freeze({ fatal: true }))
        const loose = iconv.getDecoder(encoding, Object.freeze({ fatal: false }))
        for (const byte of unassignedBytes) {
          assert.strictEqual(decoder.write(utils.bytes([0x81])), "\u0081")
          assert.throws(() => decoder.write(utils.bytes([0x41, byte, 0x42])), TypeError)
          assert.strictEqual(decoder.write(utils.bytes([])), "")
          assert.strictEqual(decoder.write(utils.bytes([0x43])), "C")
          assert.strictEqual(loose.write(utils.bytes([byte])), "\uFFFD")
          assert.strictEqual(iconv.decode(utils.bytes([byte]), encoding), "\uFFFD")
        }
        assert.ok(!decoder.end())
        assert.ok(!loose.end())
      })

      it(encoding + " only validates the supplied Uint8Array view", function () {
        const input = utils.bytes([unassignedBytes[0], 0x41, unassignedBytes[0]])
        assert.strictEqual(iconv.decode(input.subarray(1, 2), encoding, { fatal: true }), "A")
      })
    }
  }
})
