import whatwgAliases from "../encodings/whatwg-aliases.js"
import { expect } from "vitest"
import utils from "./helpers/utils.js"
import { canonicalizeEncoding } from "../lib/utils.js"

const iconv = utils.requireIconv()

var testString = "Hello123!"
var testStringLatin1 = "Hello123!£Å÷×çþÿ¿®"
var testStringBase64 = "SGVsbG8xMjMh"
var testStringHex = "48656c6c6f31323321"
var testBytes = new TextEncoder().encode(testString)
var testLatin1Bytes = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x31, 0x32, 0x33, 0x21, 0xa3, 0xc5, 0xf7, 0xd7, 0xe7, 0xfe, 0xff, 0xbf, 0xae])

describe("Encoding Existence - Prototype Properties", function () {
  it("should not detect prototype properties as encodings", function () {
    expect(iconv.encodingExists("__proto__")).toBe(false)
    expect(iconv.encodingExists("constructor")).toBe(false)
  })

  it("should detect encodings", function () {
    expect(iconv.encodingExists("utf8")).toBe(true)
  })

  it("should detect all available encodings", function () {
    expect(Object.keys(iconv.encodings).length).toBe(465)
  })
})

describe("Encoding Existence - Codec Data Cache", function () {
  it("should not detect 'constructor' as encoding when _codecDataCache is defined", function () {
    expect(iconv.encodingExists("__proto__")).toBe(false)
    expect(iconv.encodingExists("constructor")).toBe(false)
  })
})

describe("Generic UTF8-UCS2 tests", function () {
  it("Return values are of correct types", function () {
    expect(iconv.encode(testString, "utf8").constructor).toBe(utils.BytesType)

    var s = iconv.decode(testBytes, "utf8")
    expect(Object.prototype.toString.call(s)).toBe("[object String]")
  })

  it("Internal encodings all correctly encoded/decoded", function () {
    const utf8 = new TextEncoder().encode(testStringLatin1)
    const ucs2 = Uint8Array.from([0x48, 0, 0x65, 0, 0x6c, 0, 0x6c, 0, 0x6f, 0, 0x31, 0, 0x32, 0, 0x33, 0, 0x21, 0, 0xa3, 0, 0xc5, 0, 0xf7, 0, 0xd7, 0, 0xe7, 0, 0xfe, 0, 0xff, 0, 0xbf, 0, 0xae, 0])
    for (const [enc, bytes] of [["utf8", utf8], ["UTF-8", utf8], ["UCS2", ucs2], ["binary", testLatin1Bytes]]) {
      expect(iconv.encode(testStringLatin1, enc)).toStrictEqual(utils.bytes(bytes))
      expect(iconv.decode(bytes, enc)).toBe(testStringLatin1)
    }
  })

  it("Base64 correctly encoded/decoded", function () {
    expect(iconv.encode(testStringBase64, "base64")).toStrictEqual(utils.bytes(testBytes))
    expect(iconv.decode(testBytes, "base64")).toBe(testStringBase64)
  })

  it("Hex correctly encoded/decoded", function () {
    expect(iconv.encode(testStringHex, "hex")).toStrictEqual(utils.bytes(testStringHex))
    expect(iconv.decode(testBytes, "hex")).toBe(testStringHex)
  })

  it("Latin1 correctly encoded/decoded", function () {
    expect(iconv.encode(testStringLatin1, "latin1")).toStrictEqual(utils.bytes(testLatin1Bytes))
    expect(iconv.decode(testLatin1Bytes, "latin1")).toBe(testStringLatin1)
  })

  it("keeps binary byte-preserving while ASCII and Latin-1 use Windows-1252", function () {
    const bytes = utils.bytes(Array.from({ length: 256 }, (_, byte) => byte))
    const text = String.fromCharCode(...bytes)
    expect(iconv.decode(bytes, "binary")).toBe(text)
    expect(iconv.encode(text, "binary")).toStrictEqual(bytes)
    for (const alias of ["ascii", "latin1", "iso-8859-1"]) {
      expect(iconv.decode(utils.bytes([0x80, 0x81, 0x9F]), alias, { fatal: true })).toBe("€\u0081Ÿ")
      expect(iconv.encode("€\u0081Ÿ", alias)).toStrictEqual(utils.bytes([0x80, 0x81, 0x9F]))
      expect(iconv.encode("\u0080\u009F", alias)).toStrictEqual(utils.bytes([0x3F, 0x3F]))
    }
  })

  it("rejects Uint8Array input when encoding", function () {
    expect(function () {
      iconv.encode(new TextEncoder().encode(testStringLatin1), "utf8")
    }).toThrowError()
  })

  it("Throws on unknown encodings", function () {
    expect(function () { iconv.encode("a", "xxx") }).toThrowError()
    expect(function () { iconv.decode(Uint8Array.of(0x61), "xxx") }).toThrowError()
  })

  it("Opt-in fatal mode throws on invalid utf8, replaces by default", function () {
    var invalid = Uint8Array.of(0xff, 0xfe, 0xfd)
    expect(function () { iconv.decode(invalid, "utf8", { fatal: true }) }).toThrowError()
    expect(iconv.decode(Uint8Array.of(0x61, 0x62, 0x63), "utf8", { fatal: true })).toBe("abc")
    expect(iconv.decode(invalid, "utf8")).toBe("���") // default: replacement, no throw.
  })

  it("Convert non-strings and non-buffers", function () {
    expect(function () {
      iconv.encode({}, "utf8")
    }).toThrowError()
    expect(function () {
      iconv.encode(10, "utf8")
    }).toThrowError()
    expect(function () {
      iconv.encode(undefined, "utf8")
    }).toThrowError()
  })

  it("Aliases toEncoding and fromEncoding work the same as encode and decode", function () {
    expect(iconv.toEncoding(testString, "latin1")).toStrictEqual(iconv.encode(testString, "latin1"))
    const bytes = new TextEncoder().encode(testStringLatin1)
    expect(iconv.fromEncoding(bytes, "latin1")).toBe(iconv.decode(bytes, "latin1"))
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
        expect(iconv.decode(utils.bytes("61 62 63"), encoding)).toBe("abc")
        expect(iconv.encode("abc", encoding)).toStrictEqual(utils.bytes("61 62 63"))
      }
    } finally {
      delete Object.prototype.permits
      delete Array.prototype.sample2
      iconv._codecDataCache = previousCache
    }
  })

  it("handles encoding untranslatable characters correctly", function () {
    // Regression #162
    expect(iconv.encode("外国人", "latin1")).toStrictEqual(utils.bytes("3f 3f 3f"))
  })
})

