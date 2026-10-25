import type { Iconv } from "./index.js"

export type { Iconv, Backend, Codec, EncodeOptions, DecodeOptions, EncoderStream, DecoderStream, Encoding } from "./index.js"

declare const iconv: Iconv<Uint8Array>
export default iconv

export const encode: Iconv<Uint8Array>["encode"]
export const decode: Iconv<Uint8Array>["decode"]
export const encodingExists: Iconv<Uint8Array>["encodingExists"]
export const toEncoding: Iconv<Uint8Array>["toEncoding"]
export const fromEncoding: Iconv<Uint8Array>["fromEncoding"]
export const getCodec: Iconv<Uint8Array>["getCodec"]
export const getEncoder: Iconv<Uint8Array>["getEncoder"]
export const getDecoder: Iconv<Uint8Array>["getDecoder"]
export const encodeStream: Iconv<Uint8Array>["encodeStream"]
export const decodeStream: Iconv<Uint8Array>["decodeStream"]
export const enableStreamingAPI: Iconv<Uint8Array>["enableStreamingAPI"]
export const setBackend: Iconv<Uint8Array>["setBackend"]
