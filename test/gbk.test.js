import { createRequire } from "node:module"
import fs from "fs"
import assert from "assert"
import { Buffer } from "buffer"
import { join } from "path"
import iconv from "../lib/index-node.js"
const require = createRequire(import.meta.url)

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

  it("GBK file read decoded,compare with iconv result", function () {
    try {
      require("iconv")
    } catch (_e) {
      this.skip()
    }
    var contentBuffer = fs.readFileSync(join(import.meta.dirname, "fixtures", "gbkFile.txt"))
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
    for (const bytes of [[0x82], [0x82, 0x31], [0x82, 0x31, 0x82]]) {
      assert.strictEqual(iconv.decode(Buffer.from(bytes), "GB18030"), "�")
    }
    var chars = {
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
      "�1\u50101�": Buffer.from([0x82, 0x31, 0x82, 0x82, 0x31, 0x82, 0x31])
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

  // The WHATWG gb18030 encoder has an asymmetric side table that keeps the
  // GB18030-2005 two-byte encodings of these PUA code points even though index
  // gb18030 maps the same bytes to other (GB18030-2022) code points.
  // https://encoding.spec.whatwg.org/#gb18030-encoder
  var encoderTable = {
    "\uE78D": 0xA6D9,
    "\uE78E": 0xA6DA,
    "\uE78F": 0xA6DB,
    "\uE790": 0xA6DC,
    "\uE791": 0xA6DD,
    "\uE792": 0xA6DE,
    "\uE793": 0xA6DF,
    "\uE794": 0xA6EC,
    "\uE795": 0xA6ED,
    "\uE796": 0xA6F3,
    "\uE81E": 0xFE59,
    "\uE826": 0xFE61,
    "\uE82B": 0xFE66,
    "\uE82C": 0xFE67,
    "\uE832": 0xFE6D,
    "\uE843": 0xFE7E,
    "\uE854": 0xFE90,
    "\uE864": 0xFEA0
  }

  it("GB18030 encoder applies the WHATWG asymmetric encoder table", function () {
    var encoded = {}
    for (var uChar in encoderTable) {
      var expected = encoderTable[uChar]
      var actual = iconv.encode(uChar, "GB18030")
      assert.strictEqual(actual.length, 2, "expected two bytes for " + strToHex(uChar))
      assert.strictEqual(actual[0], expected >> 8, "lead byte for " + strToHex(uChar))
      assert.strictEqual(actual[1], expected & 0xFF, "trail byte for " + strToHex(uChar))
      assert.strictEqual(encoded[expected], undefined, "duplicate encoding for " + strToHex(uChar))
      encoded[expected] = uChar
    }

    // The table is asymmetric on purpose: decoding the two-byte form yields the
    // code point that index gb18030 assigns to those bytes, not the input.
    assert.strictEqual(iconv.decode(Buffer.from([0xA6, 0xD9]), "GB18030"), "\uFE10")
    assert.strictEqual(iconv.decode(Buffer.from([0xFE, 0x67]), "GB18030"), "\u9FB7")
  })

  it("GB18030 encoder no longer collapses U+E78D and U+E82C into identical bytes", function () {
    // Both of these used to encode to the same 83 36 cb 32 four-byte sequence.
    assert.notStrictEqual(
      iconv.encode("\uE78D", "GB18030").toString("hex"),
      iconv.encode("\uE82C", "GB18030").toString("hex")
    )
    assert.strictEqual(iconv.encode("\uE78D", "GB18030").toString("hex"), "a6d9")
    assert.strictEqual(iconv.encode("\uE82C", "GB18030").toString("hex"), "fe67")
  })

  it("GB18030 handler encoder applies the asymmetric encoder table", function () {
    for (var uChar in encoderTable) {
      assert.strictEqual(
        iconv.encode(uChar, "GB18030", {
          invalidCharHandler () { assert.fail("representable character") }
        }).toString("hex"),
        ("000" + encoderTable[uChar].toString(16)).slice(-4)
      )
    }
  })

  it("GB18030 encoder treats U+E5E5 as an encoder error", function () {
    // https://encoding.spec.whatwg.org/#gb18030-encoder step 3: U+E5E5 is not
    // encodable because index gb18030 maps 0xA3 0xA0 to U+3000. It used to
    // encode to 83 39 b1 36, which decodes to an unrelated U+F5F9.
    var defaultByte = Buffer.from(iconv.defaultCharSingleByte).toString("hex")
    assert.strictEqual(iconv.encode("\uE5E5", "GB18030").toString("hex"), defaultByte)

    var calls = []
    assert.strictEqual(
      iconv.encode("A\uE5E5B", "GB18030", {
        invalidCharHandler (char, index) { calls.push([char, index]); return undefined }
      }).toString("hex"),
      "41" + defaultByte + "42"
    )
    assert.deepEqual(calls, [["\uE5E5", 1]])
  })
})
