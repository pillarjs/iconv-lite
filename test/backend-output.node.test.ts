import assert from "node:assert/strict"
import backend from "../backends/node.js"

describe("Node backend byte output", function () {
  for (const length of [0, 1, 31, 64, 65, 1023, 1024, 1025]) {
    it(`initializes all ${length} bytes and returns only the written prefix`, function () {
      const filled = backend.allocBytes(length, 0xA5)
      assert.deepEqual(filled, Buffer.alloc(length, 0xA5))
      const bytes = backend.allocBytes(length, undefined)
      assert.deepEqual(bytes, Buffer.alloc(length))
      const written = Math.min(length, 3)
      for (let i = 0; i < written; i++) bytes[i] = 0x80 + i
      const result = backend.bytesToResult(bytes, written)
      assert.ok(Buffer.isBuffer(result))
      assert.deepEqual(result, Buffer.from([0x80, 0x81, 0x82].slice(0, written)))
      assert.equal(backend.bytesToResult(bytes, 0).buffer.byteLength, 0)
      // Later allocations must not reuse bytes still owned by a returned result.
      for (let i = 0; i < 20; i++) backend.allocBytes(1024, 0xFF)
      assert.deepEqual(result, Buffer.from([0x80, 0x81, 0x82].slice(0, written)))
    })
  }
})

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
