import type { EncoderStream, DecoderStream, DecodeOptions } from "./types.js"

const BOMChar = "\uFEFF"

export class PrependBOM<Bytes extends Uint8Array> {
  declare encoder: EncoderStream<Bytes> & { writeWithBOM?: (str: string) => Bytes | null }
  declare addBOM: boolean
  constructor (encoder: EncoderStream<Bytes>) {
    this.encoder = encoder
    this.addBOM = true
  }

  write (str: string) {
    const res = this.addBOM && this.encoder.writeWithBOM
      ? this.encoder.writeWithBOM(str)
      : this.encoder.write(this.addBOM ? BOMChar + str : str)
    if (res !== null) this.addBOM = false
    return res
  }

  end () {
    return this.encoder.end()
  }
}

export class StripBOM {
  declare decoder: DecoderStream
  declare pass: boolean
  declare options: Omit<DecodeOptions, "stripBOM"> & { stripBOM?: boolean | (() => void) }
  constructor (decoder: DecoderStream, options?: DecodeOptions) {
    this.decoder = decoder
    this.pass = false
    this.options = options || {}
  }

  write (buf: Uint8Array) {
    let res = this.decoder.write(buf)
    if (this.pass || !res) { return res }

    if (res[0] === BOMChar) {
      res = res.slice(1)
      if (typeof this.options.stripBOM === "function") { this.options.stripBOM() }
    }

    this.pass = true
    return res
  }

  end () {
    return this.decoder.end()
  }
}
