import NodeIconv from "./iconv-node.js"

// Preserve the core entry point used by Node and callers configuring a backend.
const iconv = new NodeIconv()
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
