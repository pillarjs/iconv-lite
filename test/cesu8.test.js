import assert from "assert"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("CESU-8 codec", function () {
  it("encodes correctly", function () {
    assert.equal(utils.hex(iconv.encode("E", "cesu8")), "45")
    assert.equal(utils.hex(iconv.encode("¢", "cesu8")), "c2 a2")
    assert.equal(utils.hex(iconv.encode("ȅ", "cesu8")), "c8 85")
    assert.equal(utils.hex(iconv.encode("€", "cesu8")), "e2 82 ac")
    assert.equal(utils.hex(iconv.encode("𐐀", "cesu8")), "ed a0 81 ed b0 80")
    assert.equal(utils.hex(iconv.encode("😱", "cesu8")), "ed a0 bd ed b8 b1")
    assert.equal(utils.hex(iconv.encode("a😱a", "cesu8")), "61 ed a0 bd ed b8 b1 61")
    assert.equal(utils.hex(iconv.encode("😱😱", "cesu8")), "ed a0 bd ed b8 b1 ed a0 bd ed b8 b1")
  })
  it("decodes correctly", function () {
    assert.equal(iconv.decode(utils.bytes("45"), "cesu8"), "E")
    assert.equal(iconv.decode(utils.bytes("c2a2"), "cesu8"), "¢")
    assert.equal(iconv.decode(utils.bytes("c885"), "cesu8"), "ȅ")
    assert.equal(iconv.decode(utils.bytes("e282ac"), "cesu8"), "€")
    assert.equal(iconv.decode(utils.bytes("eda081edb080"), "cesu8"), "𐐀")
    assert.equal(iconv.decode(utils.bytes("eda0bdedb8b1"), "cesu8"), "😱")
  })
})
