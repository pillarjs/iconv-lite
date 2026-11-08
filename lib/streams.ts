import type { Transform, TransformOptions, TransformCallback } from "node:stream"
import type { WebIconv, EncoderStream, DecoderStream, EncodeOptions, DecodeOptions } from "./iconv.js"

export interface EncoderTransform<Bytes extends Uint8Array> extends Transform {
  collect(cb: (error: Error | null, result?: Bytes) => void): this
}

export interface DecoderTransform extends Transform {
  collect(cb: (error: Error | null, result?: string) => void): this
}

interface StreamConstructors {
  IconvLiteEncoderStream: new <Bytes extends Uint8Array>(conv: EncoderStream<Bytes>, options: (EncodeOptions & Omit<TransformOptions, "defaultEncoding">) | undefined, iconv: WebIconv<Bytes>) => EncoderTransform<Bytes>
  IconvLiteDecoderStream: new (conv: DecoderStream, options?: DecodeOptions & Omit<TransformOptions, "defaultEncoding">) => DecoderTransform
}

// NOTE: Due to 'stream' module being pretty large (~100Kb, significant in browser environments),
// we opt to dependency-inject it instead of creating a hard dependency.
export default function (streamModule: Pick<typeof import("node:stream"), "Transform">): StreamConstructors {
  class IconvLiteEncoderStream<Bytes extends Uint8Array> extends streamModule.Transform {
    declare conv: EncoderStream<Bytes>
    declare iconv: WebIconv<Bytes>
    constructor (conv: EncoderStream<Bytes>, options: (EncodeOptions & Omit<TransformOptions, "defaultEncoding">) | undefined, iconv: WebIconv<Bytes>) {
      options = options || {}
      options.decodeStrings = false // We accept only strings, so we don't need to decode them.
      super(options as TransformOptions)
      this.conv = conv
      this.iconv = iconv
    }

    _transform (chunk: unknown, encoding: BufferEncoding, done: TransformCallback) {
      if (typeof chunk !== "string") { return done(new Error("Iconv encoding stream needs strings as its input.")) }
      try {
        const res = this.conv.write(chunk)
        if (res && res.length) this.push(res)
        done()
      } catch (e) {
        done(e as Error)
      }
    }

    _flush (done: TransformCallback) {
      try {
        const res = this.conv.end()
        if (res && res.length) this.push(res)
        done()
      } catch (e) {
        done(e as Error)
      }
    }

    collect (cb: (error: Error | null, result?: Bytes) => void) {
      const chunks: Bytes[] = []
      this.on("error", cb)
      this.on("data", (chunk) => chunks.push(chunk))
      this.on("end", () => cb(null, this.iconv.backend.concatByteResults(chunks)))
      return this
    }
  }

  class IconvLiteDecoderStream extends streamModule.Transform {
    declare conv: DecoderStream
    declare encoding: BufferEncoding
    constructor (conv: DecoderStream, options?: DecodeOptions & Omit<TransformOptions, "defaultEncoding">) {
      options = options || {}
      options.encoding = "utf8" // We output strings.
      super(options as TransformOptions)
      this.conv = conv
      this.encoding = options.encoding
    }

    _transform (chunk: unknown, encoding: BufferEncoding, done: TransformCallback) {
      if (!(chunk instanceof Uint8Array)) { return done(new Error("Iconv decoding stream needs Uint8Array-s or Buffers as its input.")) }
      try {
        const res = this.conv.write(chunk)
        if (res && res.length) this.push(res, this.encoding)
        done()
      } catch (e) {
        done(e as Error)
      }
    }

    _flush (done: TransformCallback) {
      try {
        const res = this.conv.end()
        if (res && res.length) this.push(res, this.encoding)
        done()
      } catch (e) {
        done(e as Error)
      }
    }

    collect (cb: (error: Error | null, result?: string) => void) {
      let res = ""
      this.on("error", cb)
      this.on("data", (chunk) => { res += chunk })
      this.on("end", () => cb(null, res))
      return this
    }
  }

  return {
    IconvLiteEncoderStream,
    IconvLiteDecoderStream
  }
}
