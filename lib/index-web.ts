import type { WebIconv } from "./iconv.js"
import Iconv from "./iconv.js"
import backend from "../backends/web.js"
export type { WebIconv as Iconv, Backend, EncodeOptions, DecodeOptions, EncoderStream, DecoderStream, Encoding, BuiltinEncoding } from "./iconv.js"
export type { Codec, FactoryCodec, ConstructorCodec, CodecOptions, CodecConstructor, EncodingDefinition, EncodingDefinitions, AddEncodingOptions } from "./encoding-registry.js"

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
