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
  "utf-16be": "这是中文字符测试。。！@￥%12This is a test string 48 chars.."
}

for (const [encoding, string] of Object.entries(encodingStrings)) {
  suite.add(`${encoding}/encode/iconv-lite`, function () {
    iconvLite.encode(string, encoding)
  })
  suite.add(`${encoding}/encode/iconv`, function () {
    const converter = new iconv.Iconv("utf8", encoding)
    converter.convert(string)
  })
  suite.add(`${encoding}/decode/iconv-lite`, function (timer) {
    const buffer = iconvLite.encode(string, encoding)
    timer.start()
    iconvLite.decode(buffer, encoding)
    timer.end()
  })
  suite.add(`${encoding}/decode/iconv`, function (timer) {
    const buffer = iconvLite.encode(string, encoding)
    timer.start()
    const converter = new iconv.Iconv(encoding, "utf8")
    converter.convert(buffer).toString()
    timer.end()
  })
  suite.add(`${encoding}/decode/native-TextDecoder`, function (timer) {
    const buffer = iconvLite.encode(string, encoding)
    timer.start()
    new TextDecoder(encoding).decode(buffer)
    timer.end()
  })
}

suite.run()
