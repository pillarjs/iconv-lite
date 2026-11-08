import type { BuiltinEncoding } from "../encodings/index.js"
import type { Codec, CodecOptions, ConstructorCodec, EncodingDefinitions, AddEncodingOptions } from "./encoding-registry.js"
import * as bomHandling from "./bom-handling.js"
import { createEncodeWebStream, createDecodeWebStream } from "./web-streams.js"
import getEncodings from "../encodings/index.js"
import EncodingRegistry from "./encoding-registry.js"
import { canonicalizeEncoding } from "./utils.js"

/** Built-in suggestions and labels supplied by external encoding packages. */
export type { BuiltinEncoding }
export type Encoding = BuiltinEncoding | (string & {}) | number

export interface DecodeOptions {
  /**
   * Throw a TypeError on invalid input instead of inserting U+FFFD. @default false
   * Supported by UTF-8, UTF-16, UTF-32, ISO-2022-JP and table-based single-byte and multibyte codecs.
   */
  fatal?: boolean;
  /**
   * Strip the Byte Order Mark (BOM) from the input,
   * when decoding, if the codec is BOM-aware. @default true
   */
  stripBOM?: boolean | (() => void);
  /** Override the default endianness for `UTF-16` and `UTF-32` decodings. */
  defaultEncoding?: Encoding;
  /**
   * Literal replacement text for decoding errors in SBCS, DBCS, ISO-2022-JP, CESU-8 and UTF-32.
   * May be empty. @default "�"
   * Fatal decoding still throws where supported.
   */
  defaultCharUnicode?: string;
}

export interface EncodeOptions {
  /**
   * Add a Byte Order Mark (BOM) to the output, when encoding,
   * if the codec is BOM-aware. @default false
   */
  addBOM?: boolean | null;
  /** Override the default endianness for `UTF-32` encoding. */
  defaultEncoding?: Encoding;
  /**
   * Replacement byte for unrepresentable characters in table-based single-byte and multibyte encodings.
   * Must be an integer in 0x00–0xFF. @default 0x3F
   * ISO-2022-JP accepts only ASCII bytes other than ESC, SO and SI.
   */
  defaultCharByte?: number;
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
  /** Optional complete-input fast path, used by decode() instead of write()/end(). */
  decode?(buf: Buffer | Uint8Array): string;
}

export interface Backend<Bytes extends Uint8Array = Uint8Array> {
  allocBytes(numBytes: number, fill?: number): Uint8Array;
  bytesToResult(bytes: Uint8Array, finalLen: number): Bytes;
  concatByteResults(bufs: Bytes[]): Bytes;
  allocRawChars(numChars: number): Uint16Array;
  rawCharsToResult(rawChars: Uint16Array, finalLen: number): string;
  encodeString(str: string, encoding: "utf8" | "binary" | "hex" | "base64"): Bytes;
  decodeBytes(bytes: Uint8Array, encoding: "binary" | "hex" | "base64"): string;
  copyBytes(bytes: Uint8Array): Uint8Array;
}

/** The public API, derived from the shared implementation without its private members. */
export interface WebIconv<Bytes extends Uint8Array = Uint8Array> extends Pick<Iconv<Bytes>, keyof Iconv<Bytes>> {}

