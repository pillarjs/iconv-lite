"use strict"

var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

// Make all valid input combinations for a given encoding and call fn with it.
// fn(valid, input, output)
function forAllChars (converter, fn, origbuf, len) {
  if (!origbuf) {
    origbuf = Buffer.alloc(10)
    len = 1
  }
  if (!converter.chars) converter.chars = 1
  var buf = origbuf.slice(0, len)
  for (var i = 0; i < 0x100; i++) {
    if (converter.chars++ > 0x20000) return
    buf[len - 1] = i
    try {
      var res = converter(buf)

      // buf contains correct input combination. Run fn with input and converter output.
      fn(true, buf, res)
    } catch (e) {
      if (e.code === "EILSEQ") {
        // Invalid character sequence.
        // Notify that this sequence is invalid.
        fn(false, buf)
      } else if (e.code === "EINVAL") {
        // Partial character sequence.
        // Recurse deeper.
        forAllChars(converter, fn, origbuf, len + 1)
      } else throw e
    }
  }
}

function convertWithDefault (converter, buf) {
  try {
    return converter.convert(buf)
  } catch (e) {
    if (e.code !== "EILSEQ") throw e
  }
  return Buffer.from(iconv.defaultCharSingleByte)
}

var aliases = {
  shiftjis: "cp932",
  big5hkscs: "big5-hkscs"
}

// prettier-ignore
var iconvChanges = { // Characters that iconv changing (iconv char -> our char)
  // shiftjis/cp932 is changed in iconv (see comments in cp932.h)
  shiftjis: { "〜": "～", "‖": "∥", "−": "－", "¢": "￠", "£": "￡", "¬": "￢" },
  eucjp: { "〜": "～", "‖": "∥", "−": "－", "¢": "￠", "£": "￡", "¬": "￢" },
  cp950: { "¥": "￥" },

  // Big5 is known for lots of different variations. We use Encoding Standard.
  big5hkscs: { "•": "‧", "､": "﹑", "‾": "¯", "∼": "～", "♁": "⊕", "☉": "⊙", "／": "∕", "＼": "﹨", "¥": "￥", "¢": "￠", "£": "￡" },

  // Iconv encodes some chars to the PUA area. In ICU there's no such mapping.
  gb18030: {
    ḿ: "",
    龴: "",
    龵: "",
    龶: "",
    龷: "",
    龸: "",
    龹: "",
    龺: "",
    龻: "",
    "︐": "",
    "︑": "",
    "︒": "",
    "︓": "",
    "︔": "",
    "︕": "",
    "︖": "",
    "︗": "",
    "︘": "",
    "︙": ""
  }
}

