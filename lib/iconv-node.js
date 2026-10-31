import Iconv from "./iconv.js"
import createStreams from "./streams.js"
import * as stream from "node:stream"

// Node-style streams belong only to the Node entry point. The shared core and
// Web entry point use native Web Streams without loading this adapter.
export default class NodeIconv extends Iconv {
  constructor (backend) {
    super(backend)
    const streams = createStreams(stream)
    this.IconvLiteEncoderStream = streams.IconvLiteEncoderStream
    this.IconvLiteDecoderStream = streams.IconvLiteDecoderStream
    this.supportsStreams = true
    for (const method of ["encodeStream", "decodeStream"]) {
      this[method] = this[method].bind(this)
    }
  }

  encodeStream (encoding, options) {
    return new this.IconvLiteEncoderStream(this.getEncoder(encoding, options), options, this)
  }

  decodeStream (encoding, options) {
    return new this.IconvLiteDecoderStream(this.getDecoder(encoding, options), options, this)
  }
}
