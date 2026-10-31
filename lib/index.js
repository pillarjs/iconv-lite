import Iconv from "./iconv.js"

// Preserve the core entry point used by Node and callers configuring a backend.
const iconv = new Iconv()
export default iconv

export const {
  encode,
  decode,
  encodingExists,
  toEncoding,
  fromEncoding,
  getCodec,
  getEncoder,
  getDecoder,
  encodeStream,
  decodeStream,
  enableStreamingAPI,
  setBackend
} = iconv
