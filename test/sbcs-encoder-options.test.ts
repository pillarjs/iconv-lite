import { expect } from "vitest"
import type { _sbcs as SBCSCodec } from "../encodings/sbcs-codec.js"
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
      for (const prime of ["encodingExists", "decode", "getEncoder"] as const) {
        const instance = new Iconv(iconv.backend)
        if (prime === "decode") instance.decode(utils.bytes([0x41]), encoding)
        else instance[prime](encoding)
        instance.defaultCharSingleByte = "!"

        for (const options of [undefined, { invalidCharHandler () {} }]) {
          expect(instance.encode("?A!\0\uFFFD🙂\uD800", alias, options), prime).toStrictEqual(utils.bytes([0x3F, 0x41, 0x21, 0, 0x21, 0x21, 0x21, 0x21]))
        }
      }
    })
  }

  for (const [encoding, index] of Object.entries(indexes)) {
    it(encoding + " preserves assigned characters when replacement bytes change", function () {
      const instance = new Iconv(iconv.backend)
      const bytes = Array.from({ length: 256 }, (_, byte) => byte)
        .filter(byte => byte < 0x80 || index[byte - 0x80] !== null)
      const text = String.fromCodePoint(...bytes.map(byte => byte < 0x80 ? byte : index[byte - 0x80]!))
      instance.encodingExists(encoding)

      for (const replacement of [0, 0x3F, 0x80, 0x81, 0xAA, 0xFF]) {
        instance.defaultCharSingleByte = String.fromCharCode(replacement)
        for (const options of [undefined, { invalidCharHandler () {} }]) {
          expect(instance.encode(text + "\uFFFD", encoding, options)).toStrictEqual(utils.bytes([...bytes, replacement]))
        }
        const calls: unknown[] = []
        expect(instance.encode(text + "\uFFFD", encoding, {
          invalidCharHandler (char, position) {
            calls.push([char, position])
            return text
          }
        })).toStrictEqual(utils.bytes([...bytes, ...bytes]))
        expect(calls).toStrictEqual([["\uFFFD", text.length]])
        expect(() => instance.encode("\uFFFD", encoding, {
          invalidCharHandler () { return "\uFFFD" }
        })).toThrowError(TypeError)
      }
    })
  }

  it("keeps existing encoders and other instances unchanged across replacement changes", function () {
    const instance = new Iconv(iconv.backend)
    const other = new Iconv(iconv.backend)
    const codec = instance.getCodec("windows1252") as InstanceType<typeof SBCSCodec>
    const original = instance.getEncoder("windows1252")
    instance.defaultCharSingleByte = "\0"
    const nul = instance.getEncoder("cp1252")
    instance.defaultCharSingleByte = "\xFF"
    const last = instance.getEncoder("windows1252")
    instance.defaultCharSingleByte = "?"

    expect(instance.encode("\0\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(original.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(nul.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0]))
    expect(last.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0xFF]))
    expect(other.encode("\0\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(instance.getCodec("cp1252")).toBe(codec)
  })

  it("rejects invalid replacements with fresh and cached codecs, then recovers", function () {
    for (const cached of [false, true]) {
      for (const replacement of ["", "??", "€", "🙂", null, undefined, 0, {}]) {
        const instance = new Iconv(iconv.backend)
        const original = cached ? instance.getEncoder("windows1252") : null
        instance.defaultCharSingleByte = replacement as string
        expect(() => instance.getEncoder("cp1252")).toThrowError(expect.objectContaining({
          name: "TypeError", message: "defaultCharSingleByte must be a single-byte character"
        }))
        expect(() => instance.encode("A", "windows1252", { invalidCharHandler () {} })).toThrowError(TypeError)
        instance.defaultCharSingleByte = "!"
        expect(instance.encode("\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0x21]))
        if (original) expect(original.write("\uFFFD")).toStrictEqual(utils.bytes([0x3F]))
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
        expect(instance.encode("\uFFFD", "cp1252")).toStrictEqual(utils.bytes([0x23]))
      }
    })
    expect(encoder.write("\uFFFD\uFFFD\uD800")).toStrictEqual(utils.bytes([0x21, 0x21]))
    expect(encoder.end()).toStrictEqual(utils.bytes([0x21]))
  })

  it("retains direct encoder construction with the codec's captured replacement", function () {
    const instance = new Iconv(iconv.backend)
    instance.defaultCharSingleByte = "!"
    const codec = instance.getCodec("windows1252") as InstanceType<typeof SBCSCodec>
    const Encoder = codec.encoder
    const encoder = new Encoder({}, codec, instance.backend)
    instance.defaultCharSingleByte = "#"
    expect(instance.encode("\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0x23]))
    expect(encoder.write("\uFFFD")).toStrictEqual(utils.bytes([0x21]))
  })
})
