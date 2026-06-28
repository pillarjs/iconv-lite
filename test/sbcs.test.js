"use strict"

const assert = require("assert")
const unorm = require("unorm")
const utils = require("./helpers/utils")
const sbcsData = require("./tables/sbcs-data.json")
const iconv = utils.requireIconv()

const aliases = {
  armscii8: "armscii-8",
  georgianacademy: "georgian-academy",
  georgianps: "georgian-ps",
  iso646cn: "iso646-cn",
  iso646jp: "iso646-jp",
  hproman8: "hp-roman8"
}

function iconvAlias (enc) {
  let r
  if ((r = /windows(\d+)/.exec(enc))) return "windows-" + r[1]
  if ((r = /iso8859(\d+)/.exec(enc))) return "iso8859-" + r[1]
  if ((r = /koi8(\w+)/.exec(enc))) return "koi8-" + r[1]
  if (aliases[enc]) return aliases[enc]
  return enc
}

const normalizedEncodings = { windows1255: true, windows1258: true, tcvn: true }

const combClass = { "\u0327": 202, "\u0323": 220, "\u031B": 216 } // Combining class of unicode characters.
for (let i = 0x300; i < 0x315; i++) combClass[String.fromCharCode(i)] = 230

const iconvEquivChars = {
  // eslint-disable-next-line
  cp1163: { '\u00D0': '\u0110', '\u203E': '\u00AF' }
}

// Generate tests for all SBCS encodings.
iconv.encode("", "utf8") // Load all encodings.

describe("Full SBCS encoding tests #node-web", function () {
  this.timeout(10000)

  for (const enc in iconv.encodings) {
    if (iconv.encodings[enc].type === "_sbcs") {
      (function (enc) {
        const iconvName = iconvAlias(enc)
        const testEncName = enc + (enc !== iconvName ? " (" + iconvName + ")" : "")
        const charData = sbcsData[iconvName]

        assert(
          charData != null,
                    `Encoding ${iconvName} doesn't have test data in sbcs-data.json file`
        )

        it("Decode SBCS encoding " + testEncName, function () {
          if (charData === false) {
            this.skip()
          }

          const errors = []
          utils.rleDecodeForEach(charData.decode, (strExpected, i) => {
            if (!strExpected) strExpected = iconv.defaultCharUnicode

            const buf = utils.bytes([i])
            const strActual = iconv.decode(buf, enc)
            if (strActual !== strExpected)
            { errors.push({
              inputHex: utils.hex(buf),
              strExpected: strExpected,
              strActual: strActual
            }) }
          })
          if (errors.length > 0) {
            const errs = errors
              .map((err) =>
                [
                  err.inputHex,
                  utils.strToHex(err.strExpected),
                  utils.strToHex(err.strActual),
                  err.strExpected,
                  err.strActual
                ].join(" | ")
              )
              .map((s) => "          " + s)
              .join("\n")

            assert.fail(
                            `Decoding mismatch: <input> | <expected> | <actual> | <expected char> | <actual char>\n${errs}\n       `
            )
          }
        })

        it("Encode SBCS encoding " + testEncName, function () {
          if (charData === false) {
            this.skip()
          }

          const errors = []
          utils.rleDecodeForEach(charData.encode, (strExpectedBin, i) => {
            const str = String.fromCharCode(i)
            const errorCharHex = utils.hex(
              utils.bytes([iconv.defaultCharSingleByte.charCodeAt(0)])
            )

            const strExpectedBytes = Array.prototype.map.call(strExpectedBin, (char) =>
              char.charCodeAt(0)
            )
            const strExpected = strExpectedBin
              ? utils.hex(utils.bytes(strExpectedBytes))
              : errorCharHex

            const strActual = utils.hex(iconv.encode(str, enc))

            if (strExpected === strActual) return

            // We are not supporting unicode normalization/decomposition of input, so skip it.
            // (when single unicode char results in >1 encoded chars because of diacritics)
            if (normalizedEncodings[enc] && strActual === errorCharHex) {
              const strDenormStrict = unorm.nfd(str) // Strict decomposition
              if (strExpected === utils.hex(iconv.encode(strDenormStrict, enc)))
              { return }

              const strDenorm = unorm.nfkd(str) // Check also compat decomposition.
              if (strExpected === utils.hex(iconv.encode(strDenorm, enc))) return

              // Try semicomposition if we have 2 combining characters.
              if (
                strDenorm.length === 3 &&
                                !combClass[strDenorm[0]] &&
                                combClass[strDenorm[1]] &&
                                combClass[strDenorm[2]]
              ) {
                // Semicompose without swapping.
                const strDenorm2 =
                                    unorm.nfc(strDenorm[0] + strDenorm[1]) + strDenorm[2]
                if (strExpected === utils.hex(iconv.encode(strDenorm2, enc)))
                { return }

                // Swap combining characters if they have different combining classes, making swap unicode-equivalent.
                const strDenorm3 =
                                    unorm.nfc(strDenorm[0] + strDenorm[2]) + strDenorm[1]
                if (strExpected === utils.hex(iconv.encode(strDenorm3, enc))) {
                  if (combClass[strDenorm[1]] !== combClass[strDenorm[2]]) return
                  // In theory, if combining classes are the same, we can not swap them. But iconv thinks otherwise.
                  // So we skip this too.
                  else return
                }
              }
            }

            // Iconv sometimes treats some characters as equivalent. Check it and skip.
            if (
              iconvEquivChars[enc] &&
                            iconvEquivChars[enc][str] &&
                            strExpected === utils.hex(iconv.encode(iconvEquivChars[enc][str], enc))
            )
            { return }

            errors.push({
              input: utils.strToHex(str),
              inputChar: str,
              strExpected: strExpected,
              strActual: strActual
            })
          })

          if (errors.length > 0) {
            const errs = errors
              .map((err) =>
                [err.input, err.inputChar, err.strExpected, err.strActual].join(
                  " | "
                )
              )
              .map((s) => "          " + s)
              .join("\n")

            assert.fail(
                            `Encoding mismatch: <input> | <input char> | <expected> | <actual>\n${errs}\n       `
            )
          }
        })

        /*
            // TODO: Implement unicode composition. After that, this test will be meaningful.

            // Create a large random text.
            const buf2 = Buffer.alloc(100);
            for (let i = 0; i < buf2.length; i++)
                buf2[i] = buf[(Math.random()*buf.length) | 0];

            // Check both encoding and decoding.
            assert.strictEqual(JSON.stringify(iconv.decode(buf2, enc)), JSON.stringify(str = conv.convert(buf2).toString()));
            assert.strictEqual(iconv.encode(str, enc).toString('hex'), convBack.convert(Buffer.from(str)).toString('hex'));
            */
      })(enc) } }
})
