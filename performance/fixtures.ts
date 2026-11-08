import type { Backend, Iconv } from "iconv-lite"
import iconv from "iconv"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readFileSync } from "node:fs"
import { canonicalEncoding, competitors } from "./competitors.ts"

export interface BenchmarkCase {
  name: string
  run?: () => unknown
  expected: string | Uint8Array
  resultType?: Uint8ArrayConstructor | typeof Buffer
}

const encodingStrings: Record<string, string> = {
  "windows-1251": "This is a test string 32 chars..",
  gbk: "这是中文字符测试。。！@￥%12",
  "gbk-ascii": "This is a test string 32 chars..",
  gb18030: "这是中文字符测试😱𠕇abc12",
  "gb18030-bmp4": "\u0080\u0081\u0082\u0083",
  "gb18030-supplementary": "😱𠕇😀𠀀",
  big5hkscs: "中文測試Ê\u0304𠕇abc12",
  shift_jis: "日本語の文字列テストabc12",
  eucjp: "日本語の文字列テスト˘abc12",
  "iso-2022-jp": "日本語の文字列テストabc12",
  "iso-2022-jp-ascii": "This is a test string 32 chars..",
  "iso-2022-jp-transitions": "a管b理¥x‾\\~\r\n日本",
  cp949: "한국어문자열테스트abc12",
  utf8: "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-16le": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-16be": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-7": "这是中文字符测试。。！@￥%12This is a test string 48 chars..",
  "utf-32": "这是中文字符测试。。！@￥%12This is a test string 48 chars.."
}

