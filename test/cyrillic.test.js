"use strict"

var assert = require("assert")
var utils = require("./helpers/utils")
var iconv = utils.requireIconv()

var baseStrings = {
  empty: "",
  hi: "Привет!",
  ascii:
        "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f" +
        " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7f",
  rus: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя",
  additional1: "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬\xAD®Ї°±Ііґµ¶·ё№є»јЅѕї",
  additional2: "─│┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓⌠■∙√≈≤≥ ⌡°²·÷═║╒ё╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡Ё╢╣╤╥╦╧╨╩╪╫╬©",
  additional3: " ЁЂЃЄЅІЇЈЉЊЋЌ­ЎЏ№ёђѓєѕіїјљњћќ§ўџ",
  untranslatable: "£Åçþÿ¿"
}

var encodings = [
  {
    name: "Win-1251",
    variations: ["win1251", "Windows-1251", "windows1251", "CP1251", 1251],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("cf f0 e8 e2 e5 f2 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      rus: utils.bytes(
        "c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 da db dc dd de df e0 e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 fa fb fc fd fe ff"
      ),
      additional1: utils.bytes(
        "80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f 90 91 92 93 94 95 96 97 99 9a 9b 9c 9d 9e 9f a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ba bb bc bd be bf"
      )
    }
  },
  {
    name: "Koi8-R",
    variations: ["koi8r", "KOI8-R", "cp20866", 20866],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("f0 d2 c9 d7 c5 d4 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      rus: utils.bytes(
        "e1 e2 f7 e7 e4 e5 f6 fa e9 ea eb ec ed ee ef f0 f2 f3 f4 f5 e6 e8 e3 fe fb fd ff f9 f8 fc e0 f1 c1 c2 d7 c7 c4 c5 d6 da c9 ca cb cc cd ce cf d0 d2 d3 d4 d5 c6 c8 c3 de db dd df d9 d8 dc c0 d1"
      ),
      additional2: utils.bytes(
        "80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f 90 91 92 93 94 95 96 97 98 99 9a 9b 9c 9d 9e 9f a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ba bb bc bd be bf"
      )
    }
  },
  {
    name: "ISO 8859-5",
    variations: ["iso88595", "ISO-8859-5", "ISO 8859-5", "cp28595", 28595],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("bf e0 d8 d2 d5 e2 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      rus: utils.bytes(
        "b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ba bb bc bd be bf c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 da db dc dd de df e0 e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef"
      ),
      additional3: utils.bytes(
        "a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 fa fb fc fd fe ff"
      )
    }
  }
]

describe("Test Cyrillic encodings #node-web", function () {
  encodings.forEach(function (encoding) {
    var enc = encoding.variations[0]
    var key = "hi"
    describe(encoding.name + ":", function () {
      it("Convert from buffer", function () {
        for (const key in encoding.encodedStrings) {
          assert.strictEqual(
            iconv.decode(encoding.encodedStrings[key], enc),
            baseStrings[key]
          )
        }
      })

      it("Convert to buffer", function () {
        for (const key in encoding.encodedStrings) {
          assert.strictEqual(
            utils.hex(iconv.encode(baseStrings[key], enc)),
            utils.hex(encoding.encodedStrings[key])
          )
        }
      })

      it("Try different variations of encoding", function () {
        encoding.variations.forEach(function (enc) {
          assert.strictEqual(
            iconv.decode(encoding.encodedStrings[key], enc),
            baseStrings[key]
          )
          assert.strictEqual(
            utils.hex(iconv.encode(baseStrings[key], enc)),
            utils.hex(encoding.encodedStrings[key])
          )
        })
      })

      it("Untranslatable chars are converted to defaultCharSingleByte", function () {
        const untranslatableBytes = utils.bytes(
          baseStrings.untranslatable
            .split("")
            .map(() => iconv.defaultCharSingleByte.charCodeAt(0))
        )
        assert.strictEqual(
          utils.hex(iconv.encode(baseStrings.untranslatable, enc)),
          utils.hex(untranslatableBytes)
        ) // Only '?' characters.
      })
    })
  })
})
