import type { EncoderStream, DecoderStream } from "./iconv.js"

// TransformStream owns backpressure, cancellation and error propagation. The
// transformer only adapts the codec's synchronous write/end lifecycle.
type StreamCodec<Input, Output> = { write: (chunk: Input) => Output | null, end: () => Output | null | undefined }

class CodecTransformer<Input, Output extends string | Uint8Array> {
  #codec: { write: (chunk: Input) => Output | null, end: () => Output | null | undefined }
  #encoding: boolean

  constructor (codec: StreamCodec<Input, Output>, encoding: boolean) {
    this.#codec = codec
    this.#encoding = encoding
  }

  transform (chunk: Input, controller: TransformStreamDefaultController<Output>) {
    if (this.#encoding) {
      if (typeof chunk !== "string") throw new TypeError("Iconv encoding stream needs strings as its input.")
    } else if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Iconv decoding stream needs Uint8Array-s or Buffers as its input.")
    }
    this.#enqueue(this.#codec.write(chunk), controller)
  }

  flush (controller: TransformStreamDefaultController<Output>) {
    this.#enqueue(this.#codec.end(), controller)
  }

  #enqueue (result: Output | null | undefined, controller: TransformStreamDefaultController<Output>) {
    // A handler returning true discards the current write; it does not cancel
    // the stream. Throwing from a codec or handler errors both stream sides.
    if (result?.length) controller.enqueue(result)
  }
}

export function createEncodeWebStream<Bytes extends Uint8Array> (encoder: EncoderStream<Bytes>) {
  return new TransformStream(new CodecTransformer(encoder, true))
}

export function createDecodeWebStream (decoder: DecoderStream) {
  return new TransformStream(new CodecTransformer(decoder, false))
}
