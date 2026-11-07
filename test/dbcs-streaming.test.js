import assert from "assert"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

describe("DBCS streaming #node-web", function () {
  const encodeCases = [
    ["big5", "Ê中", "88 66 a4 a4"],
    ["big5", "Ê𠕇", "88 66 fa 40"],
    ["big5", "Ê\uD800", "88 66 3f"],
    ["big5", "Ê\u0304", "88 62"],
    ["eucjp", "\uD800\u02D8", "3f 8f a2 af"],
    ["gb18030", "😱", "95 30 83 35"]
  ]

  for (const [encoding, text, expected] of encodeCases) {
    it(`encodes ${JSON.stringify(text)} as ${encoding} at every chunk boundary`, function () {
      for (let split = 0; split <= text.length; split++) {
        const encoder = iconv.getEncoder(encoding)
        const chunks = [encoder.write(text.slice(0, split)), encoder.write(""), encoder.write(text.slice(split))]
        const tail = encoder.end()
        if (tail) chunks.push(tail)
        assert.strictEqual(utils.hex(utils.concatBufs(chunks)), expected, `split at ${split}`)
        assert.strictEqual(encoder.end(), undefined)
      }
    })
  }

  const chunkedEncodeCases = [
    ["big5", ["Ê", "中", "ABC"], "88 66 a4 a4 41 42 43", "Ê中ABC"],
    ["big5", ["ê", "中"], "88 a7 a4 a4", "ê中"],
    ["gb18030", ["\uD884", "\uC240"], "3f 83 32 93 31", "?\uC240"]
  ]

  for (const [encoding, inputs, expected, decoded] of chunkedEncodeCases) {
    it(`preserves ${encoding} encoder output across chunks ${JSON.stringify(inputs)}`, function () {
      const encoder = iconv.getEncoder(encoding)
      const chunks = inputs.map(input => encoder.write(input))
      const tail = encoder.end()
      if (tail) chunks.push(tail)
      const output = utils.concatBufs(chunks)
      assert.strictEqual(utils.hex(output), expected)
      assert.strictEqual(iconv.decode(output, encoding), decoded)
      assert.strictEqual(encoder.end(), undefined)
    })
  }

  const decodeCases = [
    ["big5", "81", "�"],
    ["big5", "81 40", "�@"],
    ["big5", "81 81", "�"],
    ["big5", "87 87 40", "�@"],
    ["big5", "81 7f", "�\u007f"],
    ["big5", "87 80", "�"],
    ["big5", "87 ff", "�"],
    ["big5", "88 62", "Ê\u0304"],
    ["big5", "88 a5", "ê\u030C"],
    ["big5", "fa 40", "𠕇"],
    ["gb18030", "95 30 83 35", "😱"],
    ["gb18030", "82 31 82 20", "�1� "],
    ["gb18030", "82 31", "�"],
    ["gb18030", "82 31 82", "�"],
    ["gb18030", "81 30 ff 41", "�0�A"],
    ["gb18030", "81 30 81 ff 41", "�0�A"],
    ["cp936", "81 ff 41", "�A"],
    ["cp950", "a1 ff 41", "�A"],
    ["gbk", "d6 20", "� "],
    ["gbk", "81 ff", "�"],
    ["gbk", "95 30 83 35", "😱"],
    ["gbk", "82 31", "�"],
    ["gbk", "82 31 82", "�"],
    ["gbk", "82 31 82 20", "�1� "],
    ["gbk", "81 30 ff 41", "�0�A"],
    ["gbk", "81 30 81 ff 41", "�0�A"],
    ["gb18030", "81 ff", "�"],
    ["gb18030", "fe ff", "�"],
    ["shiftjis", "82 20", "� "],
    ["shiftjis", "81 00 41", "�\u0000A"],
    ["shiftjis", "82 9b 41", "�A"],
    ["shiftjis", "81 ad 41", "�A"],
    ["shiftjis", "81 e9 41 42", "�AB"],
    ["shiftjis", "85 81 41", "�A"],
    ["shiftjis", "eb 40", "�@"],
    ["eucjp", "8f a2 af", "\u02D8"],
    ["eucjp", "8f a2", "�"],
    ["eucjp", "8f a1", "�"],
    ["eucjp", "8f a2 ff 41", "�A"],
    ["eucjp", "8f a2 22 41", "�\"A"],
    ["eucjp", "8f a2 a1 41", "�A"],
    ["eucjp", "8f a1 a1 41", "�A"],
    ["eucjp", "8f fe fe 41", "�A"],
    ["eucjp", "8f a2 8e a4 a2", "�あ"],
    ["eucjp", "a1 22 41", "�\"A"],
    ["eucjp", "a1 ff 41", "�A"],
    ["eucjp", "8e e0 41", "�A"],
    ["eucjp", "a9 a1 41", "�A"],
    ["cp949", "b0 a1", "가"],
    ["cp949", "81 7f 41", "�\u007fA"],
    ["cp949", "a5 ab 41", "�A"],
    ["cp949", "81 80 41", "�A"],
    ["cp949", "c9 a1 41", "�A"]
  ]

  const leadBytes = [
    ["shiftjis", [[0x81, 0x9F], [0xE0, 0xFC]]],
    ["eucjp", [[0x8E, 0x8F], [0xA1, 0xFE]]],
    ["cp949", [[0x81, 0xFE]]],
    ["gbk", [[0x81, 0xFE]]],
    ["gb18030", [[0x81, 0xFE]]]
  ]

  for (const [encoding, ranges] of leadBytes) {
    it(`buffers every ${encoding} lead byte and consumes a non-ASCII trail byte with it`, function () {
      for (const [from, to] of ranges) {
        for (let lead = from; lead <= to; lead++) {
          const decoder = iconv.getDecoder(encoding)
          assert.strictEqual(decoder.write(utils.bytes([lead])), "", `lead ${lead.toString(16)}`)
          assert.strictEqual(decoder.end(), "�")
          assert.strictEqual(iconv.decode(utils.bytes([lead, 0xFF, 0x41]), encoding), "�A", `lead ${lead.toString(16)}`)
        }
      }
    })
  }

  it("buffers every Big5 lead byte until a trail byte or end-of-input", function () {
    for (let lead = 0x81; lead <= 0xFE; lead++) {
      const decoder = iconv.getDecoder("big5")
      assert.strictEqual(decoder.write(utils.bytes([lead])), "", `lead ${lead.toString(16)}`)
      assert.strictEqual(decoder.write(utils.bytes([])), "")
      assert.strictEqual(decoder.end(), "�")
      assert.strictEqual(decoder.end(), "")
    }
  })

  it("buffers every EUC-JP JIS X 0212 row until its third byte", function () {
    for (let row = 0xA1; row <= 0xFE; row++) {
      const decoder = iconv.getDecoder("eucjp")
      assert.strictEqual(decoder.write(utils.bytes([0x8F, row])), "", `row ${row.toString(16)}`)
      assert.strictEqual(decoder.write(utils.bytes([0xFF, 0x41])), "�A")
      assert.strictEqual(decoder.end(), "")
    }
  })

  for (const [encoding, pending, valid, expected] of [
    ["gb18030", "82 31 82", "95 30 83 35", "😱"],
    ["gbk", "82 31 82", "95 30 83 35", "😱"],
    ["eucjp", "8f a2", "a4 a2", "あ"]
  ]) {
    it(`resets ${encoding} after replacing an incomplete sequence once`, function () {
      const decoder = iconv.getDecoder(encoding)
      assert.strictEqual(decoder.write(utils.bytes(pending)), "")
      assert.strictEqual(decoder.end(), "�")
      assert.strictEqual(decoder.end(), "")
      assert.strictEqual(decoder.write(utils.bytes(valid)), expected)
      assert.strictEqual(decoder.end(), "")
    })
  }

  for (const [encoding, hex, expected] of decodeCases) {
    it(`decodes ${hex} as ${encoding} while the caller reuses its input buffer`, function () {
      const decoder = iconv.getDecoder(encoding)
      const chunk = new Uint8Array(1)
      let actual = ""
      for (const byte of utils.bytes(hex)) {
        chunk[0] = byte
        actual += decoder.write(chunk)
        chunk[0] = 0xff
        assert.strictEqual(decoder.write(new Uint8Array(0)), "")
      }
      assert.strictEqual(actual + decoder.end(), expected)
      assert.strictEqual(decoder.end(), "")
    })

    it(`decodes ${hex} as ${encoding} at every chunk boundary`, function () {
      const input = utils.bytes(hex)
      for (let split = 0; split <= input.length; split++) {
        const decoder = iconv.getDecoder(encoding)
        const actual = decoder.write(input.subarray(0, split)) + decoder.write(new Uint8Array(0)) +
          decoder.write(input.subarray(split)) + decoder.end()
        assert.strictEqual(actual, expected, `split at ${split}`)
        assert.strictEqual(decoder.end(), "")
      }
    })
  }
})

describe("DBCS exhaustive two-byte chunk boundaries #node-web", function () {
  this.timeout(30000)
  for (const encoding of ["shiftjis", "eucjp", "cp936", "gbk", "gb18030", "cp949", "cp950", "big5hkscs"]) {
    it(`decodes ${encoding} identically when split`, function () {
      const bytes = utils.bytes([0, 0])
      for (let b1 = 0x81; b1 <= 0xFE; b1++) {
        bytes[0] = b1
        for (let b2 = 0x00; b2 <= 0xFF; b2++) {
          bytes[1] = b2
          const whole = iconv.decode(bytes, encoding)
          const decoder = iconv.getDecoder(encoding)
          const split = decoder.write(bytes.subarray(0, 1)) + decoder.write(bytes.subarray(1)) + decoder.end()
          if (split !== whole) assert.fail(`${utils.hex(bytes)}: whole ${utils.strToHex(whole)}, split ${utils.strToHex(split)}`)
        }
      }
    })
  }
})