// Each instance owns its backend, codec cache, settings and streaming API.
export default class Iconv<Bytes extends Uint8Array = Uint8Array> {
  declare backend: Backend<Bytes>
  /** A cache of all loaded encoding definitions. */
  declare encodings: EncodingDefinitions<Bytes> | null
  /** A cache of initialized codec objects. */
  declare _codecDataCache: Record<string, Codec<Bytes>>
  /** Legacy alias for {@link Iconv.encode}. */
  declare readonly toEncoding: Iconv<Bytes>["encode"]
  /** Legacy alias for {@link Iconv.decode}. */
  declare readonly fromEncoding: Iconv<Bytes>["decode"]
  constructor (backend?: Backend<Bytes>) {
    // Load the registry on first use; DBCS table factories defer data allocation.
    this.encodings = null
    this._codecDataCache = Object.create(null)

    // Preserve standalone calls through named exports and destructured methods.
    for (const method of [
      "encode", "decode", "encodingExists", "addEncoding", "getCodec",
      "getEncoder", "getDecoder", "encodeWebStream", "decodeWebStream", "setBackend"
    ] as const) {
      // A mapped assignment keeps each bound method's overloads intact.
      Object.assign(this, { [method]: this[method].bind(this) })
    }

    this.toEncoding = this.encode
    this.fromEncoding = this.decode

    // Preserve the unconfigured core entry point and its helpful error message.
    Object.defineProperty(this, "backend", {
      configurable: true,
      get () {
        throw new Error("iconv-lite backend is not set. Please use iconv.setBackend().")
      }
    })
    if (backend !== undefined) this.setBackend(backend)
  }

  /** Encodes a `string` into backend bytes, using the provided `encoding`. */
  encode (str: string, encoding: Encoding, options?: EncodeOptions & { invalidCharHandler?: undefined }): Bytes
  encode (str: string, encoding: Encoding, options?: EncodeOptions): Bytes | null
  encode (str: string, encoding: Encoding, options?: EncodeOptions): Bytes | null {
    if (typeof str !== "string") {
      throw new TypeError("iconv-lite can only encode() strings.")
    }

    const encoder = this.getEncoder(encoding, options)

    const res = encoder.write(str)
    if (res === null) return null
    const trail = encoder.end()
    if (trail === null) return null

    return (trail && trail.length > 0) ? this.backend.concatByteResults([res, trail]) : res
  }

  /** Decodes a `Buffer` into a `string`, using the provided `encoding`. */
  decode (buf: Uint8Array, encoding: Encoding, options?: DecodeOptions): string {
    if (typeof buf === "string") {
      throw new TypeError("iconv-lite can't decode() strings. Please pass Buffer or Uint8Array instead.")
    }
    const decoder = this.getDecoder(encoding, options)
    // Codecs with a complete-input path can avoid streaming buffers and copies.
    if (decoder.decode) return decoder.decode(buf)
    const res = decoder.write(buf)
    const trail = decoder.end()

    return trail ? (res + trail) : res
  }

  /** Checks if a given encoding is supported by `iconv-lite`. */
  encodingExists (enc: string | number): enc is Encoding {
    try {
      this.getCodec(enc)
      return true
    } catch (e) {
      return false
    }
  }

  /** Registers codec definitions atomically. Repeating equivalent definitions is a no-op. */
  addEncoding (definitions: EncodingDefinitions<Bytes>, options?: AddEncodingOptions) {
    const registry = this.encodings || getEncodings()
    const next = EncodingRegistry.extend(registry, definitions, options)
    this.encodings = next
    if (next !== registry) this._codecDataCache = Object.create(null)
  }

