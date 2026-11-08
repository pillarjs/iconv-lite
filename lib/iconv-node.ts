import type { TransformOptions } from "node:stream"
import type { Backend, DecodeOptions, EncodeOptions, Encoding } from "./iconv.js"
import CoreIconv from "./iconv.js"
import createStreams from "./streams.js"
import * as stream from "node:stream"

/** The Node API derived from its implementation, excluding internal stream constructors. */
export interface Iconv<Bytes extends Uint8Array = Buffer> extends Omit<NodeIconv<Bytes>, "IconvLiteEncoderStream" | "IconvLiteDecoderStream"> {}

// Node-style streams belong only to the Node entry point. The shared core and
// Web entry point use native Web Streams without loading this adapter.
export default class NodeIconv<Bytes extends Uint8Array = Buffer> extends CoreIconv<Bytes> {
  declare IconvLiteEncoderStream: ReturnType<typeof createStreams>["IconvLiteEncoderStream"]
  declare IconvLiteDecoderStream: ReturnType<typeof createStreams>["IconvLiteDecoderStream"]
  /** @readonly Whether Node-style streams are enabled. */
  declare readonly supportsStreams: boolean
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

  /** Creates a Node stream that encodes strings into bytes. */
  encodeStream (encoding: Encoding, options?: EncodeOptions & Omit<TransformOptions, "defaultEncoding">) {
    return new this.IconvLiteEncoderStream(this.getEncoder(encoding, options), options, this)
  }

  /** Creates a Node stream that decodes binary data into strings. */
  decodeStream (encoding: Encoding, options?: DecodeOptions & Omit<TransformOptions, "defaultEncoding">) {
    return new this.IconvLiteDecoderStream(this.getDecoder(encoding, options), options)
  }
}
