import type { EncodingDefinitions } from "../lib/encoding-registry.js"

// Keep imports explicit so this registry also works in browsers.
import internal from "./internal.js"
import * as utf32 from "./utf32.js"
import * as utf16 from "./utf16.js"
import * as utf7 from "./utf7.js"
import * as sbcsCodec from "./sbcs-codec.js"
import sbcsData from "./sbcs-data.js"
import sbcsDataGenerated from "./sbcs-data-generated.js"
import * as dbcsCodec from "./dbcs-codec.js"
import dbcsData from "./dbcs-data.js"
import windowsCodepages from "./windows-codepages.js"
import whatwgAliases from "./whatwg-aliases.js"

const modules: [
  typeof internal, typeof utf32, typeof utf16, typeof utf7, typeof sbcsCodec,
  typeof sbcsData, typeof sbcsDataGenerated, typeof dbcsCodec, typeof dbcsData,
  typeof windowsCodepages, typeof whatwgAliases
] = [internal, utf32, utf16, utf7, sbcsCodec, sbcsData, sbcsDataGenerated, dbcsCodec, dbcsData, windowsCodepages, whatwgAliases]

type EncodingKeys<T> = T extends unknown ? keyof T : never

/** Built-in label suggestions, excluding internal codec names. */
export type BuiltinEncoding = Exclude<`${EncodingKeys<(typeof modules)[number]>}`, `_${string}`> | (string & {})

export default function getEncodings<Bytes extends Uint8Array> (): EncodingDefinitions<Bytes> {
  return Object.assign(Object.create(null), ...modules)
}
