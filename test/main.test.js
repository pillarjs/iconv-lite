import whatwgAliases from "../encodings/whatwg-aliases.js"
import assert from "assert"
import { Buffer } from "buffer"
import utils from "./helpers/utils.js"
import { canonicalizeEncoding } from "../lib/utils.js"

const iconv = utils.requireIconv()

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
    assert.strictEqual(Object.keys(iconv.encodings).length, 465)
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
    assert.strictEqual(iconv.encode(testString, "utf8").constructor, utils.BytesType)

    var s = iconv.decode(Buffer.from(testString), "utf8")
    assert.strictEqual(Object.prototype.toString.call(s), "[object String]")
  })

  it("Internal encodings all correctly encoded/decoded", function () {
    ["utf8", "UTF-8", "UCS2", "binary"].forEach(function (enc) {
      assert.deepStrictEqual(iconv.encode(testStringLatin1, enc), utils.bytes(Buffer.from(testStringLatin1, enc)))
      assert.strictEqual(iconv.decode(Buffer.from(testStringLatin1, enc), enc), testStringLatin1)
    })
  })

  it("Base64 correctly encoded/decoded", function () {
    assert.deepStrictEqual(iconv.encode(testStringBase64, "base64"), utils.bytes(Buffer.from(testString, "binary")))
    assert.strictEqual(iconv.decode(Buffer.from(testString, "binary"), "base64"), testStringBase64)
  })

  it("Hex correctly encoded/decoded", function () {
    assert.deepStrictEqual(iconv.encode(testStringHex, "hex"), utils.bytes(testStringHex))
    assert.strictEqual(iconv.decode(Buffer.from(testString, "binary"), "hex"), testStringHex)
  })

  it("Latin1 correctly encoded/decoded", function () {
    assert.deepStrictEqual(iconv.encode(testStringLatin1, "latin1"), utils.bytes(Buffer.from(testStringLatin1, "binary")))
    assert.strictEqual(iconv.decode(Buffer.from(testStringLatin1, "binary"), "latin1"), testStringLatin1)
  })

  it("keeps binary byte-preserving while ASCII and Latin-1 use Windows-1252", function () {
    const bytes = utils.bytes(Array.from({ length: 256 }, (_, byte) => byte))
    const text = String.fromCharCode(...bytes)
    assert.strictEqual(iconv.decode(bytes, "binary"), text)
    assert.deepStrictEqual(iconv.encode(text, "binary"), bytes)
    for (const alias of ["ascii", "latin1", "iso-8859-1"]) {
      assert.strictEqual(iconv.decode(utils.bytes([0x80, 0x81, 0x9F]), alias, { fatal: true }), "€\u0081Ÿ")
      assert.deepStrictEqual(iconv.encode("€\u0081Ÿ", alias), utils.bytes([0x80, 0x81, 0x9F]))
      assert.deepStrictEqual(iconv.encode("\u0080\u009F", alias), utils.bytes([0x3F, 0x3F]))
    }
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
    assert.deepStrictEqual(iconv.toEncoding(testString, "latin1"), iconv.encode(testString, "latin1"))
    assert.strictEqual(iconv.fromEncoding(Buffer.from(testStringLatin1), "latin1"), iconv.decode(Buffer.from(testStringLatin1), "latin1"))
  })

  it("handles Object & Array prototypes monkey patching", function () {
    // eslint-disable-next-line  no-extend-native
    Object.prototype.permits = function () {}
    // eslint-disable-next-line  no-extend-native
    Array.prototype.sample2 = function () {}

    const previousCache = iconv._codecDataCache
    try {
      iconv._codecDataCache = { __proto__: null } // Clean up cache so that all encodings are loaded.

      for (const encoding of ["gbk", "win1251", "utf7", "utf8"]) {
        assert.strictEqual(iconv.decode(utils.bytes("61 62 63"), encoding), "abc")
        assert.deepStrictEqual(iconv.encode("abc", encoding), utils.bytes("61 62 63"))
      }
    } finally {
      delete Object.prototype.permits
      delete Array.prototype.sample2
      iconv._codecDataCache = previousCache
    }
  })

  it("handles encoding untranslatable characters correctly", function () {
    // Regression #162
    assert.deepStrictEqual(iconv.encode("外国人", "latin1"), utils.bytes("3f 3f 3f"))
  })
})

