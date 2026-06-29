"use strict"

var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

var testStr = "1aя中文☃💩"
var testStr2 = "❝Stray high \uD977😱 and low\uDDDD☔ surrogate values.❞"
// Strict UTF-32: the lone surrogates (U+D977 high, U+DDDD low) can't be represented and become U+FFFD;
// the valid pair (😱) survives.
var testStr2Fixed = testStr2.replace("\uD977", "�").replace("\uDDDD", "�")
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

  it("decodes an empty buffer to an empty string", function () {
    assert.equal(iconv.decode(Buffer.alloc(0), "utf-32le"), "")
  })

  it("emits U+FFFD for a trailing incomplete code unit", function () {
    assert.equal(iconv.decode(Buffer.from([0x61, 0, 0, 0, 0]), "UTF32-LE"), "a�")
  })

  it("replaces a surrogate code point with U+FFFD when decoding", function () {
    // 0x0000D800 is a (high) surrogate code point: invalid in UTF-32.
    assert.equal(iconv.decode(Buffer.from([0x00, 0xD8, 0x00, 0x00]), "utf-32le"), "�")
  })

  it("replaces a trailing unpaired high surrogate with U+FFFD", function () {
    // 'a' is written, the lone high surrogate is held, then end() flushes it as U+FFFD.
    assert.equal(iconv.encode("a\uD800", "UTF32-LE").toString("hex"), "61000000fdff0000")
  })

  it("throws on ill-formed input in fatal mode", function () {
    assert.throws(function () { iconv.decode(Buffer.from([0x00, 0xD8, 0x00, 0x00]), "utf-32le", { fatal: true }) })
    assert.throws(function () { iconv.decode(Buffer.from([0x61, 0, 0]), "utf-32le", { fatal: true }) }) // truncated
  })

  it("decodes a code point split across chunk boundaries", function () {
    var decoder = iconv.getDecoder("utf-32le")
    var res = decoder.write(Buffer.from([0x61])) // 1 byte buffered
    res += decoder.write(Buffer.from([0x00, 0x00])) // still incomplete (3 bytes buffered)
    res += decoder.write(Buffer.from([0x00, 0x62, 0x00, 0x00, 0x00])) // completes 'a', then 'b'
    res += decoder.end() || ""
    assert.equal(res, "ab")
  })

  it("decodes correctly when split at every byte boundary", function () {
    for (var at = 1; at < utf32leBuf.length; at++) {
      var decoder = iconv.getDecoder("utf-32le")
      var res = decoder.write(utf32leBuf.slice(0, at)) + decoder.write(utf32leBuf.slice(at)) + (decoder.end() || "")
      assert.equal(res, testStr, "split at byte " + at)
    }
  })

  it("replaces lone surrogates with U+FFFD", function () {
    var encoded = iconv.encode(testStr2, "UTF32-LE")
    assert.equal(escape(iconv.decode(encoded, "UTF32-LE")), escape(testStr2Fixed))
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

  it("emits U+FFFD for a trailing incomplete code unit", function () {
    assert.equal(iconv.decode(Buffer.from([0, 0, 0, 0x61, 0]), "UTF32-BE"), "a�")
  })

  it("replaces a surrogate code point with U+FFFD when decoding", function () {
    assert.equal(iconv.decode(Buffer.from([0x00, 0x00, 0xD8, 0x00]), "utf-32be"), "�")
  })

  it("decodes a code point split across chunk boundaries", function () {
    var decoder = iconv.getDecoder("utf-32be")
    var res = decoder.write(Buffer.from([0x00, 0x00])) // buffered
    res += decoder.write(Buffer.from([0x00, 0x61, 0x00, 0x00, 0x00, 0x62])) // completes 'a', then 'b'
    res += decoder.end() || ""
    assert.equal(res, "ab")
  })

  it("decodes correctly when split at every byte boundary", function () {
    for (var at = 1; at < utf32beBuf.length; at++) {
      var decoder = iconv.getDecoder("utf-32be")
      var res = decoder.write(utf32beBuf.slice(0, at)) + decoder.write(utf32beBuf.slice(at)) + (decoder.end() || "")
      assert.equal(res, testStr, "split at byte " + at)
    }
  })

  it("replaces a trailing unpaired high surrogate with U+FFFD", function () {
    assert.equal(iconv.encode("a\uD800", "UTF32-BE").toString("hex"), "000000610000fffd")
  })

  it("replaces lone surrogates with U+FFFD", function () {
    var encoded = iconv.encode(testStr2, "UTF32-BE")
    assert.equal(escape(iconv.decode(encoded, "UTF32-BE")), escape(testStr2Fixed))
  })

  it("handles invalid Unicode codepoints gracefully", function () {
    assert.equal(iconv.decode(utf32beBufWithInvalidChar, "utf-32be"), testStr + "�")
    // A code point with the high bit set reads as a negative int32; it's still out of range -> U+FFFD.
    assert.equal(iconv.decode(Buffer.from([0, 0, 0, 0x80]), "utf-32le"), "�")
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

  it("decodes short input, deciding endianness only at end()", function () {
    // 8 bytes is below the 32-byte detection threshold, so the codec is chosen only at end().
    assert.equal(iconv.decode(iconv.encode("1a", "utf-32le"), "utf-32"), "1a")
  })

  it("flushes a trailing incomplete code unit as U+FFFD when deciding at end()", function () {
    // 5 bytes (< 32): decided at end(), and the chosen decoder's end() yields the trailing U+FFFD.
    assert.equal(iconv.decode(Buffer.from([0x31, 0, 0, 0, 0]), "utf-32"), "1�")
  })

  it("decodes across multiple chunks once endianness is decided", function () {
    var encoded = iconv.encode(sampleStr, "utf-32le")
    var decoder = iconv.getDecoder("utf-32")
    var res = decoder.write(encoded.slice(0, 40)) // >= 32 bytes: chooses + decodes
    res += decoder.write(encoded.slice(40)) // already chosen: decodes directly
    res += decoder.end() || ""
    assert.equal(res, sampleStr)
  })

  it("falls back to UTF-32LE for ambiguous (all-zero) input", function () {
    assert.equal(iconv.decode(Buffer.alloc(32), "utf-32"), "\0\0\0\0\0\0\0\0")
  })

  it("detects endianness from a long heuristic sample (> 100 code units)", function () {
    var longStr = "a".repeat(150)
    assert.equal(iconv.decode(iconv.encode(longStr, "utf-32le"), "utf-32"), longStr)
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
