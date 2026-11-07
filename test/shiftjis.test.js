import assert from "assert"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("ShiftJIS tests", function () {
  it("ShiftJIS correctly encoded/decoded", function () {
    var testString = "中文abc" // unicode contains ShiftJIS-code and ascii
    var testStringBig5Buffer = utils.bytes([0x92, 0x86, 0x95, 0xb6, 0x61, 0x62, 0x63])
    var testString2 = "測試"
    var testStringBig5Buffer2 = utils.bytes([0x91, 0xaa, 0x8e, 0x8e])

    assert.deepStrictEqual(iconv.encode(testString, "shiftjis"), testStringBig5Buffer)
    assert.strictEqual(iconv.decode(testStringBig5Buffer, "shiftjis"), testString)
    assert.deepStrictEqual(iconv.encode(testString2, "shiftjis"), testStringBig5Buffer2)
    assert.strictEqual(iconv.decode(testStringBig5Buffer2, "shiftjis"), testString2)
  })

  it("ShiftJIS extended chars are decoded, but not encoded", function () {
    var buf = utils.bytes("ed40eefceeef"); var str = "纊＂ⅰ"; var res = "fa 5c fa 57 fa 40" // repeated block (these same chars are repeated in the different place)
    var buf2 = utils.bytes("f040f2fcf940"); var str2 = ""; var res2 = "3f 3f 3f"   // non-repeated, UA block.

    assert.strictEqual(iconv.decode(buf, "shiftjis"), str)
    assert.strictEqual(iconv.decode(buf2, "shiftjis"), str2)

    assert.strictEqual(utils.hex(iconv.encode(str, "shiftjis")), res)
    assert.strictEqual(utils.hex(iconv.encode(str2, "shiftjis")), res2)
  })

  it("ShiftJIS includes extensions", function () {
    assert.strictEqual(iconv.decode(utils.bytes("8740"), "shiftjis"), "①")
    assert.strictEqual(utils.hex(iconv.encode("①", "shiftjis")), "87 40")
  })
})
