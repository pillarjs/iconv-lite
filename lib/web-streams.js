// TransformStream owns backpressure, cancellation and error propagation. The
// transformer only adapts the codec's synchronous write/end lifecycle.
class CodecTransformer {
  #codec
  #encoding

  constructor (codec, encoding) {
    this.#codec = codec
    this.#encoding = encoding
  }

  transform (chunk, controller) {
    if (this.#encoding) {
      if (typeof chunk !== "string") throw new TypeError("Iconv encoding stream needs strings as its input.")
    } else if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Iconv decoding stream needs Uint8Array-s or Buffers as its input.")
    }
    this.#enqueue(this.#codec.write(chunk), controller)
  }

  flush (controller) {
    this.#enqueue(this.#codec.end(), controller)
  }

  #enqueue (result, controller) {
    // A handler returning true discards the current write; it does not cancel
    // the stream. Throwing from a codec or handler errors both stream sides.
    if (result?.length) controller.enqueue(result)
  }
}

export function createEncodeWebStream (encoder) {
  return new TransformStream(new CodecTransformer(encoder, true))
}

export function createDecodeWebStream (decoder) {
  return new TransformStream(new CodecTransformer(decoder, false))
}
