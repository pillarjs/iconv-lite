/* eslint-disable import-x/no-duplicates -- Compare distinct entry points that the linter resolves with browser conditions. */
import iconv, { encode, decode, getEncoder, encodeWebStream, decodeWebStream } from "iconv-lite"
import { canonicalizeEncoding } from "../../lib/utils.js"
import type { Encoding, EncodeOptions } from "iconv-lite"
import { expectTypeOf } from "expect-type"

// Default and named ESM exports preserve the output type of each entry point.
import webIconv, { encode as webEncode, getEncoder as webEncoder, encodeWebStream as webEncodeStream, decodeWebStream as webDecodeStream } from "iconv-lite/web"
import webBackend from "../../backends/web.js"

expectTypeOf(iconv).not.toHaveProperty("_canonicalizeEncoding")
expectTypeOf(webIconv).not.toHaveProperty("_canonicalizeEncoding")
expectTypeOf(iconv).not.toHaveProperty("canonicalizeEncoding")
expectTypeOf(webIconv).not.toHaveProperty("canonicalizeEncoding")
expectTypeOf(webIconv).not.toHaveProperty("encodeStream")
expectTypeOf(webIconv).not.toHaveProperty("decodeStream")
expectTypeOf(webIconv).not.toHaveProperty("enableStreamingAPI")
expectTypeOf(webIconv).not.toHaveProperty("supportsStreams")
expectTypeOf(iconv.encode).toBeFunction()
expectTypeOf(iconv.decode).toBeFunction()
expectTypeOf(iconv.encodingExists).toBeFunction()
expectTypeOf(iconv.toEncoding).toBeFunction()
expectTypeOf(iconv.fromEncoding).toBeFunction()
expectTypeOf(iconv.decodeStream).toBeFunction()
expectTypeOf(iconv.encodeStream).toBeFunction()
expectTypeOf(iconv).not.toHaveProperty("enableStreamingAPI")
expectTypeOf(iconv.getEncoder).toBeFunction()
expectTypeOf(iconv.getDecoder).toBeFunction()
expectTypeOf(iconv.getCodec).toBeFunction()

expectTypeOf(iconv._codecDataCache).toBeObject()
expectTypeOf(iconv.defaultCharUnicode).toBeString()
expectTypeOf(iconv.defaultCharSingleByte).toBeString()
expectTypeOf(iconv.supportsStreams).toBeBoolean()
expectTypeOf(iconv.supportsWebStreams).toBeBoolean()
expectTypeOf(iconv.encodings).toEqualTypeOf<Record<
  Encoding,
  | string
  | {
    type: string
    [key: string]: any
  }
> | null>()

expectTypeOf<Encoding>().toBeString()

expectTypeOf(canonicalizeEncoding("UTF-8")).toEqualTypeOf<string>()
expectTypeOf(canonicalizeEncoding(1251)).toEqualTypeOf<string>()
expectTypeOf(encode("hello", "utf8")).toEqualTypeOf<Buffer>()
expectTypeOf(decode(new Uint8Array(), "utf8")).toEqualTypeOf<string>()
expectTypeOf(getEncoder("utf8").write("hello")).toEqualTypeOf<Buffer>()
expectTypeOf(webEncode("hello", "utf8")).toEqualTypeOf<Uint8Array>()
expectTypeOf(webEncoder("utf8").write("hello")).toEqualTypeOf<Uint8Array>()

// Supplying unrelated options or an explicitly absent handler cannot cancel encoding.
expectTypeOf(encode("hello", "utf8", {})).toEqualTypeOf<Buffer>()
expectTypeOf(iconv.encode("hello", "utf8", { addBOM: true })).toEqualTypeOf<Buffer>()
expectTypeOf(iconv.toEncoding("hello", "utf8", { invalidCharHandler: undefined })).toEqualTypeOf<Buffer>()
expectTypeOf(webIconv.encode("hello", "utf8", undefined)).toEqualTypeOf<Uint8Array>()
expectTypeOf(webIconv.toEncoding("hello", "utf8", { addBOM: true })).toEqualTypeOf<Uint8Array>()
expectTypeOf(getEncoder("utf8", { addBOM: true }).write("hello")).toEqualTypeOf<Buffer>()
expectTypeOf(webEncoder("utf8", {}).write("hello")).toEqualTypeOf<Uint8Array>()
expectTypeOf(getEncoder("utf8").end()).toEqualTypeOf<Buffer | undefined>()
expectTypeOf(webEncoder("utf8").end()).toEqualTypeOf<Uint8Array | undefined>()