describe("Encoding label normalization", function () {
  it("works with numbers directly", function () {
    expect(canonicalizeEncoding(955)).toBe("955")
    expect(iconv.getCodec(1251)).toBe(iconv.getCodec("1251"))
  })

  it("correctly strips year and non-alpha chars", function () {
    expect(canonicalizeEncoding("ISO_8859-5:1988")).toBe("iso88595")
    expect(iconv.getCodec("ISO_8859-5:1988")).toBe(iconv.getCodec("iso88595"))
  })

  it("trims surrounding ASCII whitespace (per WHATWG)", function () {
    expect(canonicalizeEncoding(" \t\n\f\rUTF-8 \t\n\f\r")).toBe("utf8")
    expect(iconv.getCodec(" \t\n\f\rUTF-8 \t\n\f\r")).toBe(iconv.getCodec("utf8"))
    expect(iconv.encodingExists("  utf-8  ")).toBeTruthy()
  })

  it("rejects labels wrapped in non-ASCII-whitespace / control chars (per WHATWG)", function () {
    // NUL, vertical tab, NBSP, line separator, paragraph separator are NOT ASCII whitespace.
    [0x00, 0x0b, 0xa0, 0x2028, 0x2029].forEach(function (code) {
      var ch = String.fromCharCode(code)
      expect(iconv.encodingExists(ch + "utf-8")).toBe(false)
      expect(iconv.encodingExists("utf-8" + ch)).toBe(false)
      expect(iconv.encodingExists(ch + "utf-8" + ch)).toBe(false)
      expect(function () { iconv.decode(Uint8Array.of(0x61), ch + "utf-8") }).toThrowError()
    })
  })

  it("does not fold non-ASCII characters into encoding labels", function () {
    // Kelvin sign and dotted capital I can become ASCII after Unicode lowercasing
    // and punctuation stripping. WHATWG only ignores ASCII letter case.
    for (const label of ["\u212Aoi8-r", "\u212Aoi8-u", "euc-\u212Ar", "w\u0130ndows-1252", "\u0130SO-8859-1"]) {
      expect(iconv.encodingExists(label), label).toBe(false)
      expect(() => iconv.decode(utils.bytes([0x80]), label)).toThrowError()
      expect(() => iconv.encode("A", label)).toThrowError()
    }
  })

  it("does not discard non-ASCII characters inside or around Windows labels", function () {
    const invalidChars = [0x1680, 0x180E, 0x2003, 0x200B, 0x2011, 0x202F, 0x205F, 0x3000, 0xFEFF, 0xD800, 0x1F642]
    for (const code of invalidChars) {
      const char = String.fromCodePoint(code)
      for (const label of [char + "windows-1252", "windows-1252" + char, "windows" + char + "1252"]) {
        expect(iconv.encodingExists(label), label).toBe(false)
        expect(() => iconv.getDecoder(label)).toThrowError()
        expect(() => iconv.getEncoder(label)).toThrowError()
      }
    }
  })

  it("rejects empty and whitespace-only labels", function () {
    expect(iconv.encodingExists("")).toBe(false)
    expect(iconv.encodingExists("   ")).toBe(false)
    expect(iconv.encodingExists("\t\n\f\r")).toBe(false)
  })

  it("matches labels case-insensitively (per WHATWG)", function () {
    expect(iconv.encodingExists("UTF-8")).toBeTruthy()
    expect(iconv.encodingExists("uTf-16Be")).toBeTruthy()
  })
})

