"use strict"

var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

var testString = "Hello123!"
var testStringLatin1 = "Hello123!£Å÷×çþÿ¿®"
var testStringBase64 = "SGVsbG8xMjMh"
var testStringHex = "48656c6c6f31323321"

describe("Encoding Existence - Prototype Properties", function () {
  it("should not detect prototype properties as encodings", function () {
    assert.equal(iconv.encodingExists("__proto__"), false)
    assert.equal(iconv.encodingExists("constructor"), false)
  })

  it("should detect encodings", function () {
    assert.equal(iconv.encodingExists("utf8"), true)
  })

  it("should detect all available encodings", function () {
    assert.strictEqual(Object.keys(iconv.encodings).length, 452)
  })
})

describe("Encoding Existence - Codec Data Cache", function () {
  it("should not detect 'constructor' as encoding when _codecDataCache is defined", function () {
    assert.equal(iconv.encodingExists("__proto__"), false)
    assert.equal(iconv.encodingExists("constructor"), false)
  })
})

describe("Generic UTF8-UCS2 tests", function () {
  it("Return values are of correct types", function () {
    assert.ok(Buffer.isBuffer(iconv.encode(testString, "utf8")))

    var s = iconv.decode(Buffer.from(testString), "utf8")
    assert.strictEqual(Object.prototype.toString.call(s), "[object String]")
  })

  it("Internal encodings all correctly encoded/decoded", function () {
    ["utf8", "UTF-8", "UCS2", "binary"].forEach(function (enc) {
      assert.strictEqual(iconv.encode(testStringLatin1, enc).toString(enc), testStringLatin1)
      assert.strictEqual(iconv.decode(Buffer.from(testStringLatin1, enc), enc), testStringLatin1)
    })
  })

  it("Base64 correctly encoded/decoded", function () {
    assert.strictEqual(iconv.encode(testStringBase64, "base64").toString("binary"), testString)
    assert.strictEqual(iconv.decode(Buffer.from(testString, "binary"), "base64"), testStringBase64)
  })

  it("Hex correctly encoded/decoded", function () {
    assert.strictEqual(iconv.encode(testStringHex, "hex").toString("binary"), testString)
    assert.strictEqual(iconv.decode(Buffer.from(testString, "binary"), "hex"), testStringHex)
  })

  it("Latin1 correctly encoded/decoded", function () {
    assert.strictEqual(iconv.encode(testStringLatin1, "latin1").toString("binary"), testStringLatin1)
    assert.strictEqual(iconv.decode(Buffer.from(testStringLatin1, "binary"), "latin1"), testStringLatin1)
  })

  it("Convert to string, not buffer (utf8 used)", function () {
    assert.throws(function () {
      iconv.encode(Buffer.from(testStringLatin1, "utf8"), "utf8")
    })
  })

  it("Throws on unknown encodings", function () {
    assert.throws(function () { iconv.encode("a", "xxx") })
    assert.throws(function () { iconv.decode(Buffer.from("a"), "xxx") })
  })

  it("Opt-in fatal mode throws on invalid utf8, replaces by default", function () {
    var invalid = Buffer.from([0xff, 0xfe, 0xfd])
    assert.throws(function () { iconv.decode(invalid, "utf8", { fatal: true }) })
    assert.strictEqual(iconv.decode(Buffer.from("abc"), "utf8", { fatal: true }), "abc")
    assert.strictEqual(iconv.decode(invalid, "utf8"), "���") // default: replacement, no throw.
  })

  it("Convert non-strings and non-buffers", function () {
    assert.throws(function () {
      iconv.encode({}, "utf8")
    })
    assert.throws(function () {
      iconv.encode(10, "utf8")
    })
    assert.throws(function () {
      iconv.encode(undefined, "utf8")
    })
  })

  it("Aliases toEncoding and fromEncoding work the same as encode and decode", function () {
    assert.strictEqual(iconv.toEncoding(testString, "latin1").toString("binary"), iconv.encode(testString, "latin1").toString("binary"))
    assert.strictEqual(iconv.fromEncoding(Buffer.from(testStringLatin1), "latin1"), iconv.decode(Buffer.from(testStringLatin1), "latin1"))
  })

  it("handles Object & Array prototypes monkey patching", function () {
    // eslint-disable-next-line  no-extend-native
    Object.prototype.permits = function () {}
    // eslint-disable-next-line  no-extend-native
    Array.prototype.sample2 = function () {}

    iconv._codecDataCache = { __proto__: null } // Clean up cache so that all encodings are loaded.

    assert.strictEqual(iconv.decode(Buffer.from("abc"), "gbk"), "abc")
    assert.strictEqual(iconv.decode(Buffer.from("abc"), "win1251"), "abc")
    assert.strictEqual(iconv.decode(Buffer.from("abc"), "utf7"), "abc")
    assert.strictEqual(iconv.decode(Buffer.from("abc"), "utf8"), "abc")

    assert.strictEqual(iconv.encode("abc", "gbk").toString(), "abc")
    assert.strictEqual(iconv.encode("abc", "win1251").toString(), "abc")
    assert.strictEqual(iconv.encode("abc", "utf7").toString(), "abc")
    assert.strictEqual(iconv.encode("abc", "utf8").toString(), "abc")

    delete Object.prototype.permits
    delete Array.prototype.sample2
  })

  it("handles encoding untranslatable characters correctly", function () {
    // Regression #162
    assert.strictEqual(iconv.encode("外国人", "latin1").toString(), "???")
  })
})

