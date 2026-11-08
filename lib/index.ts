import type { Iconv } from "./iconv-node.js"
import NodeIconv from "./iconv-node.js"
export type { Iconv } from "./iconv-node.js"
export type { WebIconv, Backend, EncodeOptions, DecodeOptions, EncoderStream, DecoderStream, Encoding, BuiltinEncoding } from "./iconv.js"
export type { Codec, FactoryCodec, ConstructorCodec, CodecOptions, CodecConstructor, EncodingDefinition, EncodingDefinitions, AddEncodingOptions } from "./encoding-registry.js"

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