describe("Encoding label normalization", function () {
  it("works with numbers directly", function () {
    assert.strictEqual(canonicalizeEncoding(955), "955")
    assert.strictEqual(iconv.getCodec(1251), iconv.getCodec("1251"))
  })

  it("correctly strips year and non-alpha chars", function () {
    assert.strictEqual(canonicalizeEncoding("ISO_8859-5:1988"), "iso88595")
    assert.strictEqual(iconv.getCodec("ISO_8859-5:1988"), iconv.getCodec("iso88595"))
  })

  it("trims surrounding ASCII whitespace (per WHATWG)", function () {
    assert.strictEqual(canonicalizeEncoding(" \t\n\f\rUTF-8 \t\n\f\r"), "utf8")
    assert.strictEqual(iconv.getCodec(" \t\n\f\rUTF-8 \t\n\f\r"), iconv.getCodec("utf8"))
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

  it("does not fold non-ASCII characters into encoding labels", function () {
    // Kelvin sign and dotted capital I can become ASCII after Unicode lowercasing
    // and punctuation stripping. WHATWG only ignores ASCII letter case.
    for (const label of ["\u212Aoi8-r", "\u212Aoi8-u", "euc-\u212Ar", "w\u0130ndows-1252", "\u0130SO-8859-1"]) {
      assert.strictEqual(iconv.encodingExists(label), false, label)
      assert.throws(() => iconv.decode(utils.bytes([0x80]), label))
      assert.throws(() => iconv.encode("A", label))
    }
  })

  it("does not discard non-ASCII characters inside or around Windows labels", function () {
    const invalidChars = [0x1680, 0x180E, 0x2003, 0x200B, 0x2011, 0x202F, 0x205F, 0x3000, 0xFEFF, 0xD800, 0x1F642]
    for (const code of invalidChars) {
      const char = String.fromCodePoint(code)
      for (const label of [char + "windows-1252", "windows-1252" + char, "windows" + char + "1252"]) {
        assert.strictEqual(iconv.encodingExists(label), false, label)
        assert.throws(() => iconv.getDecoder(label))
        assert.throws(() => iconv.getEncoder(label))
      }
    }
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

describe("Windows Unicode code page aliases (#109)", function () {
  for (const [codePage, encoding, bytes] of [
    [1200, "utf16le", [0x41, 0, 0x62, 0x22, 0x91, 3, 0x2E, 0]],
    [1201, "utf16be", [0, 0x41, 0x22, 0x62, 3, 0x91, 0, 0x2E]],
    [12000, "utf32le", [0x41, 0, 0, 0, 0x62, 0x22, 0, 0, 0x91, 3, 0, 0, 0x2E, 0, 0, 0]],
    [12001, "utf32be", [0, 0, 0, 0x41, 0, 0, 0x22, 0x62, 0, 0, 3, 0x91, 0, 0, 0, 0x2E]],
    [65000, "utf7", [0x41, 0x2B, 0x49, 0x6D, 0x49, 0x44, 0x6B, 0x51, 0x2D, 0x2E]],
    [65001, "utf8", [0x41, 0xE2, 0x89, 0xA2, 0xCE, 0x91, 0x2E]]
  ]) {
    const text = "A\u2262\u0391." // RFC 2152 example: A+ImIDkQ-.
    const aliases = [codePage, String(codePage), "cp" + codePage, " \tCP-" + codePage + "\r\n"]

    it(codePage + " encodes and decodes like " + encoding, function () {
      for (const alias of aliases) {
        assert.strictEqual(iconv.encodingExists(alias), true)
        assert.strictEqual(iconv.getCodec(alias), iconv.getCodec(encoding))
        assert.deepStrictEqual(iconv.encode(text, alias), utils.bytes(bytes))
        assert.strictEqual(iconv.decode(utils.bytes(bytes), alias), text)
      }
    })

    it(codePage + " preserves incremental decoding at every byte boundary", function () {
      for (const alias of aliases) {
        for (let split = 0; split <= bytes.length; split++) {
          const decoder = iconv.getDecoder(alias)
          const result = decoder.write(utils.bytes(bytes.slice(0, split))) +
            decoder.write(utils.bytes([])) + decoder.write(utils.bytes(bytes.slice(split))) + (decoder.end() || "")
          assert.strictEqual(result, text)
        }
      }
    })

    it(codePage + " preserves BOM options", function () {
      for (const alias of aliases) {
        const encoded = iconv.encode(text, alias, { addBOM: true })
        assert.deepStrictEqual(encoded, iconv.encode(text, encoding, { addBOM: true }))
        assert.strictEqual(iconv.decode(encoded, alias), text)
        assert.strictEqual(iconv.decode(encoded, alias, { stripBOM: false }), "\uFEFF" + text)
      }
    })
  }

  it("keeps Unicode code page byte order fixed and propagates fatal errors", function () {
    for (const [codePage, encoding] of [[1200, "utf16le"], [1201, "utf16be"], [12000, "utf32le"], [12001, "utf32be"]]) {
      for (const alias of [codePage, String(codePage), "cp" + codePage]) {
        const options = { defaultEncoding: encoding.startsWith("utf16") ? "utf16be" : "utf32be", addBOM: false }
        const bytes = iconv.encode("A🙂B", encoding, options)
        assert.deepStrictEqual(iconv.encode("A🙂B", alias, options), bytes)
        assert.strictEqual(iconv.decode(bytes, alias, options), "A🙂B")
        assert.throws(() => iconv.decode(utils.bytes([0x41]), alias, { fatal: true }), Error)
        assert.strictEqual(iconv.decode(utils.bytes([0x41]), alias), "\uFFFD")
      }
    }
  })

  it("preserves UTF-8 fatal mode and invalid-character handling through code page aliases", function () {
    for (const alias of [65001, "65001", "cp65001"]) {
      assert.strictEqual(iconv.decode(utils.bytes([0xFF]), alias), "\uFFFD")
      assert.throws(() => iconv.decode(utils.bytes([0xFF]), alias, { fatal: true }), TypeError)
      const calls = []
      assert.deepStrictEqual(iconv.encode("A\uD800", alias, {
        invalidCharHandler (char, index) {
          calls.push([char, index])
          return "!"
        }
      }), utils.bytes([0x41, 0x21]))
      assert.deepStrictEqual(calls, [["\uD800", 1]])
    }
  })
})
