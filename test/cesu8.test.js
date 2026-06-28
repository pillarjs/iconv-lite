"use strict"

const assert = require("assert")
const Buffer = require("buffer").Buffer
const iconv = require("../")

describe("CESU-8 codec", function () {
  it("encodes correctly", function () {
    assert.equal(iconv.encode("E", "cesu8").toString("hex"), "45")
    assert.equal(iconv.encode("¢", "cesu8").toString("hex"), "c2a2")
    assert.equal(iconv.encode("ȅ", "cesu8").toString("hex"), "c885")
    assert.equal(iconv.encode("€", "cesu8").toString("hex"), "e282ac")
    assert.equal(iconv.encode("𐐀", "cesu8").toString("hex"), "eda081edb080")
    assert.equal(iconv.encode("😱", "cesu8").toString("hex"), "eda0bdedb8b1")
    assert.equal(iconv.encode("a😱a", "cesu8").toString("hex"), "61eda0bdedb8b161")
    assert.equal(iconv.encode("😱😱", "cesu8").toString("hex"), "eda0bdedb8b1eda0bdedb8b1")
  })
  it("decodes correctly", function () {
    assert.equal(iconv.decode(Buffer.from("45", "hex"), "cesu8"), "E")
    assert.equal(iconv.decode(Buffer.from("c2a2", "hex"), "cesu8"), "¢")
    assert.equal(iconv.decode(Buffer.from("c885", "hex"), "cesu8"), "ȅ")
    assert.equal(iconv.decode(Buffer.from("e282ac", "hex"), "cesu8"), "€")
    assert.equal(iconv.decode(Buffer.from("eda081edb080", "hex"), "cesu8"), "𐐀")
    assert.equal(iconv.decode(Buffer.from("eda0bdedb8b1", "hex"), "cesu8"), "😱")
  })
})
