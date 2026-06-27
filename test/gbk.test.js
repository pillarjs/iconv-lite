"use strict"

var { describe, it } = require("node:test")
var fs = require("fs")
var assert = require("assert")
var Buffer = require("buffer").Buffer
var join = require("path").join
var iconv = require("../")

var testString = "中国abc" // unicode contains GBK-code and ascii
var testStringGBKBuffer = Buffer.from([0xd6, 0xd0, 0xb9, 0xfa, 0x61, 0x62, 0x63])

describe("GBK tests", function () {
  it("GBK correctly encoded/decoded", function () {
    assert.strictEqual(iconv.encode(testString, "GBK").toString("binary"), testStringGBKBuffer.toString("binary"))
    assert.strictEqual(iconv.decode(testStringGBKBuffer, "GBK"), testString)
  })

  it("GB2312 correctly encoded/decoded", function () {
    assert.strictEqual(iconv.encode(testString, "GB2312").toString("binary"), testStringGBKBuffer.toString("binary"))
    assert.strictEqual(iconv.decode(testStringGBKBuffer, "GB2312"), testString)
  })

  it("GBK file read decoded,compare with iconv result", function (t) {
    try {
      require("iconv")
    } catch (_e) {
      return t.skip()
    }
    var contentBuffer = fs.readFileSync(join(__dirname, "/gbkFile.txt"))
    var str = iconv.decode(contentBuffer, "GBK")
    var iconvc = new (require("iconv").Iconv)("GBK", "utf8")
    assert.strictEqual(iconvc.convert(contentBuffer).toString(), str)
  })

  it("GBK correctly decodes and encodes characters · and ×", function () {
    // https://github.com/ashtuchkin/iconv-lite/issues/13
    // Reference: http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP936.TXT
    var chars = "·×"
    var gbkChars = Buffer.from([0xA1, 0xA4, 0xA1, 0xC1])
    assert.strictEqual(iconv.encode(chars, "GBK").toString("binary"), gbkChars.toString("binary"))
    assert.strictEqual(iconv.decode(gbkChars, "GBK"), chars)
  })

  it("GBK and GB18030 correctly decodes and encodes Euro character", function () {
    // Euro character (U+20AC) has two encodings in GBK family: 0x80 and 0xA2 0xE3
    // According to W3C's technical recommendation (https://www.w3.org/TR/encoding/#gbk-encoder),
    // Both GBK and GB18030 decoders should accept both encodings.
    var gbkEuroEncoding1 = Buffer.from([0x80])
    var gbkEuroEncoding2 = Buffer.from([0xA2, 0xE3])
    var strEuro = "€"

    assert.strictEqual(iconv.decode(gbkEuroEncoding1, "GBK"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding2, "GBK"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding1, "GB18030"), strEuro)
    assert.strictEqual(iconv.decode(gbkEuroEncoding2, "GB18030"), strEuro)

    // But when decoding, GBK should produce 0x80, but GB18030 - 0xA2 0xE3.
    assert.strictEqual(iconv.encode(strEuro, "GBK").toString("hex"), gbkEuroEncoding1.toString("hex"))
    assert.strictEqual(iconv.encode(strEuro, "GB18030").toString("hex"), gbkEuroEncoding2.toString("hex"))
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

  function swapBytes (buf) { for (var i = 0; i < buf.length; i += 2) buf.writeUInt16LE(buf.readUInt16BE(i), i); return buf }
  function spacify4 (str) { return str.replace(/(....)/g, "$1 ").trim() }
  function strToHex (str) { return spacify4(swapBytes(Buffer.from(str, "ucs2")).toString("hex")) }

  it("GB18030 encodes/decodes 4 byte sequences", function () {
    var chars = {
      "\u0080": Buffer.from([0x81, 0x30, 0x81, 0x30]),
      "\u0081": Buffer.from([0x81, 0x30, 0x81, 0x31]),
      "\u008b": Buffer.from([0x81, 0x30, 0x82, 0x31]),
      "\u0615": Buffer.from([0x81, 0x31, 0x82, 0x31]),
      // eslint-disable-next-line
      "\u399f": Buffer.from([0x82, 0x31, 0x82, 0x31]),
      "\udbd9\ude77": Buffer.from([0xE0, 0x31, 0x82, 0x31])
    }
    for (var uChar in chars) {
      var gbkBuf = chars[uChar]
      assert.strictEqual(iconv.encode(uChar, "GB18030").toString("hex"), gbkBuf.toString("hex"))
      assert.strictEqual(strToHex(iconv.decode(gbkBuf, "GB18030")), strToHex(uChar))
    }
  })

  it("GB18030 correctly decodes incomplete 4 byte sequences", function () {
    var chars = {
      "�": Buffer.from([0x82]),
      "�1": Buffer.from([0x82, 0x31]),
      "�1�": Buffer.from([0x82, 0x31, 0x82]),
      // eslint-disable-next-line
      "\u399f": Buffer.from([0x82, 0x31, 0x82, 0x31]),
      "� ": Buffer.from([0x82, 0x20]),
      "�1 ": Buffer.from([0x82, 0x31, 0x20]),
      "�1� ": Buffer.from([0x82, 0x31, 0x82, 0x20]),
      "\u399f ": Buffer.from([0x82, 0x31, 0x82, 0x31, 0x20]),
      "�1\u4fdb": Buffer.from([0x82, 0x31, 0x82, 0x61]),
      "�1\u5010\u0061": Buffer.from([0x82, 0x31, 0x82, 0x82, 0x61]),
      // eslint-disable-next-line
      '\u399f\u4fdb': Buffer.from([0x82, 0x31, 0x82, 0x31, 0x82, 0x61]),
      "�1\u50101�1": Buffer.from([0x82, 0x31, 0x82, 0x82, 0x31, 0x82, 0x31])
    }
    for (var uChar in chars) {
      var gbkBuf = chars[uChar]
      assert.strictEqual(strToHex(iconv.decode(gbkBuf, "GB18030")), strToHex(uChar))
    }
  })

  it("GB18030:2005 changes are applied", function () {
    // See https://github.com/whatwg/encoding/issues/22
    var chars = "\u1E3F\u0000\uE7C7"  // Use \u0000 as separator
    var gbkChars = Buffer.from([0xA8, 0xBC, 0x00, 0x81, 0x35, 0xF4, 0x37])
    assert.strictEqual(iconv.decode(gbkChars, "GB18030"), chars)
    assert.strictEqual(iconv.encode(chars, "GB18030").toString("hex"), gbkChars.toString("hex"))
  })
})
