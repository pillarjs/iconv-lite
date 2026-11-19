import type { _dbcs as DBCSCodec } from "../encodings/dbcs-codec.js"
import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
import encoderTable from "./helpers/gb18030-encoder-table.js"
const iconv = utils.requireIconv()

const testString = "中国abc" // unicode contains GBK-code and ascii
const testStringGBKBuffer = utils.bytes("d6 d0 b9 fa 61 62 63")

describe("GBK tests", function () {
  it("GBK correctly encoded/decoded", function () {
    expect(utils.hex(iconv.encode(testString, "GBK"))).toBe(utils.hex(testStringGBKBuffer))
    expect(iconv.decode(testStringGBKBuffer, "GBK")).toBe(testString)
  })

  it("GB2312 correctly encoded/decoded", function () {
    expect(utils.hex(iconv.encode(testString, "GB2312"))).toBe(utils.hex(testStringGBKBuffer))
    expect(iconv.decode(testStringGBKBuffer, "GB2312")).toBe(testString)
  })

  it("GBK correctly decodes and encodes characters · and ×", function () {
    // https://github.com/ashtuchkin/iconv-lite/issues/13
    // Reference: http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP936.TXT
    const chars = "·×"
    const gbkChars = utils.bytes("a1 a4 a1 c1")
    expect(utils.hex(iconv.encode(chars, "GBK"))).toBe(utils.hex(gbkChars))
    expect(iconv.decode(gbkChars, "GBK")).toBe(chars)
  })

  it("GBK and GB18030 correctly decodes and encodes Euro character", function () {
    // Euro character (U+20AC) has two encodings in GBK family: 0x80 and 0xA2 0xE3
    // According to W3C's technical recommendation (https://www.w3.org/TR/encoding/#gbk-encoder),
    // Both GBK and GB18030 decoders should accept both encodings.
    const gbkEuroEncoding1 = utils.bytes("80")
    const gbkEuroEncoding2 = utils.bytes("a2 e3")
    const strEuro = "€"

    expect(iconv.decode(gbkEuroEncoding1, "GBK")).toBe(strEuro)
    expect(iconv.decode(gbkEuroEncoding2, "GBK")).toBe(strEuro)
    expect(iconv.decode(gbkEuroEncoding1, "GB18030")).toBe(strEuro)
    expect(iconv.decode(gbkEuroEncoding2, "GB18030")).toBe(strEuro)

    // GBK encodes the euro sign as 0x80, while GB18030 uses 0xA2 0xE3.
    expect(utils.hex(iconv.encode(strEuro, "GBK"))).toBe(utils.hex(gbkEuroEncoding1))
    expect(utils.hex(iconv.encode(strEuro, "GB18030"))).toBe(utils.hex(gbkEuroEncoding2))
  })

  it("GB18030 findIdx works correctly", function () {
    function findIdxAlternative (table: number[], val: number) {
      for (let i = 0; i < table.length; i++) {
        if (table[i] > val) { return i - 1 }
      }
      return table.length - 1
    }

    const codec = iconv.getEncoder("gb18030") as ReturnType<InstanceType<typeof DBCSCodec>["createEncoder"]> & { findIdx(table: number[], value: number): number, gb18030: { uChars: number[], gbChars: number[] } }

    for (let i = 0; i < 0x100; i++) { expect(codec.findIdx(codec.gb18030.uChars, i), String(i)).toBe(findIdxAlternative(codec.gb18030.uChars, i)) }

    const tests = [0xFFFF, 0x10000, 0x10001, 0x30000]
    for (let i = 0; i < tests.length; i++) { expect(codec.findIdx(codec.gb18030.uChars, tests[i]), String(tests[i])).toBe(findIdxAlternative(codec.gb18030.uChars, tests[i])) }
  })

  it("GB18030 encodes/decodes 4 byte sequences", function () {
    const chars: Record<string, Uint8Array> = {
      "\u0080": utils.bytes("81 30 81 30"),
      "\u0081": utils.bytes("81 30 81 31"),
      "\u008b": utils.bytes("81 30 82 31"),
      "\u0615": utils.bytes("81 31 82 31"),
      㦟: utils.bytes("82 31 82 31"),
      "\udbd9\ude77": utils.bytes("e0 31 82 31")
    }
    for (const uChar in chars) {
      const gbkBuf = chars[uChar]
      expect(utils.hex(iconv.encode(uChar, "GB18030"))).toBe(utils.hex(gbkBuf))
      expect(utils.strToHex(iconv.decode(gbkBuf, "GB18030"))).toBe(utils.strToHex(uChar))
    }
  })

  it("GB18030 correctly decodes incomplete 4 byte sequences", function () {
    for (const bytes of [[0x82], [0x82, 0x31], [0x82, 0x31, 0x82]]) {
      expect(iconv.decode(utils.bytes(bytes), "GB18030")).toBe("�")
    }
    const chars: Record<string, Uint8Array> = {
      㦟: utils.bytes("82 31 82 31"),
      "� ": utils.bytes("82 20"),
      "�1 ": utils.bytes("82 31 20"),
      "�1� ": utils.bytes("82 31 82 20"),
      "\u399f ": utils.bytes("82 31 82 31 20"),
      "�1\u4fdb": utils.bytes("82 31 82 61"),
      "�1\u5010\u0061": utils.bytes("82 31 82 82 61"),
      㦟俛: utils.bytes("82 31 82 31 82 61"),
      "�1\u50101�": utils.bytes("82 31 82 82 31 82 31")
    }
    for (const uChar in chars) {
      const gbkBuf = chars[uChar]
      expect(utils.strToHex(iconv.decode(gbkBuf, "GB18030"))).toBe(utils.strToHex(uChar))
    }
  })

  it("GBK does not encode U+E7C7, which only has a GB18030 four-byte code", function () {
    for (const encoding of ["GBK", "x-gbk", "iso-ir-58"]) {
      for (const [text, expected] of [
        ["\uE7C7", "3f"],
        ["\uE7C7\uE7C7", "3f 3f"],
        ["a\uE7C7\uE7C7b", "61 3f 3f 62"]
      ] as const) {
        expect(utils.hex(iconv.encode(text, encoding)), encoding).toBe(expected)
      }
    }
    for (const options of [undefined, { invalidCharHandler () { throw new Error("GB18030 can encode U+E7C7") } }]) {
      expect(utils.hex(iconv.encode("\uE7C7", "GB18030", options))).toBe("81 35 f4 37")
    }
    expect(iconv.decode(utils.bytes("81 35 f4 37"), "GBK")).toBe("\uE7C7")
  })

  for (const useHandler of [false, true]) {
    it(`GBK applies all 18 private-use mappings ${useHandler ? "with" : "without"} a handler`, function () {
      const options = useHandler
        ? { invalidCharHandler () { throw new Error("representable character") } }
        : undefined
      for (const encoding of ["GBK", "x-gbk", "iso-ir-58"]) {
        for (const [char, expected] of encoderTable) {
          expect(utils.hex(iconv.encode(char, encoding, options)), `${encoding} ${utils.strToHex(char)}`).toBe(expected)
        }
      }
    })

    it(`GBK preserves private-use mappings and errors across every split ${useHandler ? "with" : "without"} a handler`, function () {
      const text = "A😱" + encoderTable.map(([char]) => char).join("") + "\uE5E5\uD800B\uDC00\uD800"
      const expected = "41 3f " + encoderTable.map(([, hex]) => hex).join(" ") + " 3f 3f 42 3f 3f"

      function encodeChunks (chunks: string[]) {
        const calls: string[] = []
        const options = useHandler ? { invalidCharHandler (char: string) { calls.push(char) } } : undefined
        const encoder = iconv.getEncoder("gbk", options)
        const output = chunks.map(chunk => encoder.write(chunk))
        const tail = encoder.end()
        if (tail) output.push(tail)
        expect(encoder.end()).toBe(undefined)
        if (useHandler) expect(calls).toStrictEqual(["😱", "\uE5E5", "\uD800", "\uDC00", "\uD800"])
        return utils.hex(utils.concatBufs(output))
      }

      for (let split = 0; split <= text.length; split++) {
        expect(encodeChunks([text.slice(0, split), "", text.slice(split)]), `split ${split}`).toBe(expected)
      }
      expect(encodeChunks(text.split(""))).toBe(expected)
    })
  }

  it("GBK keeps U+E5E5 unencodable and private-use mappings asymmetric", function () {
    expect(utils.hex(iconv.encode("\uE5E5", "GBK"))).toBe("3f")
    expect(iconv.decode(utils.bytes("a6 d9 fe 67"), "GBK")).toBe("\uFE10\u9FB7")
  })

  it("GBK reports U+E7C7 to the handler and respects its replacement or cancellation", function () {
    for (const [replacement, expected] of [
      [undefined, "61 80 3f 62"],
      [false, "61 80 3f 62"],
      ["!", "61 80 21 62"],
      ["", "61 80 62"],
      ["中", "61 80 d6 d0 62"],
      [true, null]
    ] as const) {
      const calls: unknown[] = []
      const encoded = iconv.encode("a€\uE7C7b", "GBK", {
        invalidCharHandler (char, index) { calls.push([char, index]); return replacement }
      })
      expect(calls).toStrictEqual([["\uE7C7", 2]])
      expect(encoded === null ? null : utils.hex(encoded)).toBe(expected)
    }
  })

  it("GBK uses the configured replacement byte for U+E7C7 in both encoder paths", function () {
    const custom = new Iconv(iconv.backend)
    for (const options of [undefined, { invalidCharHandler () {} }]) {
      expect(utils.hex(custom.encode("a\uE7C7b", "GBK", { ...options, defaultCharByte: 0x21 }))).toBe("61 21 62")
    }
  })

  it("GBK rejects U+E7C7 in replacement text without calling the handler recursively", function () {
    const calls: unknown[] = []
    expect(() => iconv.encode("a\uE7C7b", "GBK", {
      invalidCharHandler (char, index) { calls.push([char, index]); return "\uE7C7" }
    })).toThrowError(/Replacement .* cannot be encoded in gbk at index 1/)
    expect(calls).toStrictEqual([["\uE7C7", 1]])
  })

  const gbkLabels = ["gbk", "x-gbk", "iso-ir-58", "gb2312", "GB_2312", "gb_2312-80", "csgb2312", "csiso58gb231280", "chinese"]

  it("WHATWG GBK labels use the GBK codec", function () {
    // https://encoding.spec.whatwg.org/#names-and-labels
    // GBK-only two-byte codes, a GB18030 four-byte code and the euro byte.
    const bytes = utils.bytes("fe 50 a1 40 81 30 81 30 80")
    for (const first of gbkLabels) {
      const instance = new Iconv(iconv.backend)
      const codec = instance.getCodec(first)
      for (const label of gbkLabels) {
        expect(instance.getCodec(label), label).toBe(codec)
        expect(instance.decode(bytes, label), label).toBe("\u2E81\uE4C6\u0080\u20AC")
        expect(utils.hex(instance.encode("\u2E81\u20AC\u{1F600}", label)), label).toBe("fe 50 80 3f")
      }
    }
  })

  for (const label of gbkLabels) {
    it(`${label} applies GBK handler replacements and reports only unrepresentable characters`, function () {
      const calls: unknown[] = []
      const encoded = iconv.encode("\u2E81€\uE78D😀\uE7C7", label, {
        defaultCharByte: 0x21,
        invalidCharHandler (char, index) {
          calls.push([char, index])
          if (char === "😀") return "\u2E81"
        }
      })
      expect(utils.hex(encoded)).toBe("fe 50 80 a6 d9 fe 50 21")
      expect(calls).toStrictEqual([["😀", 3], ["\uE7C7", 4]])
    })

    for (const useHandler of [false, true]) {
      it(`${label} preserves GBK encoding across every split ${useHandler ? "with" : "without"} a handler`, function () {
        const text = "A\u2E81€\uE78D😀\uE7C7B\uD800"
        const expected = "41 fe 50 80 a6 d9 21 21 42 21"

        function encodeChunks (chunks: string[]) {
          const calls: string[] = []
          const encoder = iconv.getEncoder(label, {
            defaultCharByte: 0x21,
            ...(useHandler ? { invalidCharHandler (char: string) { calls.push(char) } } : {})
          })
          const output = chunks.map(chunk => encoder.write(chunk))
          const tail = encoder.end()
          if (tail) output.push(tail)
          expect(encoder.end()).toBeUndefined()
          if (useHandler) expect(calls).toStrictEqual(["😀", "\uE7C7", "\uD800"])
          return utils.hex(utils.concatBufs(output))
        }

        for (let split = 0; split <= text.length; split++) {
          expect(encodeChunks([text.slice(0, split), "", text.slice(split)]), `split ${split}`).toBe(expected)
        }
        expect(encodeChunks(text.split(""))).toBe(expected)
      })
    }

    it(`${label} preserves GBK decoding across every byte split, including fatal mode`, function () {
      const bytes = utils.bytes("41 fe 50 a1 40 81 30 81 30 80 a6 d9 42")
      const expected = "A\u2E81\uE4C6\u0080€\uFE10B"
      for (const fatal of [false, true]) {
        function decodeChunks (chunks: Uint8Array[]) {
          const decoder = iconv.getDecoder(label, { fatal })
          return chunks.map(chunk => decoder.write(chunk)).join("") + (decoder.end() || "")
        }

        for (let split = 0; split <= bytes.length; split++) {
          expect(decodeChunks([bytes.subarray(0, split), utils.bytes([]), bytes.subarray(split)]), `split ${split}, fatal ${fatal}`).toBe(expected)
        }
        expect(decodeChunks(Array.from(bytes, byte => utils.bytes([byte])))).toBe(expected)
      }
      expect(() => iconv.decode(utils.bytes("81 20"), label, { fatal: true })).toThrow(TypeError)
      expect(iconv.decode(utils.bytes("81 20"), label)).toBe("\uFFFD ")
    })
  }

  it("explicit CP936 labels keep the CP936 table", function () {
    for (const label of ["cp936", "windows-936", "ms936", 936, "euc-cn", "gb2312-1980"]) {
      expect(iconv.decode(utils.bytes("fe 50 80"), label), String(label)).toBe("\uFFFDP\u20AC")
      expect(utils.hex(iconv.encode("\u2E81\u20AC", label)), String(label)).toBe("3f 80")
    }
    expect(iconv.getCodec("gb2312")).not.toBe(iconv.getCodec("cp936"))
  })

  it("GB18030:2005 changes are applied", function () {
    // See https://github.com/whatwg/encoding/issues/22
    const chars = "\u1E3F\u0000\uE7C7"  // Use \u0000 as separator
    const gbkChars = utils.bytes("a8 bc 00 81 35 f4 37")
    expect(iconv.decode(gbkChars, "GB18030")).toBe(chars)
    expect(utils.hex(iconv.encode(chars, "GB18030"))).toBe(utils.hex(gbkChars))
  })
})
