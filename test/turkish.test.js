"use strict"

var assert = require("assert")
var utils = require("./helpers/utils")
var iconv = utils.requireIconv()

var ascii =
    "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f" +
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7f"

var encodings = [
  {
    name: "windows1254",
    variations: ["windows-1254", "win-1254", "win1254", "cp1254", "cp-1254", 1254],
    strings: {
      empty: "",
      ascii: ascii,
      turkish:
                "€‚ƒ„…†‡ˆ‰Š‹Œ‘’“”•–—˜™š›œŸ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ",
      untranslatable: "\x81\x8d\x8e\x8f\x90\x9d\x9e"
    },
    encodedStrings: {
      empty: utils.bytes([]),
      ascii: utils.bytes(ascii.split("").map((c) => c.charCodeAt(0))),
      turkish: utils.bytes(
        "80 82 83 84 85 86 87 88 89 8a 8b 8c 91 92 93 94 95 96 97 98 99 9a 9b 9c 9f " +
                    "a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ae af b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ba bb bc bd be bf " +
                    "c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 da db dc dd de df " +
                    "e0 e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 fa fb fc fd fe ff"
      )
    }
  },
  {
    name: "iso88599",
    variations: ["iso-8859-9", "turkish", "turkish8", "cp28599", "cp-28599", 28599],
    strings: {
      empty: "",
      ascii: ascii,
      turkish:
                "\xa0¡¢£¤¥¦§¨©ª«¬\xad®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ",
      untranslatable: ""
    },
    encodedStrings: {
      empty: utils.bytes([]),
      ascii: utils.bytes(ascii.split("").map((c) => c.charCodeAt(0))),
      turkish: utils.bytes(
        "a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ba bb bc bd be bf" +
                    "c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 da db dc dd de df" +
                    "e0 e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef f0 f1 f2 f3 f4 f5 f6 f7 f8 f9 fa fb fc fd fe ff"
      )
    }
  }
]

describe("Test Turkish encodings #node-web", function () {
  encodings.forEach(function (encoding) {
    var enc = encoding.variations[0]
    var key = "turkish"
    describe(encoding.name + ":", function () {
      it("Convert from buffer", function () {
        for (var key in encoding.encodedStrings)
        { assert.strictEqual(
          iconv.decode(encoding.encodedStrings[key], enc),
          encoding.strings[key]
        ) }
      })

      it("Convert to buffer", function () {
        for (var key in encoding.encodedStrings)
        { assert.strictEqual(
          utils.hex(iconv.encode(encoding.strings[key], enc)),
          utils.hex(encoding.encodedStrings[key])
        ) }
      })

      it("Try different variations of encoding", function () {
        encoding.variations.forEach(function (enc) {
          assert.strictEqual(
            iconv.decode(encoding.encodedStrings[key], enc),
            encoding.strings[key]
          )
          assert.strictEqual(
            utils.hex(iconv.encode(encoding.strings[key], enc)),
            utils.hex(encoding.encodedStrings[key])
          )
        })
      })

      it("Untranslatable chars are converted to defaultCharSingleByte", function () {
        const untranslatableBytes = utils.bytes(
          encoding.strings.untranslatable
            .split("")
            .map(() => iconv.defaultCharSingleByte.charCodeAt(0))
        )
        assert.strictEqual(
          utils.hex(iconv.encode(encoding.strings.untranslatable, enc)),
          utils.hex(untranslatableBytes)
        ) // Only '?' characters.
      })
    })
  })
})
