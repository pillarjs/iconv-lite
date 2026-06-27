"use strict"

var { describe, it } = require("node:test")
var assert = require("assert")
var utils = require("./utils")
var iconv = utils.requireIconv()

var baseStrings = {
  empty: "",
  hi: "Γειά!",
  ascii:
        "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f" +
        " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7f",
  greek: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩάέήίόύώΆΈΉΊΌΎΏϊϋΪΫ",
  untranslatable: "Åçþÿ¿"
}

var encodings = [
  {
    name: "windows1253",
    variations: ["windows-1253", "win-1253", "win1253", "cp1253", "cp-1253", 1253],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("c3 e5 e9 dc 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      greek: utils.bytes(
        "e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef f0 f1 f3 f4 f5 f6 f7 f8 f9 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d3 d4 d5 d6 d7 d8 d9 dc dd de df fc fd fe a2 b8 b9 ba bc be bf fa fb da db"
      )
    }
  },
  {
    name: "iso88597",
    variations: ["iso-8859-7", "greek", "greek8", "cp28597", "cp-28597", 28597],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("c3 e5 e9 dc 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      greek: utils.bytes(
        "e1 e2 e3 e4 e5 e6 e7 e8 e9 ea eb ec ed ee ef f0 f1 f3 f4 f5 f6 f7 f8 f9 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d3 d4 d5 d6 d7 d8 d9 dc dd de df fc fd fe b6 b8 b9 ba bc be bf fa fb da db"
      )
    }
  },
  {
    name: "cp737",
    variations: ["cp-737", 737],
    encodedStrings: {
      empty: utils.bytes([]),
      hi: utils.bytes("82 9c a0 e1 21"),
      ascii: utils.bytes(baseStrings.ascii.split("").map((c) => c.charCodeAt(0))),
      greek: utils.bytes(
        "98 99 9a 9b 9c 9d 9e 9f a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 ab ac ad ae af e0 80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f 90 91 92 93 94 95 96 97 e1 e2 e3 e5 e6 e7 e9 ea eb ec ed ee ef f0 e4 e8 f4 f5"
      )
    }
  }
]

describe("Test Greek encodings #node-web", function () {
  encodings.forEach(function (encoding) {
    var enc = encoding.variations[0]
    var key = "hi"
    describe(encoding.name + ":", function () {
      it("Convert from buffer", function () {
        for (var key in encoding.encodedStrings)
        { assert.strictEqual(
          iconv.decode(encoding.encodedStrings[key], enc),
          baseStrings[key]
        ) }
      })

      it("Convert to buffer", function () {
        for (var key in encoding.encodedStrings)
        { assert.strictEqual(
          utils.hex(iconv.encode(baseStrings[key], enc)),
          utils.hex(encoding.encodedStrings[key])
        ) }
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
