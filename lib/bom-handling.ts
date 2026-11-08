import type { EncoderStream, DecoderStream, DecodeOptions } from "./iconv.js"

const BOMChar = "\uFEFF"

// Internal decoder metadata: distinguish an input BOM from literal replacement text.
export const BOM_BYTES = Symbol("bomBytes")

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
  declare decoder: DecoderStream & { readonly [BOM_BYTES]?: readonly number[] }
  declare pass: boolean
  declare options: Omit<DecodeOptions, "stripBOM"> & { stripBOM?: boolean | (() => void) }
  #bomOffset = 0
  constructor (decoder: DecoderStream, options?: DecodeOptions) {
    this.decoder = decoder
    this.pass = false
    this.options = options || {}
  }

  write (buf: Uint8Array) {
    let res = this.decoder.write(buf)
    if (this.pass) { return res }

    const bom = this.decoder[BOM_BYTES]
    if (bom) {
      for (let i = 0; i < buf.length && this.#bomOffset < bom.length; i++) {
        if (buf[i] !== bom[this.#bomOffset]) {
          this.pass = true
          return res
        }
        this.#bomOffset++
      }
    }
    if (!res) { return res }

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