  /**
   * Returns a codec object for the given `encoding`.
   * @throws If the `encoding` is not recognized.
   */
  getCodec (encoding: Encoding): Codec<Bytes> {
    if (!this.encodings) {
      this.encodings = getEncodings()
    }

    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    let enc = canonicalizeEncoding(encoding)
    const cached = this._codecDataCache[enc]
    if (cached) return cached

    // Traverse this.encodings to find actual codec.
    let codecOptions = {} as CodecOptions
    const seen = new Set()
    let optionsName
    while (true) {
      if (seen.has(enc)) throw new Error("Encoding alias cycle: " + enc)
      seen.add(enc)
      // An alias with options needs its own codec, even if its base is cached.
      let codec = optionsName === undefined && this._codecDataCache[enc]

      if (codec) { return codec }

      const codecDef = this.encodings[enc]

      switch (typeof codecDef) {
        case "string": // Direct alias to other encoding.
          enc = codecDef
          break

        case "object": // Alias with options. Can be layered.
          if (!codecDef) throw new Error("Invalid encoding definition: " + enc)
          if (optionsName === undefined) optionsName = enc
          codecOptions = { ...codecDef, ...codecOptions }
          enc = codecDef.type
          break

        case "function": { // Codec itself.
          const Codec = codecDef
          codecOptions.encodingName = optionsName === undefined ? enc : optionsName

          // Codecs provide encoder/decoder factories or constructors.
          // It'll be called only once (for each different options object).
          //
          codec = new Codec(codecOptions, this)
          if ((!("createEncoder" in codec && typeof codec.createEncoder === "function") && !("encoder" in codec && typeof codec.encoder === "function")) ||
              (!("createDecoder" in codec && typeof codec.createDecoder === "function") && !("decoder" in codec && typeof codec.decoder === "function"))) {
            throw new TypeError("Codec must provide encoder and decoder factories or constructors: " + enc)
          }

          this._codecDataCache[codecOptions.encodingName] = codec // Save it to be reused later.
          return codec
        }

        default:
          throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '" + enc + "')")
      }
    }
  }

  /** Creates and returns a low-level encoder stream. */
  getEncoder (encoding: Encoding, options?: EncodeOptions & { invalidCharHandler?: undefined }): EncoderStream<Bytes, false>
  getEncoder (encoding: Encoding, options?: EncodeOptions): EncoderStream<Bytes>
  getEncoder (encoding: Encoding, options?: EncodeOptions): EncoderStream<Bytes> {
    if (options?.invalidCharHandler !== undefined && typeof options.invalidCharHandler !== "function") {
      throw new TypeError("invalidCharHandler must be a function")
    }
    const codec = this.getCodec(encoding)

    let encoder
    if ("createEncoder" in codec && codec.createEncoder) {
      encoder = codec.createEncoder(options, this)
    } else {
      const Encoder = (codec as ConstructorCodec<Bytes>).encoder
      encoder = new Encoder(options, codec as ConstructorCodec<Bytes>, this.backend)
    }

    if (codec.bomAware && options && options.addBOM) { encoder = new bomHandling.PrependBOM(encoder) }

    return encoder
  }

  /** Creates and returns a low-level decoder stream. */
  getDecoder (encoding: Encoding, options?: DecodeOptions): DecoderStream {
    const codec = this.getCodec(encoding)

    let decoder
    if ("createDecoder" in codec && codec.createDecoder) {
      decoder = codec.createDecoder(options, this)
    } else {
      const Decoder = (codec as ConstructorCodec<Bytes>).decoder
      decoder = new Decoder(options, codec as ConstructorCodec<Bytes>, this.backend)
    }

    if (codec.bomAware && !(options && options.stripBOM === false)) { decoder = new bomHandling.StripBOM(decoder, options) }

    return decoder
  }

  /** @readonly Whether the environment provides the TransformStream used by Web Streams. */
  get supportsWebStreams () {
    return typeof TransformStream === "function"
  }

  /** Creates a Web TransformStream from strings to encoded bytes. Available without setup. */
  encodeWebStream (encoding: Encoding, options?: EncodeOptions) {
    this.#checkWebStreams()
    return createEncodeWebStream(this.getEncoder(encoding, options))
  }

  /** Creates a Web TransformStream from encoded bytes to strings. Available without setup. */
  decodeWebStream (encoding: Encoding, options?: DecodeOptions) {
    this.#checkWebStreams()
    return createDecodeWebStream(this.getDecoder(encoding, options))
  }

  #checkWebStreams () {
    if (!this.supportsWebStreams) throw new Error("iconv-lite Web Streams require a global TransformStream implementation.")
  }

  setBackend (backend: Backend<Bytes>) {
    Reflect.deleteProperty(this, "backend")
    this.backend = backend
    this._codecDataCache = Object.create(null)
  }
}

// Some environments, such as browsers, may not load JavaScript files as UTF-8
if ("Ā".charCodeAt(0) !== 0x100) {
  console.error("iconv-lite warning: js files use non-utf8 encoding. See https://github.com/ashtuchkin/iconv-lite/wiki/Javascript-source-file-encodings for more info.")
}
