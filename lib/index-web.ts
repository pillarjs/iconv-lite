import type { WebIconv } from "./types.js"
import Iconv from "./iconv.js"
import backend from "../backends/web.js"
export type { WebIconv as Iconv, Backend, Codec, EncodeOptions, DecodeOptions, EncoderStream, DecoderStream, Encoding, FactoryCodec, ConstructorCodec, CodecOptions, CodecConstructor, EncodingDefinition, EncodingDefinitions, AddEncodingOptions, BuiltinEncoding } from "./types.js"

const iconv: WebIconv = new Iconv(backend)
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