describe("Canonicalize encoding function", function () {
  it("works with numbers directly", function () {
    assert.equal(iconv._canonicalizeEncoding(955), "955")
  })

  it("correctly strips year and non-alpha chars", function () {
    assert.equal(iconv._canonicalizeEncoding("ISO_8859-5:1988"), "iso88595")
  })

  it("trims surrounding ASCII whitespace (per WHATWG)", function () {
    assert.equal(iconv._canonicalizeEncoding(" \t\n\f\rUTF-8 \t\n\f\r"), "utf8")
    assert.ok(iconv.encodingExists("  utf-8  "))
  })

  it("rejects labels wrapped in non-ASCII-whitespace / control chars (per WHATWG)", function () {
    // NUL, vertical tab, NBSP, line separator, paragraph separator are NOT ASCII whitespace.
    [0x00, 0x0b, 0xa0, 0x2028, 0x2029].forEach(function (code) {
      var ch = String.fromCharCode(code)
      assert.strictEqual(iconv.encodingExists(ch + "utf-8"), false)
      assert.strictEqual(iconv.encodingExists("utf-8" + ch), false)
      assert.strictEqual(iconv.encodingExists(ch + "utf-8" + ch), false)
      assert.throws(function () { iconv.decode(Buffer.from([0x61]), ch + "utf-8") })
    })
  })

  it("rejects empty and whitespace-only labels", function () {
    assert.strictEqual(iconv.encodingExists(""), false)
    assert.strictEqual(iconv.encodingExists("   "), false)
    assert.strictEqual(iconv.encodingExists("\t\n\f\r"), false)
  })

  it("matches labels case-insensitively (per WHATWG)", function () {
    assert.ok(iconv.encodingExists("UTF-8"))
    assert.ok(iconv.encodingExists("uTf-16Be"))
  })
})

describe("WHATWG label aliases", function () {
  var whatwgAliases = require("../encodings/whatwg-aliases")

  it("recognizes every WHATWG alias", function () {
    Object.keys(whatwgAliases).forEach(function (alias) {
      assert.ok(iconv.encodingExists(alias), alias + " should be a known encoding")
    })
  })

  it("decodes each alias identically to its target encoding", function () {
    var bytes = Buffer.from([0x80, 0xa0, 0xc0, 0xe0, 0x41, 0x7f])
    Object.keys(whatwgAliases).forEach(function (alias) {
      var target = whatwgAliases[alias]
      assert.strictEqual(
        iconv.decode(bytes, alias),
        iconv.decode(bytes, target),
        alias + " should decode like " + target
      )
    })
  })

  it("maps the human-readable labels (e.g. x-cp1252, koi8, x-mac-roman)", function () {
    assert.strictEqual(iconv.decode(Buffer.from([0x80]), "x-cp1252"), iconv.decode(Buffer.from([0x80]), "windows-1252"))
    assert.ok(iconv.encodingExists("x-mac-cyrillic"))
    assert.ok(iconv.encodingExists("x-mac-ukrainian"))
    assert.ok(iconv.encodingExists("x-mac-roman"))
    assert.ok(iconv.encodingExists("iso-8859-8-i"))
    assert.ok(iconv.encodingExists("sun_eu_greek"))
    assert.ok(iconv.encodingExists("x-euc-jp"))
  })
})
