/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  REQUIREMENT: This definition is dependent on the @types/node definition.
 *  Install with `npm install @types/node --save-dev`
 *-------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * This file provides detailed typings for the public API of iconv-lite
 *-------------------------------------------------------------------------------------------- */

import type { Encoding } from "../types/encodings"

// --- Options ---

declare namespace iconv {
  export interface DecodeOptions {
    /** Strip the byte order mark (BOM) from the input, when decoding. @default true */
    stripBOM?: boolean;
    /** Override the default endianness for `UTF-16` and `UTF-32` decodings. */
    defaultEncoding?: "utf16be" | "utf32be";
  }

  export interface EncodeOptions {
    /** Add a byte order mark (BOM) to the output, when encoding. @default false */
    addBOM?: boolean;
    /** Override the default endianness for `UTF-32` encoding. */
    defaultEncoding?: "utf32be";
  }

  // --- Return values ---

  export interface EncoderStream {
    write(str: string): Buffer;
    end(): Buffer | undefined;
  }

  export interface DecoderStream {
    write(buf: Buffer): string;
    end(): string | undefined;
  }

  export interface Codec {
    encoder: new (options?: EncodeOptions, codec?: any) => EncoderStream;
    decoder: new (options?: DecodeOptions, codec?: any) => DecoderStream;
    [key: string]: any;
  }

  const iconv: {
    // --- Basic API ---

    /** Encodes a `string` into a `Buffer`, using the provided `encoding`. */
    encode(content: string, encoding: Encoding, options?: EncodeOptions): Buffer;

    /** Decodes a `Buffer` into a `string`, using the provided `encoding`. */
    decode(buffer: Buffer | Uint8Array, encoding: Encoding, options?: DecodeOptions): string;

    /** Checks if a given encoding is supported by `iconv-lite`. */
    encodingExists(encoding: string): encoding is Encoding;

    // --- Legacy aliases ---

    /** Legacy alias for {@link iconv.encode}. */
    toEncoding: typeof iconv.encode;

    /** Legacy alias for {@link iconv.decode}. */
    fromEncoding: typeof iconv.decode;

    // --- Stream API ---

    /** Creates a stream that decodes binary data from a given `encoding` into strings. */
    decodeStream(encoding: Encoding, options?: DecodeOptions): NodeJS.ReadWriteStream;

    /** Creates a stream that encodes strings into binary data in a given `encoding`. */
    encodeStream(encoding: Encoding, options?: EncodeOptions): NodeJS.ReadWriteStream;

    /**
     * Explicitly enable Streaming API in browser environments by passing in:
     * ```js
     * require('stream')
     * ```
     * @example iconv.enableStreamingAPI(require('stream'));
     */
    enableStreamingAPI(stream_module: any): void;

    // --- Low-level stream APIs ---

    /** Creates and returns a low-level encoder stream. */
    getEncoder(encoding: Encoding, options?: EncodeOptions): EncoderStream;

    /** Creates and returns a low-level decoder stream. */
    getDecoder(encoding: Encoding, options?: DecodeOptions): DecoderStream;

    /**
     * Returns a codec object for the given `encoding`.
     * @throws If the `encoding` is not recognized.
     */
    getCodec(encoding: Encoding): Codec;

    /** Strips all non-alphanumeric characters and appended year from `encoding`. */
    _canonicalizeEncoding(encoding: Encoding): string;

    // --- Properties ---

    /** A cache of all loaded encoding definitions. */
    encodings: Record<
      Encoding,
      | string
      | {
        type: string;
        [key: string]: any;
      }
    > | null;

    /** A cache of initialized codec objects. */
    _codecDataCache: Record<string, Codec>;

    /** The character used for untranslatable `Unicode` characters. @default "�" */
    defaultCharUnicode: string;

    /** The character used for untranslatable `single-byte` characters. @default "?" */
    defaultCharSingleByte: string;

    /** @readonly Whether or not, Streaming API is enabled. */
    readonly supportsStreams: boolean;
  }

  export type { iconv as Iconv, Encoding }
  export { iconv as default }
}
export = iconv
