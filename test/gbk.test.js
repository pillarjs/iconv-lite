import assert from "assert"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

var testString = "中国abc" // unicode contains GBK-code and ascii
var testStringGBKBuffer = utils.bytes("d6 d0 b9 fa 61 62 63")

describe("GBK tests #node-web", function () {
  it("GBK correctly encoded/decoded", function () {
    assert.strictEqual(utils.hex(iconv.encode(testString, "GBK")), utils.hex(testStringGBKBuffer))
    assert.strictEqual(iconv.decode(testStringGBKBuffer, "GBK"), testString)
  })

  it("GB2312 correctly encoded/decoded", function () {
    assert.strictEqual(utils.hex(iconv.encode(testString, "GB2312")), utils.hex(testStringGBKBuffer))
    assert.strictEqual(iconv.decode(testStringGBKBuffer, "GB2312"), testString)
  })

  it("GBK correctly decodes and encodes characters · and ×", function () {
    // https://github.com/ashtuchkin/iconv-lite/issues/13
    // Reference: http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP936.TXT
    var chars = "·×"
    var gbkChars = utils.bytes("a1 a4 a1 c1")
    assert.strictEqual(utils.hex(iconv.encode(chars, "GBK")), utils.hex(gbkChars))
    assert.strictEqual(iconv.decode(gbkChars, "GBK"), chars)
  })

  it("GBK and GB18030 correctly decodes and encodes Euro character", function () {
    // Euro character (U+20AC) has two encodings in GBK family: 0x80 and 0xA2 0xE3
    // According to W3C's technical recommendation (https://www.w3.org/TR/encoding/#gbk-encoder),
    // Both GBK and GB18030 decoders should accept both encodings.
    var gbkEuroEncoding1 = utils.bytes("80")
    var gbkEuroEncoding2 = utils.bytes("a2 e3")
    var strEuro = "€"

    assert.strictEqual(iconv.decode(gbkEuroEncoding1, "GBK"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding2, "GBK"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding1, "GB18030"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding2, "GB18030"), strEuro)

    // GBK encodes the euro sign as 0x80, while GB18030 uses 0xA2 0xE3.
    assert.strictEqual(utils.hex(iconv.encode(strEuro, "GBK")), utils.hex(gbkEuroEncoding1))
    assert.strictEqual(utils.hex(iconv.encode(strEuro, "GB18030")), utils.hex(gbkEuroEncoding2))
  })

  it("GB18030 findIdx works correctly", function () {
    function findIdxAlternative (table, val) {
      for (var i = 0; i < table.length; i++) {
        if (table[i] > val) { return i - 1 }
      }
      return table.length - 1
    }

    var codec = iconv.getEncoder("gb18030")

    for (var i = 0; i < 0x100; i++) { assert.strictEqual(codec.findIdx(codec.gb18030.uChars, i), findIdxAlternative(codec.gb18030.uChars, i), i) }

    var tests = [0xFFFF, 0x10000, 0x10001, 0x30000]
    for (var i = 0; i < tests.length; i++) { assert.strictEqual(codec.findIdx(codec.gb18030.uChars, tests[i]), findIdxAlternative(codec.gb18030.uChars, tests[i]), tests[i]) }
  })

  it("GB18030 encodes/decodes 4 byte sequences", function () {
    var chars = {
      "\u0080": utils.bytes("81 30 81 30"),
      "\u0081": utils.bytes("81 30 81 31"),
      "\u008b": utils.bytes("81 30 82 31"),
      "\u0615": utils.bytes("81 31 82 31"),
      // eslint-disable-next-line
      "\u399f": utils.bytes("82 31 82 31"),
      "\udbd9\ude77": utils.bytes("e0 31 82 31")
    }
    for (var uChar in chars) {
      var gbkBuf = chars[uChar]
      assert.strictEqual(utils.hex(iconv.encode(uChar, "GB18030")), utils.hex(gbkBuf))
      assert.strictEqual(utils.strToHex(iconv.decode(gbkBuf, "GB18030")), utils.strToHex(uChar))
    }
  })

  it("GB18030 correctly decodes incomplete 4 byte sequences", function () {
    for (const bytes of [[0x82], [0x82, 0x31], [0x82, 0x31, 0x82]]) {
      assert.strictEqual(iconv.decode(utils.bytes(bytes), "GB18030"), "�")
    }
    var chars = {
      // eslint-disable-next-line
      "\u399f": utils.bytes("82 31 82 31"),
      "� ": utils.bytes("82 20"),
      "�1 ": utils.bytes("82 31 20"),
      "�1� ": utils.bytes("82 31 82 20"),
      "\u399f ": utils.bytes("82 31 82 31 20"),
      "�1\u4fdb": utils.bytes("82 31 82 61"),
      "�1\u5010\u0061": utils.bytes("82 31 82 82 61"),
      // eslint-disable-next-line
      '\u399f\u4fdb': utils.bytes("82 31 82 31 82 61"),
      "�1\u50101�": utils.bytes("82 31 82 82 31 82 31")
    }
    for (var uChar in chars) {
      var gbkBuf = chars[uChar]
      assert.strictEqual(utils.strToHex(iconv.decode(gbkBuf, "GB18030")), utils.strToHex(uChar))
    }
  })

  it("GB18030:2005 changes are applied", function () {
    // See https://github.com/whatwg/encoding/issues/22
    var chars = "\u1E3F\u0000\uE7C7"  // Use \u0000 as separator
    var gbkChars = utils.bytes("a8 bc 00 81 35 f4 37")
    assert.strictEqual(iconv.decode(gbkChars, "GB18030"), chars)
    assert.strictEqual(utils.hex(iconv.encode(chars, "GB18030")), utils.hex(gbkChars))
  })
})
