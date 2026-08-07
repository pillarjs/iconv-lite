"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()
const hex = utils.hex

describe("CESU-8 codec #node-web", function () {
  it("encodes correctly", function () {
    assert.equal(hex(iconv.encode("E", "cesu8")), hex(utils.bytes("45")))
    assert.equal(hex(iconv.encode("¢", "cesu8")), hex(utils.bytes("c2a2")))
    assert.equal(hex(iconv.encode("ȅ", "cesu8")), hex(utils.bytes("c885")))
    assert.equal(hex(iconv.encode("€", "cesu8")), hex(utils.bytes("e282ac")))
    assert.equal(hex(iconv.encode("𐐀", "cesu8")), hex(utils.bytes("eda081edb080")))
    assert.equal(hex(iconv.encode("😱", "cesu8")), hex(utils.bytes("eda0bdedb8b1")))
    assert.equal(hex(iconv.encode("a😱a", "cesu8")), hex(utils.bytes("61eda0bdedb8b161")))
    assert.equal(hex(iconv.encode("😱😱", "cesu8")), hex(utils.bytes("eda0bdedb8b1eda0bdedb8b1")))
  })

  it("decodes correctly", function () {
    assert.equal(iconv.decode(utils.bytes("45"), "cesu8"), "E")
    assert.equal(iconv.decode(utils.bytes("c2a2"), "cesu8"), "¢")
    assert.equal(iconv.decode(utils.bytes("c885"), "cesu8"), "ȅ")
    assert.equal(iconv.decode(utils.bytes("e282ac"), "cesu8"), "€")
    assert.equal(iconv.decode(utils.bytes("eda081edb080"), "cesu8"), "𐐀")
    assert.equal(iconv.decode(utils.bytes("eda0bdedb8b1"), "cesu8"), "😱")
  })

  it("replaces ill-formed input with U+FFFD by default", function () {
    // Overlong 2-byte and 3-byte encodings.
    assert.equal(iconv.decode(utils.bytes("c1bf"), "cesu8"), "�")
    assert.equal(iconv.decode(utils.bytes("e08080"), "cesu8"), "�")
    // A 4-byte lead is ill-formed in CESU-8 (UTR #26 encodes supplementary chars as surrogate
    // pairs); its continuation bytes are then each unexpected.
    assert.equal(iconv.decode(utils.bytes("f09f98b1"), "cesu8"), "����")
    // Unexpected continuation byte.
    assert.equal(iconv.decode(utils.bytes("8041"), "cesu8"), "�A")
    // Aborted sequence followed by a new character.
    assert.equal(iconv.decode(utils.bytes("e28241"), "cesu8"), "�A")
  })

  it("accepts Modified UTF-8's NULL (C0 80)", function () {
    assert.equal(iconv.decode(utils.bytes("c080"), "cesu8"), "\u0000")
  })

  it("passes a lone surrogate half through", function () {
    assert.equal(iconv.decode(utils.bytes("eda0bd"), "cesu8"), "\ud83d")
  })

  it("replaces a sequence truncated at end of input", function () {
    assert.equal(iconv.decode(utils.bytes("e282"), "cesu8"), "�")
    assert.equal(iconv.decode(utils.bytes("41c2"), "cesu8"), "A�")
  })

  it("decodes sequences split across chunks", function () {
    const decoder = iconv.getDecoder("cesu8")
    const bytes = utils.bytes("61eda0bdedb8b162") // "a😱b"
    let res = ""
    for (let i = 0; i < bytes.length; i++) { res += decoder.write(bytes.subarray(i, i + 1)) }
    res += decoder.end() || ""
    assert.equal(res, "a😱b")
  })

  it("throws on ill-formed input in fatal mode", function () {
    assert.throws(function () { iconv.decode(utils.bytes("c1bf"), "cesu8", { fatal: true }) })
    assert.throws(function () { iconv.decode(utils.bytes("e282"), "cesu8", { fatal: true }) }) // Truncated at end.
    assert.equal(iconv.decode(utils.bytes("e282ac"), "cesu8", { fatal: true }), "€")
  })
})
