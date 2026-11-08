import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
const encodings = [
  ["gbk", "x-gbk"], ["gb18030", "GB18030"], ["cp936", "ms936"],
  ["shiftjis", "sjis"], ["eucjp", "euc-jp"], ["cp949", "euc-kr"],
  ["big5hkscs", "big5"], ["cp950", "windows950"]
]

describe("DBCS encoder replacement options", function () {
  for (const [encoding, alias] of encodings) {
    it(encoding + " uses the configured byte with fresh and cached codecs", function () {
      for (const cached of [false, true]) {
        const instance = new Iconv(iconv.backend)
        if (cached) instance.encodingExists(encoding)
        for (const defaultCharByte of [0, 0x21, 0x3F, 0x80, 0xFF]) {
          for (const handler of [undefined, { invalidCharHandler () {} }]) {
            const options = Object.freeze({ ...handler, defaultCharByte })
            expect(instance.encode("?A\0\uD800B\uDC00", alias, options))
              .toStrictEqual(utils.bytes([0x3F, 0x41, 0, defaultCharByte, 0x42, defaultCharByte]))
            expect(instance.encode("\uD800", encoding)).toStrictEqual(utils.bytes([0x3F]))
          }
        }
      }
    })

    it(encoding + " captures replacements across writes and finalization", function () {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(encoding)
      for (const handler of [undefined, { invalidCharHandler () {} }]) {
        const options = { ...handler, defaultCharByte: 0 }
        const nul = instance.getEncoder(alias, options)
        options.defaultCharByte = 0xFF
        const last = instance.getEncoder(encoding, options)
        options.defaultCharByte = 0x21

        expect(nul.write("\uDC00\uD800")).toStrictEqual(utils.bytes([0]))
        expect(nul.write("")).toStrictEqual(utils.bytes([]))
        expect(nul.end()).toStrictEqual(utils.bytes([0]))
        expect(last.write("\uDC00\uD800")).toStrictEqual(utils.bytes([0xFF]))
        expect(last.end()).toStrictEqual(utils.bytes([0xFF]))
        expect(instance.encode("\uD800", alias, options)).toStrictEqual(utils.bytes([0x21]))
        expect(instance.getCodec(encoding)).toBe(codec)
      }
    })

    it(encoding + " rejects invalid byte options without affecting existing encoders", function () {
      const instance = new Iconv(iconv.backend)
      const encoder = instance.getEncoder(encoding)
      for (const value of [-1, 256, 0.5, NaN, Infinity, null, "!", false, {}]) {
        for (const handler of [undefined, { invalidCharHandler () {} }]) {
          expect(() => instance.encode("A", alias, { ...handler, defaultCharByte: value as number }))
            .toThrowError(expect.objectContaining({ name: "TypeError", message: "defaultCharByte must be an integer between 0 and 255" }))
        }
      }
      expect(encoder.write("\uDC00")).toStrictEqual(utils.bytes([0x3F]))
      expect(instance.encode("\uDC00", alias, { defaultCharByte: undefined })).toStrictEqual(utils.bytes([0x3F]))
    })

    it(encoding + " keeps the fallback through handler callbacks and respects replacement text", function () {
      const instance = new Iconv(iconv.backend)
      const options = {
        defaultCharByte: 0x21,
        invalidCharHandler () {
          options.defaultCharByte = 0x23
          expect(instance.encode("\uD800", alias, { defaultCharByte: 0x23 })).toStrictEqual(utils.bytes([0x23]))
        }
      }
      const encoder = instance.getEncoder(encoding, options)
      expect(encoder.write("\uDC00\uD800")).toStrictEqual(utils.bytes([0x21]))
      expect(encoder.end()).toStrictEqual(utils.bytes([0x21]))
      expect(instance.encode("\uD800", alias, {
        defaultCharByte: 0xFF,
        invalidCharHandler () { return "?" }
      })).toStrictEqual(utils.bytes([0x3F]))
    })
  }
})
