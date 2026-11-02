import Iconv from "./iconv.js"
import backend from "../backends/web.js"

const iconv = new Iconv(backend)
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
  encodeWebStream,
  decodeWebStream,
  setBackend
} = iconv
