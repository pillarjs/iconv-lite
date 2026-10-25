"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()

describe("DBCS backends #node-web", function () {
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
      assert.strictEqual(bytes.constructor, utils.BytesType)
      assert.strictEqual(utils.hex(bytes), hex)
      const empty = iconv.encode("", encoding)
      assert.strictEqual(empty.constructor, utils.BytesType)
      assert.strictEqual(empty.length, 0)
    })

    it(`decodes ${encoding} from an offset Uint8Array view`, function () {
      const bytes = utils.bytes(hex)
      const padded = new Uint8Array(bytes.length + 8).fill(0xff)
      padded.set(bytes, 4)
      assert.strictEqual(iconv.decode(padded.subarray(4, 4 + bytes.length), encoding), text)
      assert.strictEqual(iconv.decode(new Uint8Array(0), encoding), "")
    })
  }

  for (const [encoding, text, hex] of [["big5", "Ê", "88 66"], ["gb18030", "\uD800", "3f"]]) {
    it(`flushes pending ${encoding} output using the backend's byte type`, function () {
      const encoder = iconv.getEncoder(encoding)
      const first = encoder.write(text)
      assert.strictEqual(first.constructor, utils.BytesType)
      assert.strictEqual(first.length, 0)
      const tail = encoder.end()
      assert.strictEqual(tail.constructor, utils.BytesType)
      assert.strictEqual(utils.hex(tail), hex)
      assert.strictEqual(encoder.end(), undefined)
    })
  }

  it("preserves legacy GB18030 output for out-of-range pointers on both backends", function () {
    // Unicode validation is separate from changing the codec's allocation backend.
    assert.strictEqual(iconv.decode(utils.bytes("fe 39 fe 39"), "gb18030"), "\uDD55\uDF47")
  })
})
