"use strict"

var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

var testStr = "1aя中文☃💩"
var testStr2 = "❝Stray high \uD977😱 and low\uDDDD☔ surrogate values.❞"
var utf32leBuf = Buffer.from([0x31, 0x00, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00, 0x4F, 0x04, 0x00, 0x00,
  0x2D, 0x4E, 0x00, 0x00, 0x87, 0x65, 0x00, 0x00, 0x03, 0x26, 0x00, 0x00, 0xA9, 0xF4, 0x01, 0x00])
var utf32beBuf = Buffer.from([0x00, 0x00, 0x00, 0x31, 0x00, 0x00, 0x00, 0x61, 0x00, 0x00, 0x04, 0x4F,
  0x00, 0x00, 0x4E, 0x2D, 0x00, 0x00, 0x65, 0x87, 0x00, 0x00, 0x26, 0x03, 0x00, 0x01, 0xF4, 0xA9])
var utf32leBOM = Buffer.from([0xFF, 0xFE, 0x00, 0x00])
var utf32beBOM = Buffer.from([0x00, 0x00, 0xFE, 0xFF])
var utf32leBufWithBOM = Buffer.concat([utf32leBOM, utf32leBuf])
var utf32beBufWithBOM = Buffer.concat([utf32beBOM, utf32beBuf])
var utf32leBufWithInvalidChar = Buffer.concat([utf32leBuf, Buffer.from([0x12, 0x34, 0x56, 0x78])])
var utf32beBufWithInvalidChar = Buffer.concat([utf32beBuf, Buffer.from([0x12, 0x34, 0x56, 0x78])])
var sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<俄语>данные</俄语>"

var fromCodePoint = String.fromCodePoint

if (!fromCodePoint) {
  fromCodePoint = function (cp) {
    if (cp < 0x10000) { return String.fromCharCode(cp) }

    cp -= 0x10000

    return String.fromCharCode(0xD800 | (cp >> 10)) +
               String.fromCharCode(0xDC00 + (cp & 0x3FF))
  }
}

var allCharsStr = ""
var allCharsLEBuf = Buffer.alloc(0x10F800 * 4)
var allCharsBEBuf = Buffer.alloc(0x10F800 * 4)
var skip = 0

for (var i = 0; i <= 0x10F7FF; ++i) {
  if (i === 0xD800) { skip = 0x800 }

  var cp = i + skip
  allCharsStr += fromCodePoint(cp)
  allCharsLEBuf.writeUInt32LE(cp, i * 4)
  allCharsBEBuf.writeUInt32BE(cp, i * 4)
}

describe("UTF-32LE codec", function () {
  var Iconv

  try {
    Iconv = require("iconv").Iconv
  } catch (_e) {}

  it("encodes basic strings correctly", function () {
    assert.equal(iconv.encode(testStr, "UTF32-LE").toString("hex"), utf32leBuf.toString("hex"))
  })

  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf32leBuf, "ucs4le"), testStr)
  })

  it("decodes uneven length buffers with no error", function () {
    assert.equal(iconv.decode(Buffer.from([0x61, 0, 0, 0, 0]), "UTF32-LE"), "a")
  })

  it("handles invalid surrogates gracefully", function () {
    var encoded = iconv.encode(testStr2, "UTF32-LE")
    assert.equal(escape(iconv.decode(encoded, "UTF32-LE")), escape(testStr2))
  })

  it("handles invalid Unicode codepoints gracefully", function () {
    assert.equal(iconv.decode(utf32leBufWithInvalidChar, "utf-32le"), testStr + "�")
  })

  it("handles encoding all valid codepoints", function () {
    if (!Iconv) {
      this.skip()
    }

    assert.deepEqual(iconv.encode(allCharsStr, "utf-32le"), allCharsLEBuf)
    var nodeIconv = new Iconv("UTF-8", "UTF-32LE")
    var nodeBuf = nodeIconv.convert(allCharsStr)
    assert.deepEqual(nodeBuf, allCharsLEBuf)
  })

  it("handles decoding all valid codepoints", function () {
    if (!Iconv) {
      this.skip()
    }

    assert.equal(iconv.decode(allCharsLEBuf, "utf-32le"), allCharsStr)
    var nodeIconv = new Iconv("UTF-32LE", "UTF-8")
    var nodeStr = nodeIconv.convert(allCharsLEBuf).toString("utf8")
    assert.equal(nodeStr, allCharsStr)
  })
})

