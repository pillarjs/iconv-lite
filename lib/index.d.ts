/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  REQUIREMENT: This definition is dependent on the @types/node definition.
 *  Install with `npm install @types/node --save-dev`
 *-------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * This file provides detailed typings for the public API of iconv-lite
 *-------------------------------------------------------------------------------------------- */

import type * as Stream from "node:stream"
import type { Encoding } from "../types/encodings.js"

export interface DecodeOptions {
  /**
   * Strip the Byte Order Mark (BOM) from the input,
   * when decoding, if the codec is BOM-aware. @default true
   */
  stripBOM?: boolean;
  /** Override the default endianness for `UTF-16` and `UTF-32` decodings. */
  defaultEncoding?: "utf16be" | "utf32be";
}

export interface EncodeOptions {
  /**
   * Add a Byte Order Mark (BOM) to the output, when encoding,
   * if the codec is BOM-aware. @default false
   */
  addBOM?: boolean;
  /** Override the default endianness for `UTF-32` encoding. */
  defaultEncoding?: "utf32be";
}

export interface EncoderStream<Bytes extends Uint8Array = Buffer> {
  write(str: string): Bytes;
  end(): Bytes | undefined;
}

export interface DecoderStream {
  write(buf: Buffer | Uint8Array): string;
  end(): string | undefined;
}

export interface Codec<Bytes extends Uint8Array = Buffer> {
  encoder: new (options?: EncodeOptions, codec?: Codec<Bytes>) => EncoderStream<Bytes>;
  decoder: new (options?: DecodeOptions, codec?: Codec<Bytes>) => DecoderStream;
  bomAware?: boolean;
  [key: string]: any;
}

export interface Backend<Bytes extends Uint8Array = Uint8Array> {
  allocBytes(numBytes: number, fill?: number): Uint8Array;
  bytesToResult(bytes: Uint8Array, finalLen: number): Bytes;
  concatByteResults(bufs: Bytes[]): Bytes;
  allocRawChars(numChars: number): Uint16Array;
  rawCharsToResult(rawChars: Uint16Array, finalLen: number): string;
  encodeString(str: string, encoding: BufferEncoding): Bytes;
  decodeBytes(bytes: Uint8Array, encoding: BufferEncoding): string;
  copyBytes(bytes: Uint8Array): Uint8Array;
}

export interface Iconv<Bytes extends Uint8Array = Buffer> {
  /** Encodes a `string` into backend bytes, using the provided `encoding`. */
  encode (content: string, encoding: Encoding, options?: EncodeOptions): Bytes

  /** Decodes a `Buffer` into a `string`, using the provided `encoding`. */
  decode (buffer: Buffer | Uint8Array, encoding: Encoding, options?: DecodeOptions): string

  /** Checks if a given encoding is supported by `iconv-lite`. */
  encodingExists (encoding: string): encoding is Encoding

  /** Legacy alias for {@link iconv.encode}. */
  readonly toEncoding: Iconv<Bytes>["encode"]

  /** Legacy alias for {@link iconv.decode}. */
  readonly fromEncoding: Iconv<Bytes>["decode"]

  /** Creates a stream that decodes binary data from a given `encoding` into strings. */
  decodeStream (encoding: Encoding, options?: DecodeOptions): NodeJS.ReadWriteStream

  /** Creates a stream that encodes strings into binary data in a given `encoding`. */
  encodeStream (encoding: Encoding, options?: EncodeOptions): NodeJS.ReadWriteStream

  /**
   * Explicitly enable Streaming API in browser environments by passing in:
   * ```js
   * import * as stream from "stream"
   * ```
   * @example iconv.enableStreamingAPI(stream);
   */
  enableStreamingAPI (stream_module: { Transform: typeof Stream.Transform }): void

  /** Creates and returns a low-level encoder stream. */
  getEncoder (encoding: Encoding, options?: EncodeOptions): EncoderStream<Bytes>

  /** Creates and returns a low-level decoder stream. */
  getDecoder (encoding: Encoding, options?: DecodeOptions): DecoderStream

  /**
   * Returns a codec object for the given `encoding`.
   * @throws If the `encoding` is not recognized.
   */
  getCodec (encoding: Encoding): Codec<Bytes>

  /** Strips all non-alphanumeric characters and appended year from `encoding`. */
  _canonicalizeEncoding (encoding: Encoding): string

  /** A cache of all loaded encoding definitions. */
  encodings: Record<
    Encoding,
    | string
    | {
      type: string;
      [key: string]: any;
    }
  > | null

  /** A cache of initialized codec objects. */
  _codecDataCache: Record<string, Codec<Bytes>>

  /** The character used for untranslatable `Unicode` characters. @default "�" */
  defaultCharUnicode: string

  /** The character used for untranslatable `single-byte` characters. @default "?" */
  defaultCharSingleByte: string

  /** @readonly Whether or not, Streaming API is enabled. */
  readonly supportsStreams: boolean

  backend: Backend<Bytes>;
  setBackend(backend: Backend<Bytes>): void;
}

declare const iconv: Iconv
export default iconv
export type { Encoding }

export const encode: Iconv["encode"]
export const decode: Iconv["decode"]
export const encodingExists: Iconv["encodingExists"]
export const toEncoding: Iconv["toEncoding"]
export const fromEncoding: Iconv["fromEncoding"]
export const getCodec: Iconv["getCodec"]
export const getEncoder: Iconv["getEncoder"]
export const getDecoder: Iconv["getDecoder"]
export const encodeStream: Iconv["encodeStream"]
export const decodeStream: Iconv["decodeStream"]
export const enableStreamingAPI: Iconv["enableStreamingAPI"]
export const setBackend: Iconv["setBackend"]