// Not every encoding is supported by the native TextDecoder (e.g. utf-7 is not part of
// the WHATWG Encoding Standard), so we only add that comparison when the runtime supports it.
function textDecoderSupports (encoding: string) {
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

// Fixtures are prepared once; validation and timing use the same operations.
export async function createCases () {
  const iconvPath = path.resolve(process.env.ICONV_LITE_BENCH_ROOT || path.join(import.meta.dirname, ".."))
  const pkg = JSON.parse(readFileSync(path.join(iconvPath, "package.json"), "utf8"))
  const entry = path.resolve(iconvPath, pkg.main || "index.js")
  const { default: iconvLite } = await import(pathToFileURL(entry).href)
  const Codec = iconvLite.constructor as new (backend: Backend) => Iconv<Uint8Array>
  const implementations: { name: string, codec: Iconv<Uint8Array>, bytes: Uint8ArrayConstructor | typeof Buffer }[] = []
  for (const backend of ["node", "web"]) {
    const { default: implementation } = await import(pathToFileURL(path.resolve(path.dirname(entry), "../backends", backend + ".js")).href)
    // Separate instances keep both backends and codec caches alive in the same comparison.
    implementations.push({
      name: `iconv-lite (${backend})`,
      codec: new Codec(implementation),
      bytes: backend === "node" ? Buffer : Uint8Array
    })
  }
  console.log(`iconv-lite: ${pkg.version} (${iconvPath})`)
  for (const [name, packageURL] of [
    ["@exodus/bytes", new URL("./package.json", import.meta.resolve("@exodus/bytes/encoding.js"))],
    ["iconv-nano", new URL(import.meta.resolve("iconv-nano/package.json"))]
  ]) {
    console.log(`${name}: ${JSON.parse(readFileSync(packageURL, "utf8")).version}`)
  }
  const cases: BenchmarkCase[] = []
  function add (name: string, run: BenchmarkCase["run"], expected: string | Uint8Array, resultType?: BenchmarkCase["resultType"]) {
    cases.push({ name, run, expected, resultType })
  }

  for (const [label, baseString] of Object.entries(encodingStrings)) {
    const encoding = label === "gbk-ascii"
      ? "gbk"
      : label.startsWith("gb18030-")
        ? "gb18030"
        : label.startsWith("iso-2022-jp-") ? "iso-2022-jp" : label
    const alternatives = competitors(encoding)
    const nativeEncoding = canonicalEncoding(encoding)
    for (const [size, repeat] of Object.entries(sizes)) {
      const string = baseString.repeat(repeat)
      const buffer = Uint8Array.from(implementations[0].codec.encode(string, encoding))
      const nativeBuffer = Buffer.from(buffer)

      for (const { name, codec, bytes } of implementations) {
        const input = bytes === Buffer ? nativeBuffer : buffer
        add(`${label}/${size}/encode/${name}`, () => codec.encode(string, encoding), buffer, bytes)
        add(`${label}/${size}/decode/${name}`, () => codec.decode(input, encoding), string)
      }
      add(`${label}/${size}/encode/iconv`, function () {
        const converter = new iconv.Iconv("utf8", encoding)
        return converter.convert(string)
      }, buffer)
      add(`${label}/${size}/decode/iconv`, function () {
        const converter = new iconv.Iconv(encoding, "utf8")
        return converter.convert(nativeBuffer).toString()
      }, string)
      if (textDecoderSupports(nativeEncoding)) {
        add(`${label}/${size}/decode/native-TextDecoder`, function () {
          return new TextDecoder(nativeEncoding).decode(buffer)
        }, string)
      }
      for (const codec of alternatives) {
        add(`${label}/${size}/encode/${codec.name}`,
          codec.encode && (() => codec.encode!(string)), buffer)
        add(`${label}/${size}/decode/${codec.name}`,
          codec.decode && (() => codec.decode!(buffer)), string)
      }
    }
  }

  // Invalid GB18030 pointers must be rejected as complete four-byte sequences.
  for (const [label, bytes] of [
    ["gb18030-gap", [0x84, 0x31, 0xa5, 0x30]],
    ["gb18030-out-of-range", [0xe3, 0x32, 0x9a, 0x36]]
  ] as const) {
    for (const [size, repeat] of Object.entries(sizes)) {
      const buffer = new Uint8Array(bytes.length * repeat)
      for (let i = 0; i < repeat; i++) buffer.set(bytes, i * bytes.length)
      const expected = "�".repeat(repeat)
      for (const { name, codec, bytes } of implementations) {
        const input = bytes.from(buffer)
        add(`${label}/${size}/decode/${name}`, () => codec.decode(input, "gb18030"), expected)
      }
      for (const codec of competitors("gb18030")) {
        add(`${label}/${size}/decode/${codec.name}`,
          () => codec.decode!(buffer), expected)
      }
    }
  }

  for (const encoding of ["big5hkscs", "gb18030", "iso-2022-jp"]) {
    const string = encodingStrings[encoding === "iso-2022-jp" ? "iso-2022-jp-transitions" : encoding]
    const buffer = Uint8Array.from(implementations[0].codec.encode(string, encoding))
    for (const { name, codec, bytes } of implementations) {
      const input = bytes.from(buffer)
      const decodeChunks = function () {
        const decoder = codec.getDecoder(encoding)
        let result = ""
        for (let i = 0; i < input.length; i++) result += decoder.write(input.subarray(i, i + 1))
        return result + (decoder.end() || "")
      }
      add(`${encoding}/byte-chunks/decode/${name}`, decodeChunks, string)
    }
    for (const codec of competitors(encoding)) {
      add(`${encoding}/byte-chunks/decode/${codec.name}`,
        codec.decodeChunks && (() => codec.decodeChunks!(buffer)), string)
    }
    if (encoding === "iso-2022-jp" && textDecoderSupports(encoding)) {
      add(`${encoding}/byte-chunks/decode/native-TextDecoder`, () => {
        const decoder = new TextDecoder(encoding)
        let result = ""
        for (let i = 0; i < buffer.length; i++) result += decoder.decode(buffer.subarray(i, i + 1), { stream: true })
        return result + decoder.decode()
      }, string)
    }
  }

  return cases
}

// Competitor differences are skips, but an iconv-lite regression must fail the run.
export function checkCase ({ name, run, expected, resultType }: BenchmarkCase) {
  let reason
  try {
    if (!run) reason = "unsupported operation"
    else {
      const actual = run()
      const equal = typeof expected === "string"
        ? actual === expected
        : actual instanceof Uint8Array && Buffer.from(actual).equals(Buffer.from(expected))
      if (!equal) reason = typeof expected === "string" ? "decoded text differs" : "encoded bytes differ"
      else if (resultType && (actual as object).constructor !== resultType) reason = "encoded byte type differs"
    }
  } catch (error) {
    reason = (error instanceof Error ? error.message : String(error)) || "operation threw"
  }
  if (reason && /\/iconv-lite \((node|web)\)$/.test(name)) throw new Error(`${name}: ${reason}`)
  return reason
}
