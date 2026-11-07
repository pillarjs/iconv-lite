import iconv from "iconv"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readFileSync } from "node:fs"
import { Suite } from "bench-node"
import { parseArgs } from "node:util"
import { canonicalEncoding, competitors } from "./competitors.js"

const { values, positionals } = parseArgs({
  options: { check: { type: "boolean", default: false } },
  allowPositionals: true
})
if (positionals.length > 1) throw new Error("Usage: performance/index.js [checkout] [--check]")
const iconvPath = path.resolve(positionals[0] || path.join(import.meta.dirname, ".."))
const pkg = JSON.parse(readFileSync(path.join(iconvPath, "package.json"), "utf8"))
const { default: iconvLite } = await import(pathToFileURL(path.resolve(iconvPath, pkg.main || "index.js")))

const encodingStrings = {
  "windows-1251": "This is a test string 32 chars..",
  gbk: "这是中文字符测试。。！@￥%12",
  "gbk-ascii": "This is a test string 32 chars..",
  gb18030: "这是中文字符测试😱𠕇abc12",
  "gb18030-bmp4": "\u0080\u0081\u0082\u0083",
  "gb18030-supplementary": "😱𠕇😀𠀀",
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

// Validation and fixture preparation must stay outside the measured operation.
function addChecked (suite, name, run, expected) {
  if (!run) {
    console.error(`Skipping ${name}: unsupported operation`)
    return
  }
  try {
    const actual = run()
    const equal = typeof expected === "string"
      ? actual === expected
      : actual instanceof Uint8Array && Buffer.from(actual).equals(Buffer.from(expected))
    if (!equal) {
      console.error(`Skipping ${name}: ${typeof expected === "string" ? "decoded text differs" : "encoded bytes differ"}`)
      return
    }
  } catch (error) {
    console.error(`Skipping ${name}: ${error.message}`)
    return
  }
  suite.add(name, run)
  if (values.check) console.log(`OK ${name}`)
}

async function main () {
  console.log(`iconv-lite: ${pkg.version} (${iconvPath})`)
  for (const [name, packageURL] of [
    ["@exodus/bytes", new URL("./package.json", import.meta.resolve("@exodus/bytes/encoding.js"))],
    ["iconv-nano", new URL(import.meta.resolve("iconv-nano/package.json"))]
  ]) {
    console.log(`${name}: ${JSON.parse(readFileSync(packageURL, "utf8")).version}`)
  }
  for (const backend of ["node", "web"]) {
    const { default: implementation } = await import(pathToFileURL(path.join(iconvPath, "backends", backend + ".js")))
    iconvLite.setBackend(implementation)
    console.log(`\nBackend: ${backend}`)
    const suite = new Suite({
      pretty: true,
      reporterOptions: {
        printHeader: true
      }
    })

    for (const [label, baseString] of Object.entries(encodingStrings)) {
      const encoding = label === "gbk-ascii" ? "gbk" : label.startsWith("gb18030-") ? "gb18030" : label
      const alternatives = competitors(encoding)
      const nativeEncoding = canonicalEncoding(encoding)
      for (const [size, repeat] of Object.entries(sizes)) {
        const string = baseString.repeat(repeat)
        const buffer = iconvLite.encode(string, encoding)
        const nativeBuffer = Buffer.from(buffer)

        addChecked(suite, `${label}/${size}/encode/iconv-lite`, function () {
          return iconvLite.encode(string, encoding)
        }, buffer)
        addChecked(suite, `${label}/${size}/encode/iconv`, function () {
          const converter = new iconv.Iconv("utf8", encoding)
          return converter.convert(string)
        }, buffer)
        addChecked(suite, `${label}/${size}/decode/iconv-lite`, function () {
          return iconvLite.decode(buffer, encoding)
        }, string)
        addChecked(suite, `${label}/${size}/decode/iconv`, function () {
          const converter = new iconv.Iconv(encoding, "utf8")
          return converter.convert(nativeBuffer).toString()
        }, string)
        if (textDecoderSupports(nativeEncoding)) {
          addChecked(suite, `${label}/${size}/decode/native-TextDecoder`, function () {
            return new TextDecoder(nativeEncoding).decode(buffer)
          }, string)
        }
        for (const codec of alternatives) {
          addChecked(suite, `${label}/${size}/encode/${codec.name}`,
            codec.encode && (() => codec.encode(string)), buffer)
          addChecked(suite, `${label}/${size}/decode/${codec.name}`,
            codec.decode && (() => codec.decode(buffer)), string)
        }
      }
    }

    // Invalid GB18030 pointers must be rejected as complete four-byte sequences.
    for (const [label, bytes] of [
      ["gb18030-gap", [0x84, 0x31, 0xa5, 0x30]],
      ["gb18030-out-of-range", [0xe3, 0x32, 0x9a, 0x36]]
    ]) {
      for (const [size, repeat] of Object.entries(sizes)) {
        const buffer = new Uint8Array(bytes.length * repeat)
        for (let i = 0; i < repeat; i++) buffer.set(bytes, i * bytes.length)
        const expected = "�".repeat(repeat)
        addChecked(suite, `${label}/${size}/decode/iconv-lite`, function () {
          return iconvLite.decode(buffer, "gb18030")
        }, expected)
        for (const codec of competitors("gb18030")) {
          addChecked(suite, `${label}/${size}/decode/${codec.name}`,
            () => codec.decode(buffer), expected)
        }
      }
    }

    for (const encoding of ["big5hkscs", "gb18030"]) {
      const buffer = iconvLite.encode(encodingStrings[encoding], encoding)
      const decodeChunks = function () {
        const decoder = iconvLite.getDecoder(encoding)
        let result = ""
        for (let i = 0; i < buffer.length; i++) result += decoder.write(buffer.subarray(i, i + 1))
        return result + (decoder.end() || "")
      }
      addChecked(suite, `${encoding}/byte-chunks/decode/iconv-lite`, decodeChunks, encodingStrings[encoding])
      for (const codec of competitors(encoding)) {
        addChecked(suite, `${encoding}/byte-chunks/decode/${codec.name}`,
          codec.decodeChunks && (() => codec.decodeChunks(buffer)), encodingStrings[encoding])
      }
    }

    if (!values.check) await suite.run()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
