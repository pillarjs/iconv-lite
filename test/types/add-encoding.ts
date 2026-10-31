/* eslint-disable import-x/no-duplicates -- Exercise the distinct Node and Web entry points. */
import iconv, { addEncoding } from "iconv-lite"
import webIconv, { addEncoding as addWebEncoding } from "iconv-lite/web"
import type { CodecOptions, WebIconv, FactoryCodec, EncodeOptions, DecodeOptions, Backend, ConstructorCodec } from "iconv-lite"
import { expectTypeOf } from "expect-type"

class ExternalCodec<Bytes extends Uint8Array> implements FactoryCodec<Bytes> {
  constructor (options: CodecOptions, iconv: WebIconv<Bytes>) {
    expectTypeOf(options.encodingName).toEqualTypeOf<string>()
    expectTypeOf(iconv.backend).toEqualTypeOf<Backend<Bytes>>()
  }

  createEncoder (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    return iconv.getEncoder("utf8", options)
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv<Bytes>) {
    return iconv.getDecoder("utf8", options)
  }
}

addEncoding({ "external-codec": ExternalCodec, "external-alias": "external-codec" })
addWebEncoding({ "external-codec": ExternalCodec }, { replace: true })
expectTypeOf(iconv.encode("A", "external-codec")).toEqualTypeOf<Buffer>()
expectTypeOf(webIconv.encode("A", "external-codec")).toEqualTypeOf<Uint8Array>()
expectTypeOf(webIconv.encodeWebStream("external-codec")).toEqualTypeOf<TransformStream<string, Uint8Array>>()
expectTypeOf(iconv.getDecoder("external-codec").write(new Uint8Array())).toEqualTypeOf<string>()
iconv.encodeStream("external-codec")
webIconv.decodeWebStream("external-codec")

declare class LegacyEncoder {
  constructor (options: EncodeOptions | undefined, codec: ConstructorCodec<Buffer>, backend: Backend<Buffer>)
  write (text: string): Buffer
  end (): undefined
}
declare class LegacyDecoder {
  write (bytes: Uint8Array): string
  end (): string
}
class LegacyCodec {
  encoder = LegacyEncoder
  decoder = LegacyDecoder
}
addEncoding({ legacy: LegacyCodec })

// @ts-expect-error Codec definitions must supply both conversion directions.
addEncoding({ incomplete: class {} })
// @ts-expect-error Module paths must be imported by the caller.
addEncoding("encoding-package")
// @ts-expect-error Replacement requires an explicit boolean option.
addEncoding({ custom: "utf8" }, { replace: "yes" })
