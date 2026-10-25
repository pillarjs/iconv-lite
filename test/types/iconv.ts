import iconv, { encode, decode, getEncoder } from "iconv-lite"
import type { Encoding } from "iconv-lite"
import { expectTypeOf } from "expect-type"

// Default and named ESM exports preserve the output type of each entry point.
import webIconv, { encode as webEncode, getEncoder as webEncoder } from "iconv-lite/web"
import webBackend from "iconv-lite/backends/web.js"

expectTypeOf(iconv._canonicalizeEncoding).toBeFunction()
expectTypeOf(iconv.encode).toBeFunction()
expectTypeOf(iconv.decode).toBeFunction()
expectTypeOf(iconv.encodingExists).toBeFunction()
expectTypeOf(iconv.toEncoding).toBeFunction()
expectTypeOf(iconv.fromEncoding).toBeFunction()
expectTypeOf(iconv.decodeStream).toBeFunction()
expectTypeOf(iconv.encodeStream).toBeFunction()
expectTypeOf(iconv.enableStreamingAPI).toBeFunction()
expectTypeOf(iconv.getEncoder).toBeFunction()
expectTypeOf(iconv.getDecoder).toBeFunction()
expectTypeOf(iconv.getCodec).toBeFunction()

expectTypeOf(iconv._codecDataCache).toBeObject()
expectTypeOf(iconv.defaultCharUnicode).toBeString()
expectTypeOf(iconv.defaultCharSingleByte).toBeString()
expectTypeOf(iconv.supportsStreams).toBeBoolean()
expectTypeOf(iconv.encodings).toEqualTypeOf<Record<
  Encoding,
  | string
  | {
    type: string
    [key: string]: any
  }
> | null>()

expectTypeOf<Encoding>().toBeString()

expectTypeOf(encode("hello", "utf8")).toEqualTypeOf<Buffer>()
expectTypeOf(decode(new Uint8Array(), "utf8")).toEqualTypeOf<string>()
expectTypeOf(getEncoder("utf8").write("hello")).toEqualTypeOf<Buffer>()
expectTypeOf(webEncode("hello", "utf8")).toEqualTypeOf<Uint8Array>()
expectTypeOf(webEncoder("utf8").write("hello")).toEqualTypeOf<Uint8Array>()
webIconv.setBackend(webBackend)
webIconv.defaultCharUnicode = "?"
