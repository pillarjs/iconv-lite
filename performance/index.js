"use strict"

const iconv = require("iconv")
const path = require("path")
const iconvPath = path.resolve(process.argv[2] || path.join(__dirname, ".."))
const iconvLite = require(iconvPath)
const { Suite } = require("bench-node")

iconvLite.setBackend(require(path.join(iconvPath, "backends", process.argv[3] || "node")))

const suite = new Suite({
  pretty: true,
  reporterOptions: {
    printHeader: true // Set to false to hide system info header
  }
})

const encodingStrings = {
  "windows-1251": "This is a test string 32 chars..",
  gbk: "这是中文字符测试。。！@￥%12",
  "gbk-ascii": "This is a test string 32 chars..",
  gb18030: "这是中文字符测试😱𠕇abc12",
  big5hkscs: "中文測試Ê\u0304𠕇abc12",
  shift_jis: "日本語の文字列テストabc12",
  eucjp: "日本語の文字列テスト˘abc12",
  cp949: "한국어문자열테스트abc12",
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

for (const [label, baseString] of Object.entries(encodingStrings)) {
  const encoding = label === "gbk-ascii" ? "gbk" : label
  for (const [size, repeat] of Object.entries(sizes)) {
    const string = baseString.repeat(repeat)

    suite.add(`${label}/${size}/encode/iconv-lite`, function () {
      iconvLite.encode(string, encoding)
    })
    suite.add(`${label}/${size}/encode/iconv`, function () {
      const converter = new iconv.Iconv("utf8", encoding)
      converter.convert(string)
    })
    suite.add(`${label}/${size}/decode/iconv-lite`, function (timer) {
      const buffer = iconvLite.encode(string, encoding)
      timer.start()
      iconvLite.decode(buffer, encoding)
      timer.end()
    })
    suite.add(`${label}/${size}/decode/iconv`, function (timer) {
      const buffer = Buffer.from(iconvLite.encode(string, encoding))
      timer.start()
      const converter = new iconv.Iconv(encoding, "utf8")
      converter.convert(buffer).toString()
      timer.end()
    })
    if (textDecoderSupports(encoding)) {
      suite.add(`${label}/${size}/decode/native-TextDecoder`, function (timer) {
        const buffer = iconvLite.encode(string, encoding)
        timer.start()
        new TextDecoder(encoding).decode(buffer)
        timer.end()
      })
    }
  }
}

for (const encoding of ["big5hkscs", "gb18030"]) {
  const buffer = iconvLite.encode(encodingStrings[encoding], encoding)
  const decodeChunks = function () {
    const decoder = iconvLite.getDecoder(encoding)
    let result = ""
    for (let i = 0; i < buffer.length; i++) result += decoder.write(buffer.subarray(i, i + 1))
    return result + decoder.end()
  }
  if (decodeChunks() === encodingStrings[encoding]) {
    suite.add(`${encoding}/byte-chunks/decode/iconv-lite`, decodeChunks)
  } else {
    console.error(`Skipping ${encoding}/byte-chunks/decode: incorrect output`)
  }
}

suite.run().catch(error => { console.error(error); process.exitCode = 1 })
