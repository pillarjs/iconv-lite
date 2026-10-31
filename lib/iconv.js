import * as bomHandling from "./bom-handling.js"
import { createEncodeWebStream, createDecodeWebStream } from "./web-streams.js"
import getEncodings from "../encodings/index.js"
import { canonicalizeEncoding } from "./utils.js"

// Each instance owns its backend, codec cache, settings and streaming API.
export default class Iconv {
  constructor (backend) {
    // Load the registry on first use; DBCS table factories defer data allocation.
    this.encodings = null
    this._codecDataCache = { __proto__: null }
    this.defaultCharUnicode = "�"
    this.defaultCharSingleByte = "?"

    // Preserve standalone calls through named exports and destructured methods.
    for (const method of [
      "encode", "decode", "encodingExists", "getCodec",
      "getEncoder", "getDecoder", "encodeWebStream", "decodeWebStream", "setBackend"
    ]) {
      this[method] = this[method].bind(this)
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

  encode (str, encoding, options) {
    if (typeof str !== "string") {
      throw new TypeError("iconv-lite can only encode() strings.")
    }

    var encoder = this.getEncoder(encoding, options)

    var res = encoder.write(str)
    if (res === null) return null
    var trail = encoder.end()
    if (trail === null) return null

    return (trail && trail.length > 0) ? this.backend.concatByteResults([res, trail]) : res
  }

  decode (buf, encoding, options) {
    if (typeof buf === "string") {
      throw new TypeError("iconv-lite can't decode() strings. Please pass Buffer or Uint8Array instead.")
    }
    var decoder = this.getDecoder(encoding, options)
    // Codecs with a complete-input path can avoid streaming buffers and copies.
    if (decoder.decode) return decoder.decode(buf)
    var res = decoder.write(buf)
    var trail = decoder.end()

    return trail ? (res + trail) : res
  }

  encodingExists (enc) {
    try {
      this.getCodec(enc)
      return true
    } catch (e) {
      return false
    }
  }

  getCodec (encoding) {
    if (!this.encodings) {
      this.encodings = getEncodings()
    }

    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    var enc = canonicalizeEncoding(encoding)

    // Traverse this.encodings to find actual codec.
    var codecOptions = {}
    while (true) {
      var codec = this._codecDataCache[enc]

      if (codec) { return codec }

      var codecDef = this.encodings[enc]

      switch (typeof codecDef) {
        case "string": // Direct alias to other encoding.
          enc = codecDef
          break

        case "object": // Alias with options. Can be layered.
          for (var key in codecDef) { codecOptions[key] = codecDef[key] }

          if (!codecOptions.encodingName) { codecOptions.encodingName = enc }

          enc = codecDef.type
          break

        case "function": // Codec itself.
          if (!codecOptions.encodingName) { codecOptions.encodingName = enc }

          // The codec function must load all tables and return object with .encoder and .decoder methods.
          // It'll be called only once (for each different options object).
          //
          codec = new codecDef(codecOptions, this)

          this._codecDataCache[codecOptions.encodingName] = codec // Save it to be reused later.
          return codec

        default:
          throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '" + enc + "')")
      }
    }
  }

  getEncoder (encoding, options) {
    if (options?.invalidCharHandler !== undefined && typeof options.invalidCharHandler !== "function") {
      throw new TypeError("invalidCharHandler must be a function")
    }
    const codec = this.getCodec(encoding)

    let encoder = codec.createEncoder
      ? codec.createEncoder(options, this)
      : new codec.encoder(options, codec, this.backend)

    if (codec.bomAware && options && options.addBOM) { encoder = new bomHandling.PrependBOM(encoder, options) }

    return encoder
  }

  getDecoder (encoding, options) {
    const codec = this.getCodec(encoding)

    let decoder = codec.createDecoder
      ? codec.createDecoder(options, this)
      : new codec.decoder(options, codec, this.backend)

    if (codec.bomAware && !(options && options.stripBOM === false)) { decoder = new bomHandling.StripBOM(decoder, options) }

    return decoder
  }

  get supportsWebStreams () {
    return typeof TransformStream === "function"
  }

  encodeWebStream (encoding, options) {
    this.#checkWebStreams()
    return createEncodeWebStream(this.getEncoder(encoding, options))
  }

  decodeWebStream (encoding, options) {
    this.#checkWebStreams()
    return createDecodeWebStream(this.getDecoder(encoding, options))
  }

  #checkWebStreams () {
    if (!this.supportsWebStreams) throw new Error("iconv-lite Web Streams require a global TransformStream implementation.")
  }

  setBackend (backend) {
    delete this.backend
    this.backend = backend
    this._codecDataCache = { __proto__: null }
  }
}

// Some environments, such as browsers, may not load JavaScript files as UTF-8
// eslint-disable-next-line no-constant-condition
if ("Ā" !== "\u0100") {
  console.error("iconv-lite warning: js files use non-utf8 encoding. See https://github.com/ashtuchkin/iconv-lite/wiki/Javascript-source-file-encodings for more info.")
}
