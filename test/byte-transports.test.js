"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()
const hex = utils.hex

// The byte-string transports (binary/base64/hex) mirror Buffer.from(str, enc)/buf.toString(enc):
// encode() parses the textual representation into bytes, decode() serializes bytes back to text.

describe("Binary codec #node-web", function () {
  it("maps bytes to U+0000..U+00FF 1:1", function () {
    const allBytes = []
    let str = ""
    for (let i = 0; i < 256; i++) {
      allBytes.push(i)
      str += String.fromCharCode(i)
    }
    assert.equal(iconv.decode(utils.bytes(allBytes), "binary"), str)
    assert.equal(hex(iconv.encode(str, "binary")), hex(utils.bytes(allBytes)))
  })

  it("encodes code points above U+00FF as their low byte, like Buffer", function () {
    assert.equal(hex(iconv.encode("Ā😱", "binary")), hex(utils.bytes("00 3d 31")))
  })
})

describe("Base64 codec #node-web", function () {
  it("encodes/decodes correctly", function () {
    assert.equal(hex(iconv.encode("aGVsbG8=", "base64")), hex(utils.bytes("68 65 6c 6c 6f")))
    assert.equal(iconv.decode(utils.bytes("68 65 6c 6c 6f"), "base64"), "aGVsbG8=")
  })

  it("ignores non-alphabet chars, like Node's forgiving parser", function () {
    assert.equal(hex(iconv.encode("aG Vs\nbG8=", "base64")), hex(utils.bytes("68 65 6c 6c 6f")))
  })

  it("drops a dangling char that doesn't complete a byte", function () {
    assert.equal(hex(iconv.encode("a", "base64")), hex(utils.bytes([])))
  })

  it("stops at the first '=' terminator, like Buffer", function () {
    assert.equal(hex(iconv.encode("aGVsbG8=extra", "base64")), hex(utils.bytes("68 65 6c 6c 6f")))
    const encoder = iconv.getEncoder("base64")
    const parts = [encoder.write("aGVsbG8="), encoder.write("more"), encoder.end()]
    assert.equal(hex(utils.concatBufs(parts.filter(Boolean))), hex(utils.bytes("68 65 6c 6c 6f")))
  })

  it("keeps quanta aligned across encoder chunks", function () {
    const encoder = iconv.getEncoder("base64")
    const parts = [encoder.write("aGV"), encoder.write("sb"), encoder.write("G8="), encoder.end()]
    assert.equal(hex(utils.concatBufs(parts.filter(Boolean))), hex(utils.bytes("68 65 6c 6c 6f")))
  })

  it("emits whole quanta incrementally when decoding chunks", function () {
    const decoder = iconv.getDecoder("base64")
    const input = utils.bytes("68 65 6c 6c 6f")
    let res = ""
    for (let i = 0; i < input.length; i++) { res += decoder.write(input.subarray(i, i + 1)) }
    res += decoder.end() || ""
    assert.equal(res, "aGVsbG8=")
  })
})

describe("Hex codec #node-web", function () {
  it("encodes/decodes correctly, accepting both digit cases", function () {
    assert.equal(hex(iconv.encode("A1fB", "hex")), hex(utils.bytes("a1 fb")))
    assert.equal(iconv.decode(utils.bytes("a1 fb"), "hex"), "a1fb")
  })

  it("stops parsing at the first invalid pair, like Buffer", function () {
    assert.equal(hex(iconv.encode("a1zz22", "hex")), hex(utils.bytes("a1")))
  })

  it("parses digits by their masked char code, like Buffer", function () {
    // U+0130 & 0xFF === 0x30 ("0"), so Buffer.from("İf", "hex") parses it as "0".
    assert.equal(hex(iconv.encode("İf", "hex")), hex(utils.bytes("0f")))
  })

  it("carries a pair split across encoder chunks", function () {
    const encoder = iconv.getEncoder("hex")
    const parts = [encoder.write("a1f"), encoder.write("b48"), encoder.write("656c"), encoder.end()]
    assert.equal(hex(utils.concatBufs(parts.filter(Boolean))), hex(utils.bytes("a1 fb 48 65 6c")))
  })
})
