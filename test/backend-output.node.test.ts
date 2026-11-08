import assert from "node:assert/strict"
import backend from "../backends/node.js"

describe("Node backend character output", function () {
  for (const length of [0, 1, 8, 31, 32, 33, 64, 90000]) {
    it(`preserves ${length} UTF-16 code units, including NUL, BOM and lone surrogates`, function () {
      const pattern = "\0\uFEFF中😱\uD800x\uDC00"
      const expected = pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length)
      const chars = backend.allocRawChars(length)
      for (let i = 0; i < length; i++) chars[i] = expected.charCodeAt(i)
      assert.equal(backend.rawCharsToResult(chars, length), expected)
    })
  }

  for (const capacity of [8, 31, 32, 33, 64]) {
    it(`reads only the written prefix of an offset view with capacity ${capacity}`, function () {
      const backing = new Uint16Array(capacity + 4).fill(0xffff)
      const chars = backing.subarray(2, capacity + 2)
      chars.set([0xfeff, 0, 0xd83d, 0xde31, 0xd800, 0x61, 0xdc00])
      const snapshot = backing.slice()
      assert.equal(backend.rawCharsToResult(chars, 0), "")
      assert.equal(backend.rawCharsToResult(chars, 3), "\uFEFF\0\uD83D")
      assert.equal(backend.rawCharsToResult(chars, 7), "\uFEFF\0😱\uD800a\uDC00")
      assert.deepEqual(backing, snapshot)
    })
  }
})