// prettier-ignore
var iconvCannotDecode = { // Characters that we can decode, but iconv cannot. Encoding -> correct char. Also use them for encoding check.
  shiftjis: { 80: "\x80", "5c": "¥", "7e": "‾", "81ca": "￢" },
  eucjp: {
    adf0: "≒",
    adf1: "≡",
    adf2: "∫",
    adf3: "∮",
    adf4: "∑",
    adf5: "√",
    adf6: "⊥",
    adf7: "∠",
    adf8: "∟",
    adf9: "⊿",
    adfa: "∵",
    adfb: "∩",
    adfc: "∪",
    a1c2: "∥",
    ade2: "№",
    ade4: "℡",

    adb5: "Ⅰ",
    adb6: "Ⅱ",
    adb7: "Ⅲ",
    adb8: "Ⅳ",
    adb9: "Ⅴ",
    adba: "Ⅵ",
    adbb: "Ⅶ",
    adbc: "Ⅷ",
    adbd: "Ⅸ",
    adbe: "Ⅹ",
    fcf1: "ⅰ",
    fcf2: "ⅱ",
    fcf3: "ⅲ",
    fcf4: "ⅳ",
    fcf5: "ⅴ",
    fcf6: "ⅵ",
    fcf7: "ⅶ",
    fcf8: "ⅷ",
    fcf9: "ⅸ",
    fcfa: "ⅹ",
    ada1: "①",
    ada2: "②",
    ada3: "③",
    ada4: "④",
    ada5: "⑤",
    ada6: "⑥",
    ada7: "⑦",
    ada8: "⑧",
    ada9: "⑨",
    adaa: "⑩",
    adab: "⑪",
    adac: "⑫",
    adad: "⑬",
    adae: "⑭",
    adaf: "⑮",
    adb0: "⑯",
    adb1: "⑰",
    adb2: "⑱",
    adb3: "⑲",
    adb4: "⑳",

    ade0: "〝",
    ade1: "〟",
    adea: "㈱",
    adeb: "㈲",
    adec: "㈹",
    ade5: "㊤",
    ade6: "㊥",
    ade7: "㊦",
    ade8: "㊧",
    ade9: "㊨",
    adc6: "㌃",
    adca: "㌍",
    adc1: "㌔",
    adc4: "㌘",
    adc2: "㌢",
    adcc: "㌣",
    adcb: "㌦",
    adc5: "㌧",
    adcd: "㌫",
    adc7: "㌶",
    adcf: "㌻",
    adc0: "㍉",
    adce: "㍊",
    adc3: "㍍",
    adc8: "㍑",
    adc9: "㍗",
    addf: "㍻",
    adef: "㍼",
    adee: "㍽",
    aded: "㍾",
    add3: "㎎",
    add4: "㎏",
    add0: "㎜",
    add1: "㎝",
    add2: "㎞",
    add6: "㎡",
    add5: "㏄",
    ade3: "㏍",
    f9af: "仼",
    f9c1: "僴",
    f9c7: "凬",
    f9ce: "匇",
    f9cf: "匤",
    f9d6: "咊",
    f9da: "坙",
    f9e1: "增",
    f9ee: "寬",
    f9f2: "峵",
    f9f4: "嵓",
    f9fe: "德",
    faa3: "悅",
    faa7: "愠",
    fab3: "敎",
    fab6: "昻",
    fabb: "晥",
    facb: "栁",
    fad4: "橫",
    fad8: "櫢",
    fae7: "淲",
    fae6: "淸",
    faf3: "瀨",
    f9a7: "炻",
    fbb3: "甁",
    fbb5: "皂",
    fbb7: "皞",
    fbc1: "礰",
    fbc9: "竧",
    fbd1: "綠",
    fbd2: "緖",
    fbd8: "荢",
    fbe2: "薰",
    fbe5: "蠇",
    fbf0: "譿",
    fbf2: "賴",
    fbf4: "赶",
    fbfa: "郞",
    fbfc: "鄕",
    fcce: "閒",
    fcd4: "霻",
    fcd6: "靍",
    fcd8: "靑",
    fce0: "馞",
    fce2: "髙",
    fce5: "魲",
    fcee: "黑",
    fac6: "朗",
    fccf: "隆",
    f9d4: "﨎",
    f9df: "﨏",
    f9e0: "塚",
    f9f5: "﨑",
    fabe: "晴",
    face: "﨓",
    fad0: "﨔",
    fafb: "凞",
    fba3: "猪",
    fbba: "益",
    fbc2: "礼",
    fbc3: "神",
    fbc4: "祥",
    fbc6: "福",
    fbca: "靖",
    fbcd: "精",
    fbd6: "羽",
    fbe1: "﨟",
    fbe3: "蘒",
    fbe4: "﨡",
    fbed: "諸",
    fbf5: "﨣",
    fbf7: "﨤",
    fbf8: "逸",
    fbfb: "都",
    fcb9: "﨧",
    fcc0: "﨨",
    fcd0: "﨩",
    fcdc: "飯",
    fcdd: "飼",
    fcdf: "館",
    fcec: "鶴",
    fcfe: "＂",
    fcfd: "＇",
    a1dd: "－",
    a1f1: "￠",
    a1f2: "￡",
    a2cc: "￢",
    fcfc: "￤"
  },
  big5hkscs: {
    "8e69": "箸",
    "8e6f": "簆",
    "8e7e": "糎",
    "8eab": "緒",
    "8eb4": "縝",
    "8ecd": "者",
    "8ed0": "耨",
    "8f57": "菁",
    "8f69": "蒨",
    "8f6e": "萏",
    "8fcb": "覦",
    "8fcc": "覩",
    "8ffe": "起",
    "906d": "都",
    "907a": "銹",
    "90dc": "靜",
    "90f1": "響",
    "91bf": "鼖",
    9244: "蔃",
    "92af": "兙",
    "92b0": "兛",
    "92b1": "兝",
    "92b2": "兞",
    "92c8": "鍮",
    "92d1": "瑹",
    9447: "浧",
    "94ca": "禛",
    "95d9": "邗",
    9644: "靝",
    "96ed": "瀞",
    "96fc": "嬨",
    "9b76": "爁",
    "9b78": "矗",
    "9b7b": "纇",
    "9bc6": "駖",
    "9bde": "釔",
    "9bec": "惞",
    "9bf6": "澶",
    "9c42": "輶",
    "9c53": "侻",
    "9c62": "營",
    "9c68": "鄄",
    "9c6b": "鷰",
    "9c77": "菏",
    "9cbc": "尐",
    "9cbd": "秣",
    "9cd0": "婧",
    "9d57": "輋",
    "9d5a": "筑",
    "9dc4": "拐",
    "9ea9": "恢",
    "9eef": "痹",
    "9efd": "汊",
    "9f60": "鬮",
    "9f66": "鼗",
    "9fcb": "僭",
    "9fd8": "弌",
    a063: "蠏",
    a077: "拎",
    a0d5: "瑨",
    a0df: "煢",
    a0e4: "牐",

    a145: "‧",
    a14e: "﹑",
    a15a: "╴",
    a1c2: "¯",
    a1c3: "￣",
    a1c5: "ˍ",
    a1e3: "～",
    a1f2: "⊕",
    a1f3: "⊙",
    a1fe: "／",
    a240: "＼",
    a241: "∕",
    a242: "﹨",
    a244: "￥",
    a246: "￠",
    a247: "￡",
    a2cc: "十",
    a2ce: "卅",
    a3c0: "␀",
    a3c1: "␁",
    a3c2: "␂",
    a3c3: "␃",
    a3c4: "␄",
    a3c5: "␅",
    a3c6: "␆",
    a3c7: "␇",
    a3c8: "␈",
    a3c9: "␉",
    a3ca: "␊",
    a3cb: "␋",
    a3cc: "␌",
    a3cd: "␍",
    a3ce: "␎",
    a3cf: "␏",
    a3d0: "␐",
    a3d1: "␑",
    a3d2: "␒",
    a3d3: "␓",
    a3d4: "␔",
    a3d5: "␕",
    a3d6: "␖",
    a3d7: "␗",
    a3d8: "␘",
    a3d9: "␙",
    a3da: "␚",
    a3db: "␛",
    a3dc: "␜",
    a3dd: "␝",
    a3de: "␞",
    a3df: "␟",
    a3e0: "␡",
    a3e1: "€",

    c6cf: "廴",
    c6d3: "无",
    c6d5: "癶",
    c6d7: "隶",
    c6de: "〃",
    c6df: "仝",
    fa5f: "倩",
    fa66: "偽",
    fabd: "包",
    fac5: "卄",
    fad5: "卿",
    fb48: "嘅",
    fbb8: "婷",
    fbf3: "幵",
    fbf9: "廐",
    fc4f: "彘",
    fc6c: "悤",
    fcb9: "撐",
    fce2: "晴",
    fcf1: "杞",
    fdb7: "沜",
    fdb8: "渝",
    fdbb: "港",
    fdf1: "煮",
    fe52: "猪",
    fe6f: "瑜",
    feaa: "瓩",
    fedd: "砉"
  },
  gbk: { // All these will appear in GB18030, + U+0080 = € is compatibility with Windows.
    80: "€",
    a2e3: "€",
    a8bf: "ǹ",
    a98a: "⿰",
    a98b: "⿱",
    a98c: "⿲",
    a98d: "⿳",
    a98e: "⿴",
    a98f: "⿵",
    a990: "⿶",
    a991: "⿷",
    a992: "⿸",
    a993: "⿹",
    a994: "⿺",
    a995: "⿻",
    a989: "〾",
    fe50: "⺁",
    fe54: "⺄",
    fe55: "㑳",
    fe56: "㑇",
    fe57: "⺈",
    fe58: "⺋",
    fe5a: "㖞",
    fe5b: "㘚",
    fe5c: "㘎",
    fe5d: "⺌",
    fe5e: "⺗",
    fe5f: "㥮",
    fe60: "㤘",
    fe62: "㧏",
    fe63: "㧟",
    fe64: "㩳",
    fe65: "㧐",
    fe68: "㭎",
    fe69: "㱮",
    fe6a: "㳠",
    fe6b: "⺧",
    fe6e: "⺪",
    fe6f: "䁖",
    fe70: "䅟",
    fe71: "⺮",
    fe72: "䌷",
    fe73: "⺳",
    fe74: "⺶",
    fe75: "⺷",
    fe77: "䎱",
    fe78: "䎬",
    fe79: "⺻",
    fe7a: "䏝",
    fe7b: "䓖",
    fe7c: "䙡",
    fe7d: "䙌",
    fe80: "䜣",
    fe81: "䜩",
    fe82: "䝼",
    fe83: "䞍",
    fe84: "⻊",
    fe85: "䥇",
    fe86: "䥺",
    fe87: "䥽",
    fe88: "䦂",
    fe89: "䦃",
    fe8a: "䦅",
    fe8b: "䦆",
    fe8c: "䦟",
    fe8d: "䦛",
    fe8e: "䦷",
    fe8f: "䦶",
    fe92: "䲣",
    fe93: "䲟",
    fe94: "䲠",
    fe95: "䲡",
    fe96: "䱷",
    fe97: "䲢",
    fe98: "䴓",
    fe99: "䴔",
    fe9a: "䴕",
    fe9b: "䴖",
    fe9c: "䴗",
    fe9d: "䴘",
    fe9e: "䴙",
    fe9f: "䶮",
    a6d9: "︐",
    a6da: "︒",
    a6db: "︑",
    a6dc: "︓",
    a6dd: "︔",
    a6de: "︕",
    a6df: "︖",
    a6ec: "︗",
    a6ed: "︘",
    a6f3: "︙",
    fe59: "龴",
    fe61: "龵",
    fe66: "龶",
    fe67: "龷",
    fe6d: "龸",
    fe7e: "龹",
    fe90: "龺",
    fea0: "龻",

    // iconv and ICU are mapping "a3 a0" -> U+E5E5. However, WebKit/Chrome maps it to U+3000 noting compatibility with older websites.
    // Encoding Standard stands on the side of WebKit, so we are too.
    // See discussion in https://www.w3.org/Bugs/Public/show_bug.cgi?id=25396 and http://goo.gl/ocjnDR
    a3a0: "\u3000",

    // Align with GB18030-2005 standard (see https://github.com/whatwg/encoding/issues/22)
    a8bc: "ḿ"
  },
  gb18030: {
    80: "€", a3a0: "\u3000"
  }
}

