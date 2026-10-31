/* eslint no-console: "off" */
"use strict"

import { Iconv } from "iconv"
import testUtils from "../test/helpers/utils.js"
import fs from "fs"
import path from "path"
import assert from "assert"

const skipEncodings = {
  maccenteuro: true,
  cp808: true,
  mik: true,
  cp720: true
}

const encodings = [
  "windows-874",
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1255",
  "windows-1256",
  "windows-1257",
  "windows-1258",
  "iso8859-1",
  "iso8859-2",
  "iso8859-3",
  "iso8859-4",
  "iso8859-5",
  "iso8859-6",
  "iso8859-7",
  "iso8859-8",
  "iso8859-9",
  "iso8859-10",
  "iso8859-11",
  "iso8859-13",
  "iso8859-14",
  "iso8859-15",
  "iso8859-16",
  "cp437",
  "cp720",
  "cp737",
  "cp775",
  "cp808",
  "cp850",
  "cp852",
  "cp855",
  "cp856",
  "cp857",
  "cp858",
  "cp860",
  "cp861",
  "cp862",
  "cp863",
  "cp864",
  "cp865",
  "cp866",
  "cp869",
  "cp922",
  "cp1046",
  "cp1124",
  "cp1125",
  "cp1129",
  "cp1133",
  "cp1161",
  "cp1162",
  "cp1163",
  "maccenteuro",
  "maccroatian",
  "maccyrillic",
  "macgreek",
  "maciceland",
  "macroman",
  "macromania",
  "macthai",
  "macturkish",
  "macukraine",
  "koi8-r",
  "koi8-u",
  "koi8-ru",
  "koi8-t",
  "armscii-8",
  "rk1048",
  "tcvn",
  "georgian-academy",
  "georgian-ps",
  "pt154",
  "viscii",
  "iso646-cn",
  "iso646-jp",
  "hp-roman8",
  "macintosh",
  "ascii",
  "tis620",
  "mik"
]

const res = Object.fromEntries(
  encodings.map((encoding) => {
    if (skipEncodings[encoding]) {
      console.log(`Skipping ${encoding}`)
      delete skipEncodings[encoding]
      return [encoding, false]
    }
    console.log(`Processing ${encoding}`)

    // Create decode data
    const decoder = new Iconv(encoding, "utf-8")
    const decodeArr = []

    for (let i = 0; i < 0x100; i++) {
      let str = ""
      try {
        str = decoder.convert(Buffer.from([i])).toString()
        assert(typeof str === "string" && str.length > 0)
      } catch (e) {
        if (e.code !== "EILSEQ") throw e
      }
      decodeArr.push(str)
    }
    const decodeStr = testUtils.rleEncode(decodeArr)
    let idx = 0
    testUtils.rleDecodeForEach(decodeStr, (str, i) => {
      assert.strictEqual(i, idx++)
      assert.strictEqual(str, decodeArr[i])
    })

    // Create encode data
    const encoder = new Iconv("utf-8", encoding)
    const encodeArr = []
    for (let i = 0; i < 0xfff0; i++) {
      // Skip surrogates
      if (i >= 0xd800 && i < 0xe000) {
        encodeArr.push("")
        continue
      }

      let str = ""
      try {
        str = encoder
          .convert(Buffer.from(String.fromCharCode(i), "utf8"))
          .toString("binary")
        assert(typeof str === "string" && str.length > 0)
      } catch (e) {
        if (e.code !== "EILSEQ") throw e
      }
      encodeArr.push(str)
    }

    const encodeStr = testUtils.rleEncode(encodeArr)
    idx = 0
    testUtils.rleDecodeForEach(encodeStr, (str, i) => {
      assert.strictEqual(i, idx++)
      assert.strictEqual(str, encodeArr[i])
    })

    const value = {
      decode: decodeStr,
      encode: encodeStr
    }
    return [encoding, value]
  })
)
assert.deepEqual(skipEncodings, {}, "Some skipped encodings are not found in 'encodings' array.")

// Write results.
const resFile = path.join(import.meta.dirname, "../test/tables/sbcs-data.json")

fs.mkdirSync(path.dirname(resFile), { recursive: true })
fs.writeFileSync(resFile, JSON.stringify(res, null, 2))
console.log(`Successfully written ${resFile}`)
