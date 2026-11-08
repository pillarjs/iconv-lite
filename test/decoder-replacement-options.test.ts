import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
const cases = [
  { encoding: "gbk", invalid: "81 ff", incomplete: "81", prefix: "A" },
  { encoding: "gb18030", invalid: "84 31 a5 30", incomplete: "81 30 81", prefix: "A🙂\uFFFD" },
  { encoding: "shiftjis", invalid: "81 ff", incomplete: "81", prefix: "A" },
  { encoding: "eucjp", invalid: "8f a1 ff", incomplete: "8f a1", prefix: "A" },
  { encoding: "cp949", invalid: "81 ff", incomplete: "81", prefix: "A" },
  { encoding: "big5", invalid: "81 ff", incomplete: "81", prefix: "A" },
  { encoding: "cesu8", invalid: "ff", incomplete: "e0 a0", prefix: "A🙂\uFFFD" },
  { encoding: "utf32le", invalid: "00 d8 00 00", incomplete: "41 00", prefix: "A🙂\uFFFD" },
  { encoding: "utf32be", invalid: "00 00 d8 00", incomplete: "00 41", prefix: "A🙂\uFFFD" },
  { encoding: "utf32", invalid: "00 d8 00 00", incomplete: "41 00", prefix: "A🙂\uFFFD" }
]

describe("Decoder replacement options", function () {
  for (const { encoding, invalid, incomplete, prefix } of cases) {
    const input = utils.concatBufs([
      iconv.encode(prefix, encoding, { addBOM: false }), utils.bytes(invalid),
      iconv.encode("B", encoding, { addBOM: false }), utils.bytes(incomplete)
    ])

    it(encoding + " inserts complete literal replacements across every split", function () {
      for (const replacement of ["\uFFFD", "!", "🙂", "<invalid>", "$&$`$'$$", "", "\0", "\uD800", "x\uFFFDy"]) {
        const options = Object.freeze({ defaultCharUnicode: replacement })
        const expected = prefix + replacement + "B" + replacement
        expect(iconv.decode(input, encoding, options)).toBe(expected)
        for (let split = 0; split <= input.length; split++) {
          const decoder = iconv.getDecoder(encoding, options)
          const text = decoder.write(input.subarray(0, split)) + decoder.write(utils.bytes([])) +
            decoder.write(input.subarray(split)) + (decoder.end() || "")
          expect(text, "split " + split).toBe(expected)
        }
      }
    })

    it(encoding + " captures options without changing cached codecs or other decoders", function () {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(encoding)
      const original = instance.getDecoder(encoding)
      const options = { defaultCharUnicode: "🙂" }
      const first = instance.getDecoder(encoding, options)
      options.defaultCharUnicode = ""
      const second = instance.getDecoder(encoding, options)
      options.defaultCharUnicode = "!"
      const decode = (decoder: ReturnType<typeof instance.getDecoder>) => decoder.write(input) + (decoder.end() || "")
      expect(decode(first)).toBe(prefix + "🙂B🙂")
      expect(decode(second)).toBe(prefix + "B")
      expect(decode(original)).toBe(prefix + "\uFFFDB\uFFFD")
      expect(instance.decode(input, encoding, options)).toBe(prefix + "!B!")
      expect(instance.getCodec(encoding)).toBe(codec)
    })

    it(encoding + " validates replacement text at decoder creation", function () {
      for (const cached of [false, true]) {
        const instance = new Iconv(iconv.backend)
        if (cached) instance.getCodec(encoding)
        for (const replacement of [null, false, 0, {}, [], () => "?"]) {
          expect(() => instance.getDecoder(encoding, { defaultCharUnicode: replacement as string }))
            .toThrowError(expect.objectContaining({ name: "TypeError", message: "defaultCharUnicode must be a string" }))
        }
        expect(instance.decode(input, encoding, { defaultCharUnicode: undefined })).toBe(prefix + "\uFFFDB\uFFFD")
      }
    })
  }

  for (const encoding of ["utf32le", "utf32be", "utf32"]) {
    it(encoding + " preserves valid U+FFFD in long output and keeps fatal mode", function () {
      const valid = "A🙂\uFFFD".repeat(40)
      const malformed = utils.bytes(encoding === "utf32be" ? "00 11 00 00" : "00 00 11 00")
      const input = utils.concatBufs([iconv.encode(valid, encoding), malformed, iconv.encode(valid, encoding, { addBOM: false })])
      for (const replacement of ["!", "🙂", "<invalid>", "", "\uD800"]) {
        expect(iconv.decode(input, encoding, { defaultCharUnicode: replacement })).toBe(valid + replacement + valid)
        expect(() => iconv.decode(input, encoding, { defaultCharUnicode: replacement, fatal: true })).toThrowError()
        expect(() => iconv.decode(utils.bytes([0]), encoding, { defaultCharUnicode: replacement, fatal: true })).toThrowError()
      }
    })
  }

  for (const { encoding, invalid, incomplete } of cases.filter(({ encoding }) => encoding === "cesu8" || encoding.startsWith("utf32"))) {
    for (const replacement of ["\uFEFF", "\uFEFFx", ""]) {
      it(`${encoding} distinguishes input BOMs from replacement ${JSON.stringify(replacement)}`, function () {
        const bom = iconv.encode("\uFEFF", encoding, { addBOM: false })
        const letter = iconv.encode("A", encoding, { addBOM: false })
        const partialMatch = utils.bytes(encoding === "cesu8" ? "ef bb ff" : encoding === "utf32be" ? "00 11 00 00" : "ff fe 11 00")
        const inputs = [
          { bytes: utils.bytes([]), text: "", hasBOM: false },
          { bytes: utils.bytes(invalid), text: replacement, hasBOM: false },
          { bytes: utils.bytes(incomplete), text: replacement, hasBOM: false },
          { bytes: partialMatch, text: replacement.repeat(encoding === "cesu8" ? 2 : 1), hasBOM: false },
          { bytes: utils.concatBufs([utils.bytes(invalid), bom, letter]), text: replacement + "\uFEFFA", hasBOM: false },
          { bytes: utils.concatBufs([bom, utils.bytes(invalid), bom, letter, utils.bytes(incomplete)]), text: replacement + "\uFEFFA" + replacement, hasBOM: true },
          { bytes: utils.concatBufs([bom, bom, letter]), text: "\uFEFFA", hasBOM: true },
          ...Array.from({ length: bom.length - 1 }, (_, index) => ({ bytes: bom.subarray(0, index + 1), text: replacement, hasBOM: false }))
        ]
        for (const { bytes, text, hasBOM } of inputs) {
          for (const mode of [undefined, false, "callback"] as const) {
            let calls = 0
            const options = Object.freeze({
              defaultCharUnicode: replacement,
              stripBOM: mode === "callback" ? () => { calls++ } : mode
            })
            const expected = (mode === false && hasBOM ? "\uFEFF" : "") + text
            const expectedCalls = mode === "callback" && hasBOM ? 1 : 0
            expect(iconv.decode(bytes, encoding, options)).toBe(expected)
            expect(calls).toBe(expectedCalls)
            for (let split = 0; split <= bytes.length; split++) {
              calls = 0
              const decoder = iconv.getDecoder(encoding, options)
              const output = decoder.write(bytes.subarray(0, split)) + decoder.write(utils.bytes([])) +
                decoder.write(bytes.subarray(split)) + (decoder.end() || "")
              expect(output, "split " + split).toBe(expected)
              expect(calls).toBe(expectedCalls)
            }
          }
        }
      })
    }
  }
})
