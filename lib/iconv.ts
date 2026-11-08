import type { Backend, Codec, CodecOptions, ConstructorCodec, DecodeOptions, DecoderStream, EncodeOptions, EncoderStream, Encoding, EncodingDefinitions, AddEncodingOptions } from "./types.js"
import * as bomHandling from "./bom-handling.js"
import { createEncodeWebStream, createDecodeWebStream } from "./web-streams.js"
import getEncodings from "../encodings/index.js"
import EncodingRegistry from "./encoding-registry.js"
import { canonicalizeEncoding } from "./utils.js"

// Each instance owns its backend, codec cache, settings and streaming API.
export default class Iconv<Bytes extends Uint8Array = Uint8Array> {
  declare backend: Backend<Bytes>
  declare encodings: EncodingDefinitions<Bytes> | null
  declare _codecDataCache: Record<string, Codec<Bytes>>
  declare defaultCharUnicode: string
  declare defaultCharSingleByte: string
  declare toEncoding: Iconv<Bytes>["encode"]
  declare fromEncoding: Iconv<Bytes>["decode"]
  constructor (backend?: Backend<Bytes>) {
    // Load the registry on first use; DBCS table factories defer data allocation.
    this.encodings = null
    this._codecDataCache = Object.create(null)
    this.defaultCharUnicode = "�"
    this.defaultCharSingleByte = "?"

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

  encodingExists (enc: string | number): enc is Encoding {
    try {
      this.getCodec(enc)
      return true
    } catch (e) {
      return false
    }
  }

  addEncoding (definitions: EncodingDefinitions<Bytes>, options?: AddEncodingOptions) {
    const registry = this.encodings || getEncodings()
    const next = EncodingRegistry.extend(registry, definitions, options)
    this.encodings = next
    if (next !== registry) this._codecDataCache = Object.create(null)
  }

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

  get supportsWebStreams () {
    return typeof TransformStream === "function"
  }

  encodeWebStream (encoding: Encoding, options?: EncodeOptions) {
    this.#checkWebStreams()
    return createEncodeWebStream(this.getEncoder(encoding, options))
  }

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
