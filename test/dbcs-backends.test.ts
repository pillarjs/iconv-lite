import { expect } from "vitest"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

describe("DBCS backends", function () {
  const cases = [
    ["shiftjis", "中文abc", "92 86 95 b6 61 62 63"],
    ["eucjp", "日本", "c6 fc cb dc"],
    ["cp936", "中国abc", "d6 d0 b9 fa 61 62 63"],
    ["gbk", "中国abc", "d6 d0 b9 fa 61 62 63"],
    ["gb18030", "😱", "95 30 83 35"],
    ["cp949", "가나다", "b0 a1 b3 aa b4 d9"],
    ["cp950", "中文abc", "a4 a4 a4 e5 61 62 63"],
    ["big5hkscs", "Ê\u0304𠕇", "88 62 fa 40"]
  ]

  for (const [encoding, text, hex] of cases) {
    it(`encodes ${encoding} using the backend's byte type`, function () {
      const bytes = iconv.encode(text, encoding)
      expect(bytes.constructor).toBe(utils.BytesType)
      expect(utils.hex(bytes)).toBe(hex)
      const empty = iconv.encode("", encoding)
      expect(empty.constructor).toBe(utils.BytesType)
      expect(empty.length).toBe(0)
    })

    it(`decodes ${encoding} from an offset Uint8Array view`, function () {
      const bytes = utils.bytes(hex)
      const padded = new Uint8Array(bytes.length + 8).fill(0xff)
      padded.set(bytes, 4)
      expect(iconv.decode(padded.subarray(4, 4 + bytes.length), encoding)).toBe(text)
      expect(iconv.decode(new Uint8Array(0), encoding)).toBe("")
    })
  }

  for (const [encoding, text, hex] of [["big5", "Ê", "88 66"], ["gb18030", "\uD800", "3f"]] as const) {
    it(`flushes pending ${encoding} output using the backend's byte type`, function () {
      const encoder = iconv.getEncoder(encoding)
      const first = encoder.write(text)
      expect(first.constructor).toBe(utils.BytesType)
      expect(first.length).toBe(0)
      const tail = encoder.end()
      expect(tail!.constructor).toBe(utils.BytesType)
      expect(utils.hex(tail)).toBe(hex)
      expect(encoder.end()).toBe(undefined)
    })
  }

  it("replaces out-of-range GB18030 pointers on both backends", function () {
    expect(iconv.decode(utils.bytes("fe 39 fe 39"), "gb18030")).toBe("�")
  })

  it("keeps GBK encoding rules when decoding GB18030 sequences", function () {
    for (const encoding of ["gbk", "xgbk", "isoir58"]) {
      expect(iconv.decode(utils.bytes("95 30 83 35"), encoding)).toBe("😱")
      expect(utils.hex(iconv.encode("€😱", encoding))).toBe("80 3f")
      const calls: unknown[] = []
      const encoded = iconv.encode("€😱", encoding, {
        invalidCharHandler (char) { calls.push(char); return "!" }
      })
      expect(calls).toStrictEqual(["😱"])
      expect(utils.hex(encoded)).toBe("80 21")
    }
    expect(utils.hex(iconv.encode("€😱", "gb18030"))).toBe("a2 e3 95 30 83 35")
  })
})
