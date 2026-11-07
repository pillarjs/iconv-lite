import assert from "assert"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-windows-indexes.json" with { type: "json" }

const iconv = utils.requireIconv()

describe("SBCS encoder replacement settings", function () {
  const encodings = [
    ...Object.keys(indexes).map(encoding => [encoding, "cp" + encoding.slice(8)]),
    ["ascii", "us-ascii"], ["iso88593", "latin3"], ["koi8r", "koi8-r"]
  ]

  for (const [encoding, alias] of encodings) {
    it(encoding + " uses the current replacement after the codec is cached", function () {
      for (const prime of ["encodingExists", "decode", "getEncoder"]) {
        const instance = new Iconv(iconv.backend)
        if (prime === "decode") instance.decode(utils.bytes([0x41]), encoding)
        else instance[prime](encoding)
        instance.defaultCharSingleByte = "!"

        for (const options of [undefined, { invalidCharHandler () {} }]) {
          assert.deepStrictEqual(
            instance.encode("?A!\0\uFFFD🙂\uD800", alias, options),
            utils.bytes([0x3F, 0x41, 0x21, 0, 0x21, 0x21, 0x21, 0x21]),
            prime
          )
        }
      }
    })
  }

  for (const [encoding, index] of Object.entries(indexes)) {
    it(encoding + " preserves assigned characters when replacement bytes change", function () {
      const instance = new Iconv(iconv.backend)
      const bytes = Array.from({ length: 256 }, (_, byte) => byte)
        .filter(byte => byte < 0x80 || index[byte - 0x80] !== null)
      const text = String.fromCodePoint(...bytes.map(byte => byte < 0x80 ? byte : index[byte - 0x80]))
      instance.encodingExists(encoding)

      for (const replacement of [0, 0x3F, 0x80, 0x81, 0xAA, 0xFF]) {
        instance.defaultCharSingleByte = String.fromCharCode(replacement)
        for (const options of [undefined, { invalidCharHandler () {} }]) {
          assert.deepStrictEqual(instance.encode(text + "\uFFFD", encoding, options), utils.bytes([...bytes, replacement]))
        }
        const calls = []
        assert.deepStrictEqual(instance.encode(text + "\uFFFD", encoding, {
          invalidCharHandler (char, position) {
            calls.push([char, position])
            return text
          }
        }), utils.bytes([...bytes, ...bytes]))
        assert.deepStrictEqual(calls, [["\uFFFD", text.length]])
        assert.throws(() => instance.encode("\uFFFD", encoding, {
          invalidCharHandler () { return "\uFFFD" }
        }), TypeError)
      }
    })
  }

  it("keeps existing encoders and other instances unchanged across replacement changes", function () {
    const instance = new Iconv(iconv.backend)
    const other = new Iconv(iconv.backend)
    const codec = instance.getCodec("windows1252")
    const original = instance.getEncoder("windows1252")
    instance.defaultCharSingleByte = "\0"
    const nul = instance.getEncoder("cp1252")
    instance.defaultCharSingleByte = "\xFF"
    const last = instance.getEncoder("windows1252")
    instance.defaultCharSingleByte = "?"

    assert.deepStrictEqual(instance.encode("\0\uFFFD", "windows1252"), utils.bytes([0, 0x3F]))
    assert.deepStrictEqual(original.write("\0\uFFFD"), utils.bytes([0, 0x3F]))
    assert.deepStrictEqual(nul.write("\0\uFFFD"), utils.bytes([0, 0]))
    assert.deepStrictEqual(last.write("\0\uFFFD"), utils.bytes([0, 0xFF]))
    assert.deepStrictEqual(other.encode("\0\uFFFD", "windows1252"), utils.bytes([0, 0x3F]))
    assert.strictEqual(instance.getCodec("cp1252"), codec)
  })

  it("rejects invalid replacements with fresh and cached codecs, then recovers", function () {
    for (const cached of [false, true]) {
      for (const replacement of ["", "??", "€", "🙂", null, undefined, 0, {}]) {
        const instance = new Iconv(iconv.backend)
        const original = cached ? instance.getEncoder("windows1252") : null
        instance.defaultCharSingleByte = replacement
        assert.throws(() => instance.getEncoder("cp1252"), {
          name: "TypeError", message: "defaultCharSingleByte must be a single-byte character"
        })
        assert.throws(() => instance.encode("A", "windows1252", { invalidCharHandler () {} }), TypeError)
        instance.defaultCharSingleByte = "!"
        assert.deepStrictEqual(instance.encode("\uFFFD", "windows1252"), utils.bytes([0x21]))
        if (original) assert.deepStrictEqual(original.write("\uFFFD"), utils.bytes([0x3F]))
      }
    }
  })

  it("keeps a handler's replacement through writes and finalization when the instance changes", function () {
    const instance = new Iconv(iconv.backend)
    instance.encodingExists("windows1252")
    instance.defaultCharSingleByte = "!"
    const encoder = instance.getEncoder("windows1252", {
      invalidCharHandler () {
        instance.defaultCharSingleByte = "#"
        assert.deepStrictEqual(instance.encode("\uFFFD", "cp1252"), utils.bytes([0x23]))
      }
    })
    assert.deepStrictEqual(encoder.write("\uFFFD\uFFFD\uD800"), utils.bytes([0x21, 0x21]))
    assert.deepStrictEqual(encoder.end(), utils.bytes([0x21]))
  })

  it("retains direct encoder construction with the codec's captured replacement", function () {
    const instance = new Iconv(iconv.backend)
    instance.defaultCharSingleByte = "!"
    const codec = instance.getCodec("windows1252")
    const encoder = new codec.encoder({}, codec, instance.backend)
    instance.defaultCharSingleByte = "#"
    assert.deepStrictEqual(instance.encode("\uFFFD", "windows1252"), utils.bytes([0x23]))
    assert.deepStrictEqual(encoder.write("\uFFFD"), utils.bytes([0x21]))
  })
})
