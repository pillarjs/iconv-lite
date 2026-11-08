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
    it(encoding + " applies replacement options after caching without changing the default", function () {
      for (const prime of ["encodingExists", "decode", "getEncoder"] as const) {
        const instance = new Iconv(iconv.backend)
        if (prime === "decode") instance.decode(utils.bytes([0x41]), encoding)
        else instance[prime](encoding)

        for (const options of [undefined, { invalidCharHandler () {} }]) {
          expect(instance.encode("?A!\0\uFFFD🙂\uD800", alias, { ...options, defaultCharByte: 0 }), prime)
            .toStrictEqual(utils.bytes([0x3F, 0x41, 0x21, 0, 0, 0, 0]))
          expect(instance.encode("?A!\0\uFFFD🙂\uD800", alias, options), prime).toStrictEqual(utils.bytes([0x3F, 0x41, 0x21, 0, 0x3F, 0x3F, 0x3F]))
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
        for (const options of [undefined, { invalidCharHandler () {} }]) {
          expect(instance.encode(text + "\uFFFD", encoding, { ...options, defaultCharByte: replacement })).toStrictEqual(utils.bytes([...bytes, replacement]))
        }
        const calls: unknown[] = []
        expect(instance.encode(text + "\uFFFD", encoding, {
          defaultCharByte: replacement,
          invalidCharHandler (char, position) {
            calls.push([char, position])
            return text
          }
        })).toStrictEqual(utils.bytes([...bytes, ...bytes]))
        expect(calls).toStrictEqual([["\uFFFD", text.length]])
        expect(() => instance.encode("\uFFFD", encoding, {
          defaultCharByte: replacement,
          invalidCharHandler () { return "\uFFFD" }
        })).toThrowError(TypeError)
      }
    })
  }

  it("shares one table across encoders with independent replacement options", function () {
    const instance = new Iconv(iconv.backend)
    const codec = instance.getCodec("windows1252") as InstanceType<typeof SBCSCodec>
    const table = codec.encodeBuf
    const original = instance.getEncoder("windows1252")
    const options = { defaultCharByte: 0 }
    const nul = instance.getEncoder("cp1252", options)
    options.defaultCharByte = 0xFF
    const last = instance.getEncoder("windows1252", options)

    expect(original.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(nul.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0]))
    expect(last.write("\0\uFFFD")).toStrictEqual(utils.bytes([0, 0xFF]))
    expect(instance.encode("\0\uFFFD", "cp1252", Object.freeze({ defaultCharByte: 0x21 }))).toStrictEqual(utils.bytes([0, 0x21]))
    expect(instance.encode("\0\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(new Iconv(iconv.backend).encode("\0\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0, 0x3F]))
    expect(codec.encodeBuf).toBe(table)
    expect(instance.getCodec("cp1252")).toBe(codec)
  })

  it("rejects invalid replacement byte options with fresh and cached codecs", function () {
    for (const cached of [false, true]) {
      for (const replacement of [-1, 256, 1.5, NaN, Infinity, -Infinity, null, "!", true, {}]) {
        const instance = new Iconv(iconv.backend)
        if (cached) instance.getCodec("windows1252")
        for (const options of [undefined, { invalidCharHandler () {} }]) {
          expect(() => instance.encode("A", "cp1252", { ...options, defaultCharByte: replacement as number }))
            .toThrowError(expect.objectContaining({ name: "TypeError", message: "defaultCharByte must be an integer between 0 and 255" }))
        }
        expect(instance.encode("\uFFFD", "windows1252", { defaultCharByte: undefined })).toStrictEqual(utils.bytes([0x3F]))
      }
    }
  })

  it("rejects unassigned characters when byte 0x3F is unassigned in a custom table", function () {
    const instance = new Iconv(iconv.backend)
    instance.addEncoding({
      customsbcs: {
        type: "_sbcs",
        chars: String.fromCharCode(...Array.from({ length: 256 }, (_, byte) => byte === 0x3F ? 0xFFFD : byte))
      }
    })
    for (const options of [undefined, { invalidCharHandler () {} }]) {
      expect(instance.encode("\0?\uFFFD", "customsbcs", { ...options, defaultCharByte: 0x21 })).toStrictEqual(utils.bytes([0, 0x21, 0x21]))
    }
    expect(() => instance.encode("?", "customsbcs", {
      defaultCharByte: 0x21,
      invalidCharHandler () { return "\uFFFD" }
    })).toThrowError(TypeError)
  })

  it("captures replacement options through handler callbacks and finalization", function () {
    const instance = new Iconv(iconv.backend)
    const options = {
      defaultCharByte: 0x21,
      invalidCharHandler () {
        options.defaultCharByte = 0x23
        expect(instance.encode("\uFFFD", "cp1252", { defaultCharByte: 0x23 })).toStrictEqual(utils.bytes([0x23]))
      }
    }
    const encoder = instance.getEncoder("windows1252", options)
    expect(encoder.write("\uFFFD\uFFFD\uD800")).toStrictEqual(utils.bytes([0x21, 0x21]))
    expect(encoder.end()).toStrictEqual(utils.bytes([0x21]))
  })

  it("supports default and configured replacements through the encoder constructor", function () {
    const instance = new Iconv(iconv.backend)
    const codec = instance.getCodec("windows1252") as InstanceType<typeof SBCSCodec>
    const Encoder = codec.encoder
    const encoder = new Encoder({ defaultCharByte: 0x21 }, codec, instance.backend)
    expect(instance.encode("\uFFFD", "windows1252")).toStrictEqual(utils.bytes([0x3F]))
    expect(encoder.write("\uFFFD")).toStrictEqual(utils.bytes([0x21]))
    expect(new Encoder({}, codec, instance.backend).write("\uFFFD")).toStrictEqual(utils.bytes([0x3F]))
    expect(new Encoder({ defaultCharByte: 0 }, codec, instance.backend).write("\uFFFD")).toStrictEqual(utils.bytes([0]))
    expect(() => new Encoder({ defaultCharByte: -1 }, codec, instance.backend)).toThrowError(TypeError)
  })
})
