"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()
const hex = utils.hex

describe("UTF-8 codec #node-web", function () {
  it("encodes/decodes basic strings correctly", function () {
    const testStr = "1aя中文☃💩"
    const testBytes = utils.bytes("31 61 d1 8f e4 b8 ad e6 96 87 e2 98 83 f0 9f 92 a9")
    assert.equal(hex(iconv.encode(testStr, "utf8")), hex(testBytes))
    assert.equal(iconv.decode(testBytes, "utf8"), testStr)
  })

  it("encodes a lone surrogate as U+FFFD", function () {
    assert.equal(hex(iconv.encode("a\uD800b", "utf8")), hex(utils.bytes("61 ef bf bd 62")))
    assert.equal(hex(iconv.encode("\uDC00", "utf8")), hex(utils.bytes("ef bf bd")))
  })

  it("strips the BOM only by default", function () {
    const withBOM = utils.bytes("ef bb bf 41")
    assert.equal(iconv.decode(withBOM, "utf8"), "A")
    assert.equal(iconv.decode(withBOM, "utf8", { stripBOM: false }), "\uFEFFA")
  })

  it("replaces ill-formed sequences by default and throws in fatal mode", function () {
    const invalid = utils.bytes("ff fe fd")
    assert.equal(iconv.decode(invalid, "utf8"), "���")
    assert.throws(function () { iconv.decode(invalid, "utf8", { fatal: true }) })
  })
})
