import type { Backend, DecodeOptions, EncodeOptions, Encoding } from "./types.js"
import Iconv from "./iconv.js"
import createStreams from "./streams.js"
import * as stream from "node:stream"

// Node-style streams belong only to the Node entry point. The shared core and
// Web entry point use native Web Streams without loading this adapter.
export default class NodeIconv<Bytes extends Uint8Array = Buffer> extends Iconv<Bytes> {
  declare IconvLiteEncoderStream: ReturnType<typeof createStreams>["IconvLiteEncoderStream"]
  declare IconvLiteDecoderStream: ReturnType<typeof createStreams>["IconvLiteDecoderStream"]
  declare supportsStreams: true
  constructor (backend?: Backend<Bytes>) {
    super(backend)
    const streams = createStreams(stream)
    this.IconvLiteEncoderStream = streams.IconvLiteEncoderStream
    this.IconvLiteDecoderStream = streams.IconvLiteDecoderStream
    this.supportsStreams = true
    for (const method of ["encodeStream", "decodeStream"] as const) {
      Object.assign(this, { [method]: this[method].bind(this) })
    }
  }

  encodeStream (encoding: Encoding, options?: EncodeOptions) {
    return new this.IconvLiteEncoderStream(this.getEncoder(encoding, options), options, this)
  }

  decodeStream (encoding: Encoding, options?: DecodeOptions) {
    return new this.IconvLiteDecoderStream(this.getDecoder(encoding, options), options)
  }
}
