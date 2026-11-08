import { expect } from "vitest"
import type { _sbcs as SBCSCodec } from "../encodings/sbcs-codec.js"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
import indexes from "./wpt/data/whatwg-windows-indexes.json" with { type: "json" }

const iconv = utils.requireIconv()

describe("SBCS decoder replacement options", function () {
  const replacements = ["\uFFFD", "?", "🙂", "<invalid>", "$&$`$'$$", "", "\0"]

  for (const [encoding, index] of Object.entries(indexes)) {
    it(encoding + " only replaces undefined bytes with the configured text", function () {
      const instance = new Iconv(iconv.backend)
      const original = instance.getDecoder(encoding)
      const alias = "cp" + encoding.slice(8)
      const bytes = utils.bytes(Array.from({ length: 256 }, (_, byte) => byte))
      const codePoints = Array.from(bytes, byte => byte < 0x80 ? byte : index[byte - 0x80])
      const text = (replacement: string) => codePoints.map(code => code === null ? replacement : String.fromCodePoint(code)).join("")

      for (const replacement of replacements) {
        const options = Object.freeze({ defaultCharUnicode: replacement })
        expect(instance.decode(bytes, alias, options)).toBe(text(replacement))
        const decoder = instance.getDecoder(alias, options)
        expect(decoder.write(bytes.subarray(0, 128)) + decoder.write(bytes.subarray(128))).toBe(text(replacement))
        expect(decoder.write(utils.bytes([]))).toBe("")
        expect(decoder.end()).toBeUndefined()

        const fatal = instance.getDecoder(alias, { ...options, fatal: true })
        const unassigned = codePoints.indexOf(null)
        if (unassigned !== -1) expect(() => fatal.write(utils.bytes([unassigned]))).toThrowError(TypeError)
        expect(fatal.write(utils.bytes([0x41, 0x81]))).toBe("A" + String.fromCodePoint(index[1]!))
      }
      expect(original.write(bytes)).toBe(text("\uFFFD"))
      expect(instance.decode(bytes, encoding, { defaultCharUnicode: undefined })).toBe(text("\uFFFD"))
    })
  }

  it("captures decoder options independently of later changes and cached aliases", function () {
    const instance = new Iconv(iconv.backend)
    const codec = instance.getCodec("windows1253") as InstanceType<typeof SBCSCodec>
    const table = Array.from(codec.decodeBuf)
    const options = { defaultCharUnicode: "🙂" }
    const first = instance.getDecoder("cp1253", options)
    options.defaultCharUnicode = ""
    const second = instance.getDecoder("windows1253", options)
    options.defaultCharUnicode = "?"

    const input = utils.bytes([0x41, 0xAA, 0x81, 0xAA])
    expect(first.write(input)).toBe("A🙂\u0081🙂")
    expect(second.write(input)).toBe("A\u0081")
    expect(instance.decode(input, "cp1253", options)).toBe("A?\u0081?")
    expect(instance.decode(input, "windows1253")).toBe("A\uFFFD\u0081\uFFFD")
    expect(Array.from(codec.decodeBuf)).toStrictEqual(table)
    expect(instance.getCodec("cp1253")).toBe(codec)
    expect(instance.encode("\uFFFD", "windows1253")).toStrictEqual(utils.bytes([0x3F]))
  })

  it("rejects non-string options with fresh and cached codecs, including fatal mode", function () {
    for (const cached of [false, true]) {
      for (const replacement of [null, false, 0, {}, [], ["?"], () => "?"]) {
        const instance = new Iconv(iconv.backend)
        if (cached) instance.getCodec("windows1253")
        for (const fatal of [false, true]) {
          expect(() => instance.decode(utils.bytes([]), "cp1253", {
            defaultCharUnicode: replacement as string,
            fatal
          })).toThrowError(expect.objectContaining({ name: "TypeError", message: "defaultCharUnicode must be a string" }))
        }
        expect(instance.decode(utils.bytes([0xAA]), "windows1253", { defaultCharUnicode: "!" })).toBe("!")
      }
    }
  })

  for (const [encoding, byte] of [["iso88593", 0xA5], ["iso88596", 0xA1], ["macroman", 0xF0]] as const) {
    it(encoding + " supports replacement options outside the Windows family", function () {
      for (const replacement of replacements) {
        expect(iconv.decode(utils.bytes([0x41, byte, 0x42]), encoding, { defaultCharUnicode: replacement })).toBe("A" + replacement + "B")
        expect(() => iconv.decode(utils.bytes([byte]), encoding, { defaultCharUnicode: replacement, fatal: true })).toThrowError(TypeError)
      }
    })
  }

  it("supports replacement options and validation through the decoder constructor", function () {
    const codec = iconv.getCodec("windows1253") as InstanceType<typeof SBCSCodec>
    const Decoder = codec.decoder
    const input = utils.bytes([0xAA])
    expect(new Decoder({ defaultCharUnicode: "" }, codec, iconv.backend).write(input)).toBe("")
    expect(new Decoder({ defaultCharUnicode: undefined }, codec, iconv.backend).write(input)).toBe("\uFFFD")
    expect(() => new Decoder({ defaultCharUnicode: null as unknown as string }, codec, iconv.backend)).toThrowError(TypeError)
  })
})
