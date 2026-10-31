import Iconv from "./iconv.js"
import backend from "../backends/web.js"

const iconv = new Iconv(backend)
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