describe("WHATWG label aliases", function () {
  it("recognizes every WHATWG alias", function () {
    Object.keys(whatwgAliases).forEach(function (alias) {
      expect(iconv.encodingExists(alias), alias + " should be a known encoding").toBeTruthy()
    })
  })

  it("decodes each alias identically to its target encoding", function () {
    var bytes = Uint8Array.of(0x80, 0xa0, 0xc0, 0xe0, 0x41, 0x7f)
    Object.keys(whatwgAliases).forEach(function (alias) {
      var target = whatwgAliases[alias]
      expect(iconv.decode(bytes, alias), alias + " should decode like " + target).toBe(iconv.decode(bytes, target))
    })
  })

  it("maps the human-readable labels (e.g. x-cp1252, koi8, x-mac-roman)", function () {
    expect(iconv.decode(Uint8Array.of(0x80), "x-cp1252")).toBe(iconv.decode(Uint8Array.of(0x80), "windows-1252"))
    expect(iconv.encodingExists("x-mac-cyrillic")).toBeTruthy()
    expect(iconv.encodingExists("x-mac-ukrainian")).toBeTruthy()
    expect(iconv.encodingExists("x-mac-roman")).toBeTruthy()
    expect(iconv.encodingExists("iso-8859-8-i")).toBeTruthy()
    expect(iconv.encodingExists("sun_eu_greek")).toBeTruthy()
    expect(iconv.encodingExists("x-euc-jp")).toBeTruthy()
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
        expect(iconv.encodingExists(alias)).toBe(true)
        expect(iconv.getCodec(alias)).toBe(iconv.getCodec(encoding))
        expect(iconv.encode(text, alias)).toStrictEqual(utils.bytes(bytes))
        expect(iconv.decode(utils.bytes(bytes), alias)).toBe(text)
      }
    })

    it(codePage + " preserves incremental decoding at every byte boundary", function () {
      for (const alias of aliases) {
        for (let split = 0; split <= bytes.length; split++) {
          const decoder = iconv.getDecoder(alias)
          const result = decoder.write(utils.bytes(bytes.slice(0, split))) +
            decoder.write(utils.bytes([])) + decoder.write(utils.bytes(bytes.slice(split))) + (decoder.end() || "")
          expect(result).toBe(text)
        }
      }
    })

    it(codePage + " preserves BOM options", function () {
      for (const alias of aliases) {
        const encoded = iconv.encode(text, alias, { addBOM: true })
        expect(encoded).toStrictEqual(iconv.encode(text, encoding, { addBOM: true }))
        expect(iconv.decode(encoded, alias)).toBe(text)
        expect(iconv.decode(encoded, alias, { stripBOM: false })).toBe("\uFEFF" + text)
      }
    })
  }

  it("keeps Unicode code page byte order fixed and propagates fatal errors", function () {
    for (const [codePage, encoding] of [[1200, "utf16le"], [1201, "utf16be"], [12000, "utf32le"], [12001, "utf32be"]]) {
      for (const alias of [codePage, String(codePage), "cp" + codePage]) {
        const options = { defaultEncoding: encoding.startsWith("utf16") ? "utf16be" : "utf32be", addBOM: false }
        const bytes = iconv.encode("A🙂B", encoding, options)
        expect(iconv.encode("A🙂B", alias, options)).toStrictEqual(bytes)
        expect(iconv.decode(bytes, alias, options)).toBe("A🙂B")
        expect(() => iconv.decode(utils.bytes([0x41]), alias, { fatal: true })).toThrowError(Error)
        expect(iconv.decode(utils.bytes([0x41]), alias)).toBe("\uFFFD")
      }
    }
  })

  it("preserves UTF-8 fatal mode and invalid-character handling through code page aliases", function () {
    for (const alias of [65001, "65001", "cp65001"]) {
      expect(iconv.decode(utils.bytes([0xFF]), alias)).toBe("\uFFFD")
      expect(() => iconv.decode(utils.bytes([0xFF]), alias, { fatal: true })).toThrowError(TypeError)
      const calls = []
      expect(iconv.encode("A\uD800", alias, {
        invalidCharHandler (char, index) {
          calls.push([char, index])
          return "!"
        }
      })).toStrictEqual(utils.bytes([0x41, 0x21]))
      expect(calls).toStrictEqual([["\uD800", 1]])
    }
  })
})
