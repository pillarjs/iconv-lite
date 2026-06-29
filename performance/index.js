"use strict"

const iconv = require("iconv")
const iconvLite = require("../lib")
const { Suite } = require("bench-node")

iconvLite.setBackend(require("../backends/node"))

const suite = new Suite({
  pretty: true,
  reporterOptions: {
    printHeader: true // Set to false to hide system info header
  }
})

const encodingStrings = {
  "windows-1251": "This is a test string 32 chars..",
  gbk: "这是中文字符测试。。！@￥%12",
  utf8: "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-16le": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-16be": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-7": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-32": "这是中文字符测试。。！@￥%12This is a test string 48 chars.."
}

// Not every encoding is supported by the native TextDecoder (e.g. utf-7 is not part of
// the WHATWG Encoding Standard), so we only add that comparison when the runtime supports it.
function textDecoderSupports (encoding) {
  try {
    const decoder = new TextDecoder(encoding)
    return Boolean(decoder)
  } catch {
    return false
  }
}

// How many times the base string is repeated for each size variant. "small" is a typical short
// string; "large" approximates bulk payloads, where native/SIMD paths and per-call overhead differ.
const sizes = { small: 1, large: 100 }

for (const [encoding, baseString] of Object.entries(encodingStrings)) {
  for (const [size, repeat] of Object.entries(sizes)) {
    const string = baseString.repeat(repeat)

    suite.add(`${encoding}/${size}/encode/iconv-lite`, function () {
      iconvLite.encode(string, encoding)
    })
    suite.add(`${encoding}/${size}/encode/iconv`, function () {
      const converter = new iconv.Iconv("utf8", encoding)
      converter.convert(string)
    })
    suite.add(`${encoding}/${size}/decode/iconv-lite`, function (timer) {
      const buffer = iconvLite.encode(string, encoding)
      timer.start()
      iconvLite.decode(buffer, encoding)
      timer.end()
    })
    suite.add(`${encoding}/${size}/decode/iconv`, function (timer) {
      const buffer = iconvLite.encode(string, encoding)
      timer.start()
      const converter = new iconv.Iconv(encoding, "utf8")
      converter.convert(buffer).toString()
      timer.end()
    })
    if (textDecoderSupports(encoding)) {
      suite.add(`${encoding}/${size}/decode/native-TextDecoder`, function (timer) {
        const buffer = iconvLite.encode(string, encoding)
        timer.start()
        new TextDecoder(encoding).decode(buffer)
        timer.end()
      })
    }
  }
}

suite.run()
