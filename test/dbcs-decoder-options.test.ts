import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("DBCS decoder fatal option", function () {
  // WPT textdecoder-mistakes: Replacement, push back ASCII characters.
  const mistakes = [
    ["big5", "80", "�"],
    ["big5", "81 40", "�@"],
    ["big5", "83 5c", "�\\"],
    ["big5", "87 87 40", "�@"],
    ["big5", "81 81", "�"],
    ["euc-jp", "80", "�"],
    ["euc-jp", "8d 8d", "��"],
    ["euc-jp", "8e 8e", "�"],
    ["euc-kr", "80", "�"],
    ["euc-kr", "ad ad", "�"],
    ["euc-kr", "41 c7 41", "A�A"],
    ["shift_jis", "85 85", "�"],
    ...["gbk", "gb18030"].flatMap(encoding => [
      [encoding, "a0 30 2b", "�0+"],
      [encoding, "81 31", "�"]
    ])
  ]

  for (const [encoding, hex, expected] of mistakes) {
    it(`${encoding} handles ${hex} in replacement and fatal modes at every chunk boundary`, function () {
      const input = utils.bytes(hex)
      expect(iconv.decode(input, encoding)).toBe(expected)
      expect(() => iconv.decode(input, encoding, { fatal: true })).toThrowError(TypeError)
      for (let split = 0; split <= input.length; split++) {
        const decoder = iconv.getDecoder(encoding, { fatal: false })
        expect(decoder.write(input.subarray(0, split)) + decoder.write(utils.bytes([])) +
          decoder.write(input.subarray(split)) + decoder.end()).toBe(expected)
        for (const defaultCharUnicode of [undefined, "", "<invalid>"]) {
          const strict = iconv.getDecoder(encoding, { fatal: true, defaultCharUnicode })
          expect(() => {
            strict.write(input.subarray(0, split))
            strict.write(utils.bytes([]))
            strict.write(input.subarray(split))
            strict.end()
          }, `split at ${split}`).toThrowError(TypeError)
        }
      }
    })
  }

  for (const [encoding, alias, hex, expected, lead] of [
    ["big5hkscs", "big5", "88 62 fa 40", "Ê\u0304𠕇", "a1"],
    ["cp950", "windows950", "a4 a4", "中", "a1"],
    ["shiftjis", "sjis", "82 a0 f0 40", "あ\uE000", "81"],
    ["eucjp", "euc-jp", "8e a1 8f a2 af a1 a1", "｡\u02D8\u3000", "a1"],
    ["cp949", "euc-kr", "b0 a1", "가", "b0"],
    ["gbk", "x-gbk", "d6 d0 81 30 81 30 95 30 83 35", "中\u0080😱", "81"],
    ["gb18030", "GB18030", "d6 d0 81 30 81 30 95 30 83 35", "中\u0080😱", "81"],
    ["cp936", "ms936", "d6 d0", "中", "81"]
  ]) {
    it(encoding + " decodes valid sequences in fatal mode at every chunk boundary", function () {
      const input = utils.bytes("41 " + hex + " 00 42")
      expect(iconv.decode(input, alias, { fatal: true })).toBe("A" + expected + "\0B")
      for (let split = 0; split <= input.length; split++) {
        const decoder = iconv.getDecoder(encoding, { fatal: true })
        expect(decoder.write(input.subarray(0, split)) + decoder.write(utils.bytes([])) +
          decoder.write(input.subarray(split)) + decoder.end()).toBe("A" + expected + "\0B")
      }
    })

    it(encoding + " captures fatal per decoder without changing cached codecs", function () {
      const instance = new Iconv(iconv.backend)
      const options = { fatal: true }
      const strict = instance.getDecoder(alias, options)
      options.fatal = false
      const lenient = instance.getDecoder(encoding, options)
      options.fatal = true
      const input = utils.bytes(lead + " 20")
      expect(() => strict.write(input)).toThrowError(TypeError)
      expect(lenient.write(input) + lenient.end()).toBe("� ")
      expect(instance.decode(input, alias)).toBe("� ")
      expect(strict.end()).toBe(" ")
      expect(strict.end()).toBe("")
    })
  }

  for (const [encoding, hex] of [
    ["big5", "a1"], ["cp950", "a1"], ["shift_jis", "81"],
    ["euc-kr", "b0"], ["cp936", "81"],
    ...["8e", "8f", "8f a2", "a1"].map(hex => ["euc-jp", hex]),
    ...["gbk", "gb18030"].flatMap(encoding => ["81", "81 30", "81 30 81"].map(hex => [encoding, hex]))
  ]) {
    it(`${encoding} rejects truncated ${hex} only at finalization and resets after throwing`, function () {
      const decoder = iconv.getDecoder(encoding, { fatal: true })
      for (const byte of utils.bytes(hex)) expect(decoder.write(utils.bytes([byte]))).toBe("")
      expect(decoder.write(utils.bytes([]))).toBe("")
      expect(() => decoder.end()).toThrowError(TypeError)
      expect(decoder.end()).toBe("")
      expect(decoder.write(utils.bytes("41")) + decoder.end()).toBe("A")
    })
  }

  for (const [encoding, hex, next, expected] of [
    ["big5", "81 40", "41", "@A"],
    ["shift_jis", "81 7f", "41", "\u007fA"],
    ["euc-jp", "8f a2 20", "a1 a1", " \u3000"],
    ["euc-kr", "c7 41", "42", "AB"],
    ...["gbk", "gb18030"].flatMap(encoding => [
      [encoding, "a0 30 2b", "41", "0+A"],
      [encoding, "fe 39 fe 40", "41", "9\uFA0CA"]
    ])
  ]) {
    it(`${encoding} preserves restored bytes after fatal ${hex} at every chunk boundary`, function () {
      const input = utils.bytes(hex)
      for (let split = 0; split < input.length; split++) {
        const decoder = iconv.getDecoder(encoding, { fatal: true })
        expect(decoder.write(input.subarray(0, split))).toBe("")
        expect(() => decoder.write(input.subarray(split))).toThrowError(TypeError)
        expect(decoder.write(utils.bytes(next)) + decoder.end(), `split at ${split}`).toBe(expected)
      }
    })
  }

  for (const encoding of ["gbk", "gb18030"]) {
    for (const hex of ["84 31 a5 30", "8f 39 fe 39", "e3 32 9a 36", "fe 39 fe 39"]) {
      it(`${encoding} consumes invalid four-byte pointer ${hex} before throwing`, function () {
        const input = utils.bytes(hex)
        for (let split = 0; split < input.length; split++) {
          const decoder = iconv.getDecoder(encoding, { fatal: true })
          expect(decoder.write(input.subarray(0, split))).toBe("")
          expect(() => decoder.write(input.subarray(split))).toThrowError(TypeError)
          expect(decoder.write(utils.bytes("41")) + decoder.end()).toBe("A")
        }
      })
    }

    it(encoding + " owns restored and unread input after an error", function () {
      const input = utils.bytes("a0 30 2b 41")
      const decoder = iconv.getDecoder(encoding, { fatal: true })
      expect(() => decoder.write(input)).toThrowError(TypeError)
      input.fill(0)
      expect(decoder.write(utils.bytes([]))).toBe("0+A")
      expect(decoder.end()).toBe("")
    })

    it(encoding + " can fail again while processing restored bytes", function () {
      const decoder = iconv.getDecoder(encoding, { fatal: true })
      expect(() => decoder.write(utils.bytes("81 30 ff 41"))).toThrowError(TypeError)
      expect(() => decoder.write(utils.bytes([]))).toThrowError(TypeError)
      expect(decoder.write(utils.bytes("42")) + decoder.end()).toBe("AB")
    })

    it(encoding + " clears queued bytes when finalization throws", function () {
      for (const hex of ["81 30 ff 41", "81 20 81"]) {
        const decoder = iconv.getDecoder(encoding, { fatal: true })
        expect(() => decoder.write(utils.bytes(hex))).toThrowError(TypeError)
        expect(() => decoder.end()).toThrowError(TypeError)
        expect(decoder.end()).toBe("")
        expect(decoder.write(utils.bytes("41")) + decoder.end()).toBe("A")
      }
    })
  }
})
