import iconv from "../../lib"
import type { Encoding } from "../../lib"
import { expectTypeOf } from "expect-type"

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