function swapBytes (buf) {
  for (var i = 0; i < buf.length; i += 2) buf.writeUInt16LE(buf.readUInt16BE(i), i)
  return buf
}
function spacify2 (str) {
  return str.replace(/(..)/g, "$1 ").trim()
}
function spacify4 (str) {
  return str.replace(/(....)/g, "$1 ").trim()
}
function strToHex (str) {
  return spacify4(swapBytes(Buffer.from(str, "ucs2")).toString("hex"))
}

// Generate tests for all DBCS encodings.
iconv.encode("", "utf8") // Load all encodings.

describe("Full DBCS encoding tests", function () {
  this.timeout(10000) // These tests are pretty slow.

  var Iconv
  try {
    Iconv = require("iconv").Iconv
  } catch (_e) {}

  for (var enc in iconv.encodings) {
    if (iconv.encodings[enc].type === "_dbcs") {
      (function (enc) {
      // Create tests for this encoding.
        it("Decode DBCS encoding '" + enc + "'", function () {
          if (!Iconv) {
            this.skip() // Skip if Iconv is available
          }

          var iconvChgs = iconvChanges[enc] || {}
          var iconvCannotDecodeChars = iconvCannotDecode[enc] || {}
          var converter = new Iconv(aliases[enc] || enc, "utf-8")
          var errors = []
          forAllChars(converter.convert.bind(converter), function (valid, inp, outp) {
            const strActual = iconv.decode(inp, enc)
            const charCode = strActual.charCodeAt(0)

            if (charCode >= 0xe000 && charCode < 0xf900)
            // Skip Private use area.
            { return }

            let strExpected
            if (valid) {
              strExpected = outp.toString("utf-8")
              if (strActual === strExpected) return

              const charCode = strExpected.charCodeAt(0)
              if (charCode >= 0xe000 && charCode < 0xf900)
              // Skip Private use area.
              { return }

              if (iconvChgs[strExpected] === strActual)
              // Skip iconv changes.
              { return }
            } else {
              strExpected = "�"
              if (strActual[0] === "�") return

              if (iconvCannotDecodeChars[inp.toString("hex")] === strActual)
              // Skip what iconv cannot encode.
              { return }
            }

            errors.push({
              input: inp.toString("hex"),
              strExpected: strExpected,
              strActual: strActual
            })
          })

          if (errors.length > 0) {
            const errs = errors
              .map((err) =>
                [
                  spacify2(err.input),
                  strToHex(err.strExpected),
                  strToHex(err.strActual),
                  err.strExpected,
                  err.strActual
                ].join(" | ")
              )
              .map((s) => "          " + s)
              .join("\n")

            assert.fail(
              null,
              null,
                            `Decoding mismatch: <input> | <expected> | <actual> | <expected char> | <actual char>\n${errs}\n       `
            )
          }
        })

        it("Encode DBCS encoding '" + enc + "'", function () {
          if (!Iconv) {
            this.skip() // Skip if Iconv is available
          }

          var iconvChgs = iconvChanges[enc] || {}
          var iconvCannotDecodeChars = iconvCannotDecode[enc] || {}
          var converter = new Iconv("utf-8", aliases[enc] || enc)
          var converterBack = new Iconv(aliases[enc] || enc, "utf-8")
          var errors = []
          for (var i = 0; i < 0x10000; i++) {
            if (i === 0xd800) i = 0xf900 // Skip surrogates & private use.

            var str = String.fromCharCode(i)

            var bufExpected = convertWithDefault(converter, str)
            var strExpected = bufExpected.toString("hex")

            var bufActual = iconv.encode(str, enc)
            var strActual = bufActual.toString("hex")

            if (strExpected === strActual) continue

            if (strExpected === "3f" && iconvCannotDecodeChars[strActual] === str)
            { continue } // Check the iconv cannot encode this char, but we encoded correctly.

            var str1 = iconv.decode(bufExpected, enc)
            var str12 = iconv.decode(bufActual, enc)
            var str2 = convertWithDefault(converterBack, bufActual).toString()
            var str22 = convertWithDefault(converterBack, bufExpected).toString()
            if (
              str1 === str &&
                            str12 === str &&
                            str22 === str &&
                            (str2 === str || iconvCannotDecodeChars[strActual] === str)
            )
            { continue } // There are multiple ways to encode str, so it doesn't matter which we choose.

            if (iconvChgs[str] === str1) continue // Skip iconv changes.

            errors.push({
              input: strToHex(str),
              inputChar: str,
              strExpected: strExpected,
              strActual: strActual
            })
          }

          if (errors.length > 0) {
            const errs = errors
              .map((err) =>
                [
                  err.input,
                  err.inputChar,
                  spacify2(err.strExpected),
                  spacify2(err.strActual)
                ].join(" | ")
              )
              .map((s) => "          " + s)
              .join("\n")

            assert.fail(
              null,
              null,
                            `Encoding mismatch: <input> | <input char> | <expected> | <actual>\n${errs}\n       `
            )
          }
        })
      })(enc) }
  }
})
