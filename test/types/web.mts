import iconv, { encode, getEncoder, encodeWebStream, decodeWebStream, addEncoding } from "iconv-lite"
import * as exports from "iconv-lite"
import { expectTypeOf } from "expect-type"

// The browser condition and the default bundler resolution expose the same Web API.
expectTypeOf(iconv).not.toHaveProperty("encodeStream")
expectTypeOf(iconv).not.toHaveProperty("decodeStream")
expectTypeOf(iconv).not.toHaveProperty("supportsStreams")
expectTypeOf(exports).not.toHaveProperty("encodeStream")
expectTypeOf(exports).not.toHaveProperty("decodeStream")
expectTypeOf(encode("hello", "utf8")).toEqualTypeOf<Uint8Array>()
expectTypeOf(getEncoder("utf8").write("hello")).toEqualTypeOf<Uint8Array>()
expectTypeOf(encodeWebStream("utf8")).toEqualTypeOf<TransformStream<string, Uint8Array>>()
expectTypeOf(decodeWebStream("utf8")).toEqualTypeOf<TransformStream<Uint8Array, string>>()
expectTypeOf(iconv.supportsWebStreams).toBeBoolean()
addEncoding({ "external-alias": "utf8" })
expectTypeOf(encode("hello", "external-alias")).toEqualTypeOf<Uint8Array>()
