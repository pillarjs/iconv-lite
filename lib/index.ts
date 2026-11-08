import type { Iconv } from "./types.js"
import NodeIconv from "./iconv-node.js"
export type * from "./types.js"

// Preserve the core entry point used by Node and callers configuring a backend.
const iconv: Iconv = new NodeIconv<Buffer>()
export default iconv

export const {
  encode,
  decode,
  encodingExists,
  addEncoding,
  toEncoding,
  fromEncoding,
  getCodec,
  getEncoder,
  getDecoder,
  encodeStream,
  decodeStream,
  encodeWebStream,
  decodeWebStream,
  setBackend
} = iconv
