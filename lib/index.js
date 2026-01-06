"use strict"

var bomHandling = require("./bom-handling")

class IconvLite {
  #streamModule
  #encodings
  #codecDataCache

  constructor () {
    IconvLite.instance = this

    this.#encodings = null
    this.#codecDataCache = Object.create(null)

    // Auto-enable Streaming API if 'stream' module is available.
    try {
      this.#streamModule = require("stream")
    } catch (e) {}

    if (this.#streamModule && this.#streamModule.Transform) {
      this.enableStreamingAPI(this.#streamModule)
    } else {
      this.encodeStream = this.decodeStream = function () {
        throw new Error("iconv-lite Streaming API is not enabled. Use iconv.enableStreamingAPI(require('stream')); to enable it.")
      }
    }
    return this
  }

  defaultCharSingleByte = "?"
  defaultCharUnicode = "�"

  get encodings () {
    return this.#encodings
  }

  encode (str, encoding, options) {
    if (typeof str !== "string") {
      throw new TypeError("iconv-lite can only encode() strings.")
    }

    var encoder = this.getEncoder(encoding, options)

    var res = encoder.write(str)
    var trail = encoder.end()

    return (trail && trail.length > 0) ? this.backend.concatByteResults([res, trail]) : res
  }

  decode (buf, encoding, options) {
    if (typeof buf === "string") {
      throw new TypeError("iconv-lite can't decode() strings. Please pass Buffer or Uint8Array instead.")
    }
    var decoder = this.getDecoder(encoding, options)
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

  // Legacy aliases
  toEncoding (str, encoding, options) { return this.encode(str, encoding, options) }
  fromEncoding (buf, encoding, options) { return this.decode(buf, encoding, options) }

  // Search for a codec in encodings. Uses module-scoped _codecDataCache.
  getCodec (encoding) {
    if (!this.#encodings) {
      var raw = require("../encodings")
      this.#encodings = Object.assign({ __proto__: null }, raw)
    }

    var enc = this._canonicalizeEncoding(encoding)

    var codecOptions = {}
    while (true) {
      var codec = this.#codecDataCache[enc]

      if (codec) { return codec }

      var codecDef = this.#encodings[enc]
      switch (typeof codecDef) {
        case "string":
          enc = codecDef
          break

        case "object":
          for (var key in codecDef) { codecOptions[key] = codecDef[key] }

          if (!codecOptions.encodingName) { codecOptions.encodingName = enc }

          enc = codecDef.type
          break

        case "function":
          if (!codecOptions.encodingName) { codecOptions.encodingName = enc }

          codec = new codecDef(codecOptions, this)

          this.#codecDataCache[codecOptions.encodingName] = codec
          return codec

        default:
          throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '" + enc + "')")
      }
    }
  }

  _canonicalizeEncoding (encoding) {
    return ("" + encoding).toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "")
  }

  getEncoder (encoding, options) {
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

  // Streaming API
  enableStreamingAPI (streamModule) {
    if (this.supportsStreams) { return }

    var streams = require("./streams")(streamModule)

    this.IconvLiteEncoderStream = streams.IconvLiteEncoderStream
    this.IconvLiteDecoderStream = streams.IconvLiteDecoderStream

    this.encodeStream = function encodeStream (encoding, options) {
      return new this.IconvLiteEncoderStream(this.getEncoder(encoding, options), options, this)
    }

    this.decodeStream = function decodeStream (encoding, options) {
      return new this.IconvLiteDecoderStream(this.getDecoder(encoding, options), options, this)
    }

    this.supportsStreams = true
  }

  setBackend (backend) {
    // Replace the backend property on the instance with the provided backend
    try { delete this.backend } catch (e) {}
    Object.defineProperty(this, "backend", { configurable: true, writable: true, value: backend })

    // Reset the shared codec data cache
    this.#codecDataCache = Object.create(null)
  }
}

// Some environments, such as browsers, may not load JavaScript files as UTF-8
// eslint-disable-next-line no-constant-condition
if ("Ā" !== "\u0100") {
  console.error("iconv-lite warning: js files use non-utf8 encoding. See https://github.com/ashtuchkin/iconv-lite/wiki/Javascript-source-file-encodings for more info.")
}

module.exports = IconvLite
