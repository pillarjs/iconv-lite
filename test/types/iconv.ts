import iconv from "../../lib"
import { expectTypeOf } from "expect-type"

expectTypeOf(iconv._canonicalizeEncoding).toBeFunction()
expectTypeOf(iconv.encode).toBeFunction()
expectTypeOf(iconv.decode).toBeFunction()
expectTypeOf(iconv.encodingExists).toBeFunction()
expectTypeOf(iconv.toEncoding).toBeFunction()
expectTypeOf(iconv.enableStreamingAPI).toBeFunction()