describe("UTF-32BE codec", function () {
  var Iconv

  try {
    Iconv = require("iconv").Iconv
  } catch (_e) {}

  it("encodes basic strings correctly", function () {
    assert.equal(iconv.encode(testStr, "UTF32-BE").toString("hex"), utf32beBuf.toString("hex"))
  })

  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf32beBuf, "ucs4be"), testStr)
  })

  it("decodes uneven length buffers with no error", function () {
    assert.equal(iconv.decode(Buffer.from([0, 0, 0, 0x61, 0]), "UTF32-BE"), "a")
  })

  it("handles invalid surrogates gracefully", function () {
    var encoded = iconv.encode(testStr2, "UTF32-BE")
    assert.equal(escape(iconv.decode(encoded, "UTF32-BE")), escape(testStr2))
  })

  it("handles invalid Unicode codepoints gracefully", function () {
    assert.equal(iconv.decode(utf32beBufWithInvalidChar, "utf-32be"), testStr + "�")
  })

  it("handles encoding all valid codepoints", function () {
    if (!Iconv) {
      this.skip()
    }

    assert.deepEqual(iconv.encode(allCharsStr, "utf-32be"), allCharsBEBuf)
    var nodeIconv = new Iconv("UTF-8", "UTF-32BE")
    var nodeBuf = nodeIconv.convert(allCharsStr)
    assert.deepEqual(nodeBuf, allCharsBEBuf)
  })

  it("handles decoding all valid codepoints", function () {
    if (!Iconv) {
      this.skip()
    }

    assert.equal(iconv.decode(allCharsBEBuf, "utf-32be"), allCharsStr)
    var nodeIconv = new Iconv("UTF-32BE", "UTF-8")
    var nodeStr = nodeIconv.convert(allCharsBEBuf).toString("utf8")
    assert.equal(nodeStr, allCharsStr)
  })
})

describe("UTF-32 general codec", function () {
  it("adds BOM when encoding, defaults to UTF-32LE", function () {
    assert.equal(iconv.encode(testStr, "utf-32").toString("hex"), utf32leBOM.toString("hex") + utf32leBuf.toString("hex"))
  })

  it("doesn't add BOM and uses UTF-32BE when specified", function () {
    assert.equal(iconv.encode(testStr, "ucs4", { addBOM: false, defaultEncoding: "ucs4be" }).toString("hex"), utf32beBuf.toString("hex"))
  })

  it("correctly decodes UTF-32LE using BOM", function () {
    assert.equal(iconv.decode(utf32leBufWithBOM, "utf-32"), testStr)
  })

  it("correctly decodes UTF-32LE without BOM", function () {
    assert.equal(iconv.decode(iconv.encode(sampleStr, "utf-32-le"), "utf-32"), sampleStr)
  })

  it("correctly decodes UTF-32BE using BOM", function () {
    assert.equal(iconv.decode(utf32beBufWithBOM, "utf-32", { stripBOM: false }), "\uFEFF" + testStr)
  })

  it("correctly decodes UTF-32BE without BOM", function () {
    assert.equal(iconv.decode(iconv.encode(sampleStr, "utf-32-be"), "utf-32"), sampleStr)
  })
})

// Utility function to make bad matches easier to visualize.
function escape (s) {
  var sb = []

  for (var i = 0; i < s.length; ++i) {
    var cc = s.charCodeAt(i)

    if (cc >= 32 && cc < 127 && cc !== 0x5C) { sb.push(s.charAt(i)) } else {
      var h = s.charCodeAt(i).toString(16).toUpperCase()
      while (h.length < 4) // No String.repeat in old versions of Node!
      { h = "0" + h }

      sb.push("\\u" + h)
    }
  }

  return sb.join("")
}
