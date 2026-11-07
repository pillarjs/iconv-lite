import assert from "assert"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-windows-indexes.json" with { type: "json" }
const iconv = utils.requireIconv()

// Independent WHATWG indexes, refreshed by test/wpt/gen-indexes.js.
// Include 0xFF, which the upstream single-byte-decoder test omits.
describe("Windows single-byte WHATWG mappings", function () {
  const allBytes = Array.from({ length: 256 }, (_, i) => i)
  const c1Bytes = allBytes.slice(0x80, 0xA0)

  for (const [encoding, index] of Object.entries(indexes)) {
    const cp = encoding.slice("windows-".length)
    const aliases = [
      encoding, "win" + cp, "cp" + cp, cp,
      cp === "874" ? "dos-874" : "x-cp" + cp
    ]
    const codePoints = allBytes.map(byte => byte < 0x80 ? byte : index[byte - 0x80])
    const expected = String.fromCodePoint(...codePoints.map(code => code ?? 0xFFFD))
    const validBytes = allBytes.filter(byte => codePoints[byte] !== null)
    const validText = String.fromCodePoint(...validBytes.map(byte => codePoints[byte]))
    const unassignedBytes = allBytes.filter(byte => codePoints[byte] === null)
    const c1Text = expected.slice(0x80, 0xA0)

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
      const decoder = iconv.getDecoder(encoding, { fatal: true })
      const encoder = iconv.getEncoder(encoding)
      assert.strictEqual(decoder.write(utils.bytes([])), "")
      for (let i = 0; i < c1Bytes.length; i++) {
        assert.strictEqual(decoder.write(utils.bytes([c1Bytes[i]])), c1Text[i])
        assert.deepStrictEqual(encoder.write(c1Text[i]), utils.bytes([c1Bytes[i]]))
      }
      assert.ok(!decoder.end())
      assert.ok(!encoder.end())
    })

    it(encoding + " accepts C1 mappings in input and handler replacements", function () {
      const calls = []
      const input = "A" + c1Text + "B\uFFFD"
      const actual = iconv.encode(input, encoding, {
        invalidCharHandler (char, index) {
          calls.push({ char, index })
          return c1Text
        }
      })

      assert.deepStrictEqual(calls, [{ char: "\uFFFD", index: 34 }])
      assert.deepStrictEqual(actual, utils.bytes([0x41, ...c1Bytes, 0x42, ...c1Bytes]))
    })

    if (unassignedBytes.length) {
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
