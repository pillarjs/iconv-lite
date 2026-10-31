import Iconv from "./iconv.js"
import createStreams from "./streams.js"

// Node-style streams belong only to the Node entry point. The shared core and
// Web entry point use native Web Streams without loading this adapter.
export default class NodeIconv extends Iconv {
  constructor (backend) {
    super(backend)
    this.supportsStreams = false
    for (const method of ["enableStreamingAPI", "encodeStream", "decodeStream"]) {
      this[method] = this[method].bind(this)
    }
  }

  enableStreamingAPI (streamModule) {
    if (this.supportsStreams) return
    const streams = createStreams(streamModule)
    this.IconvLiteEncoderStream = streams.IconvLiteEncoderStream
    this.IconvLiteDecoderStream = streams.IconvLiteDecoderStream
    this.supportsStreams = true
  }

  encodeStream (encoding, options) {
    this.#checkStreams()
    return new this.IconvLiteEncoderStream(this.getEncoder(encoding, options), options, this)
  }

  decodeStream (encoding, options) {
    this.#checkStreams()
    return new this.IconvLiteDecoderStream(this.getDecoder(encoding, options), options, this)
  }

  #checkStreams () {
    if (!this.supportsStreams) throw new Error("iconv-lite Streaming API is not enabled. Use iconv.enableStreamingAPI(stream) to enable it.")
  }
}
