"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
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

  const decodeCases = [
    ["big5", "88 62", "Ê\u0304"],
    ["big5", "88 a5", "ê\u030C"],
    ["big5", "fa 40", "𠕇"],
    ["gb18030", "95 30 83 35", "😱"],
    ["gb18030", "82 31 82 20", "�1� "],
    ["gb18030", "82 31 82", "�1�"],
    ["gbk", "d6 20", "� "],
    ["shiftjis", "82 20", "� "],
    ["eucjp", "8f a2 af", "\u02D8"],
    ["cp949", "b0 a1", "가"]
  ]

  for (const [encoding, hex, expected] of decodeCases) {
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