// An options value may contain a cancelling handler even if its type makes it optional.
const possiblyCancellingOptions: EncodeOptions = {}
expectTypeOf(encode("hello", "latin1", possiblyCancellingOptions)).toEqualTypeOf<Buffer | null>()
expectTypeOf(webEncode("hello", "latin1", possiblyCancellingOptions)).toEqualTypeOf<Uint8Array | null>()
expectTypeOf(getEncoder("latin1", possiblyCancellingOptions).write("hello")).toEqualTypeOf<Buffer | null>()
expectTypeOf(webEncoder("latin1", possiblyCancellingOptions).end()).toEqualTypeOf<Uint8Array | null | undefined>()

const cancellingOptions = {
  invalidCharHandler: () => true
}
expectTypeOf(iconv.encode("世", "latin1", cancellingOptions)).toEqualTypeOf<Buffer | null>()
expectTypeOf(iconv.toEncoding("世", "latin1", cancellingOptions)).toEqualTypeOf<Buffer | null>()
expectTypeOf(webIconv.encode("世", "latin1", cancellingOptions)).toEqualTypeOf<Uint8Array | null>()
expectTypeOf(getEncoder("latin1", cancellingOptions).end()).toEqualTypeOf<Buffer | null | undefined>()
expectTypeOf(webEncoder("latin1", cancellingOptions).write("世")).toEqualTypeOf<Uint8Array | null>()

// TypeScript allows a value-returning function to be assigned to a void callback.
const handlerTypedAsVoid: (char: string, index: number) => void = () => true
expectTypeOf(encode("世", "latin1", { invalidCharHandler: handlerTypedAsVoid })).toEqualTypeOf<Buffer | null>()
expectTypeOf(webEncode("世", "latin1", {
  invalidCharHandler (char, index) {
    expectTypeOf(char).toEqualTypeOf<string>()
    expectTypeOf(index).toEqualTypeOf<number>()
    return true
  }
})).toEqualTypeOf<Uint8Array | null>()
webIconv.setBackend(webBackend)
webIconv.defaultCharUnicode = "?"

expectTypeOf(encode("🙂", "latin1", { invalidCharHandler: () => ":)" })).toEqualTypeOf<Buffer | null>()
expectTypeOf(webEncode("🙂", "shiftjis", { invalidCharHandler: () => "" })).toEqualTypeOf<Uint8Array | null>()
expectTypeOf(getEncoder("utf8", { invalidCharHandler: () => "�" }).end()).toEqualTypeOf<Buffer | null | undefined>()
expectTypeOf(webEncoder("utf32", { invalidCharHandler: () => "�" }).write("\uD800")).toEqualTypeOf<Uint8Array | null>()

// Web Streams expose the native pipeline API and keep the backend's byte type.
expectTypeOf(iconv.encodeWebStream("utf8")).toEqualTypeOf<TransformStream<string, Buffer>>()
expectTypeOf(encodeWebStream("latin1", { invalidCharHandler: () => true })).toEqualTypeOf<TransformStream<string, Buffer>>()
expectTypeOf(decodeWebStream("utf8")).toEqualTypeOf<TransformStream<Uint8Array, string>>()
expectTypeOf(webIconv.encodeWebStream("utf8")).toEqualTypeOf<TransformStream<string, Uint8Array>>()
expectTypeOf(webEncodeStream("utf8", { addBOM: true })).toEqualTypeOf<TransformStream<string, Uint8Array>>()
expectTypeOf(webDecodeStream("utf8", { stripBOM: false })).toEqualTypeOf<TransformStream<Uint8Array, string>>()
expectTypeOf(iconv.encodeStream("utf8")).toEqualTypeOf<NodeJS.ReadWriteStream>()
expectTypeOf(iconv.decodeStream("utf8")).toEqualTypeOf<NodeJS.ReadWriteStream>()
new ReadableStream<string>().pipeThrough(webEncodeStream("gbk")).pipeThrough(webDecodeStream("gbk"))
// @ts-expect-error Encoders accept string chunks, not bytes.
new ReadableStream<Uint8Array>().pipeThrough(encodeWebStream("utf8"))
// @ts-expect-error Decoders accept byte chunks, not strings.
new ReadableStream<string>().pipeThrough(webDecodeStream("utf8"))
