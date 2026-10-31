/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  REQUIREMENT: This definition is dependent on the @types/node definition.
 *  Install with `npm install @types/node --save-dev`
 *-------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * This file provides detailed typings for the public API of iconv-lite
 *-------------------------------------------------------------------------------------------- */

/// <reference types="node" />

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
  /**
   * Called when encoding a character that cannot be represented in the target encoding.
   * Return `true` to discard the current write (or buffered end output) and return `null`.
   * Later writes may still succeed. A cancellation also makes `iconv.encode()` return `null`.
   * Return a string to encode it instead (an empty string omits the character).
   * An unencodable replacement or any other return value throws a TypeError,
   * without invoking the handler recursively.
   * Return `false` or nothing to keep the default replacement bytes.
   * Thrown errors propagate to the caller or become errors on `encodeStream()`.
   *
   * Used by single-byte and multibyte encoders, UTF-8, UTF-32, and binary.
   * These encoders buffer a trailing high surrogate until the next nonempty write or `end()`.
   * UTF-16, CESU-8, and UTF-7 preserve all UTF-16 code units and never invoke it.
   * Hex and Base64 reject this option.
   *
   * @param char - The unencodable character.
   * @param index - The zero-based code-point position in the original write where the character starts.
   */
  invalidCharHandler?: (char: string, index: number) => string | boolean | void;
}

export interface EncoderStream<Bytes extends Uint8Array = Buffer, CanCancel extends boolean = boolean> {
  /** Encodes a chunk. A cancelling handler discards this write's output and returns `null`. */
  write(str: string): CanCancel extends true ? Bytes | null : Bytes;
  /** Flushes buffered characters. A cancelling handler may return `null` here too. */
  end(): (CanCancel extends true ? Bytes | null : Bytes) | undefined;
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

export interface WebIconv<Bytes extends Uint8Array = Uint8Array> {
  /** Encodes a `string` into backend bytes, using the provided `encoding`. */
  encode (content: string, encoding: Encoding, options?: EncodeOptions & { invalidCharHandler?: undefined }): Bytes
  encode (content: string, encoding: Encoding, options?: EncodeOptions): Bytes | null

  /** Decodes a `Buffer` into a `string`, using the provided `encoding`. */
  decode (buffer: Buffer | Uint8Array, encoding: Encoding, options?: DecodeOptions): string

  /** Checks if a given encoding is supported by `iconv-lite`. */
  encodingExists (encoding: string): encoding is Encoding

  /** Legacy alias for {@link iconv.encode}. */
  readonly toEncoding: WebIconv<Bytes>["encode"]

  /** Legacy alias for {@link iconv.decode}. */
  readonly fromEncoding: WebIconv<Bytes>["decode"]

  /** Creates a Web TransformStream from strings to encoded bytes. Available without setup. */
  encodeWebStream (encoding: Encoding, options?: EncodeOptions): TransformStream<string, Bytes>

  /** Creates a Web TransformStream from encoded bytes to strings. Available without setup. */
  decodeWebStream (encoding: Encoding, options?: DecodeOptions): TransformStream<Uint8Array, string>

  /** Creates and returns a low-level encoder stream. */
  getEncoder (encoding: Encoding, options?: EncodeOptions & { invalidCharHandler?: undefined }): EncoderStream<Bytes, false>
  getEncoder (encoding: Encoding, options?: EncodeOptions): EncoderStream<Bytes>

  /** Creates and returns a low-level decoder stream. */
  getDecoder (encoding: Encoding, options?: DecodeOptions): DecoderStream

  /**
   * Returns a codec object for the given `encoding`.
   * @throws If the `encoding` is not recognized.
   */
  getCodec (encoding: Encoding): Codec<Bytes>

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

  /** @readonly Whether the environment provides the TransformStream used by Web Streams. */
  readonly supportsWebStreams: boolean

  backend: Backend<Bytes>;
  setBackend(backend: Backend<Bytes>): void;
}

export interface Iconv<Bytes extends Uint8Array = Buffer> extends WebIconv<Bytes> {
  /** Creates a Node stream that decodes binary data into strings. */
  decodeStream (encoding: Encoding, options?: DecodeOptions): NodeJS.ReadWriteStream

  /** Creates a Node stream that encodes strings into bytes. */
  encodeStream (encoding: Encoding, options?: EncodeOptions): NodeJS.ReadWriteStream

  /** @readonly Whether Node-style streams are enabled. */
  readonly supportsStreams: boolean
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
export const encodeWebStream: Iconv["encodeWebStream"]
export const decodeWebStream: Iconv["decodeWebStream"]
export const setBackend: Iconv["setBackend"]
