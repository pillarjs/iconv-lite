import type { Backend, WebIconv, EncodeOptions, DecodeOptions } from "../lib/iconv.js"
import { EncodingHandler, EncodingBuffer, getDefaultCharByte, DEFAULT_CHAR_BYTE } from "../lib/encoding-handler.js"
import { getDefaultCharUnicode } from "../lib/decoding.js"

// Single-byte codec. Needs a 'chars' string parameter that contains 256 or 128 chars that
// correspond to encoded bytes (if 128 - then lower half is ASCII).

interface SBCSOptions { encodingName: string, type?: string, chars: string }

class SBCSCodec {
  declare decodeBuf: Uint16Array
  declare encodingName: string
  declare encodeBuf: Uint8Array

  constructor (codecOptions: SBCSOptions, iconv: WebIconv) {
    if (!codecOptions) {
      throw new Error("SBCS codec is called without the data.")
    }

    // Prepare char buffer for decoding.
    if (!codecOptions.chars || (codecOptions.chars.length !== 128 && codecOptions.chars.length !== 256)) {
      throw new Error("Encoding '" + codecOptions.type + "' has incorrect 'chars' (must be of len 128 or 256)")
    }

    if (codecOptions.chars.length === 128) {
      let asciiString = ""
      for (let i = 0; i < 128; i++) {
        asciiString += String.fromCharCode(i)
      }
      codecOptions.chars = asciiString + codecOptions.chars
    }

    const decodeBuf = new Uint16Array(codecOptions.chars.length)

    for (let i = 0; i < codecOptions.chars.length; i++) {
      decodeBuf[i] = codecOptions.chars.charCodeAt(i)
    }

    this.decodeBuf = decodeBuf
    this.encodingName = codecOptions.encodingName

    // Build one shared table. Per-encoder replacements never modify its entries.
    const encodeBuf = iconv.backend.allocBytes(65536, DEFAULT_CHAR_BYTE)
    for (let i = 0; i < decodeBuf.length; i++) {
      const code = decodeBuf[i]
      // U+FFFD marks unassigned bytes, not an encodable character.
      if (code !== 0xFFFD) encodeBuf[code] = i
    }
    this.encodeBuf = encodeBuf
  }

  get encoder () { return SBCSEncoder }
  get decoder () { return SBCSDecoder }

  createEncoder<Bytes extends Uint8Array> (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    return new SBCSEncoder(options, this, iconv.backend)
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) {
    return new SBCSDecoder(options, this, iconv.backend)
  }
}

class SBCSEncoder<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>
  declare encodeBuf: Uint8Array
  declare decodeBuf: Uint16Array

  #defaultCharByte: number
  #handler: EncodingHandler | undefined

  constructor (opts: EncodeOptions | undefined, codec: SBCSCodec, backend: Backend<Bytes>) {
    this.backend = backend
    this.encodeBuf = codec.encodeBuf
    this.decodeBuf = codec.decodeBuf
    this.#defaultCharByte = getDefaultCharByte(opts)
    if (typeof opts?.invalidCharHandler === "function") {
      this.#handler = new EncodingHandler(opts.invalidCharHandler, codec.encodingName)
    }
  }

  write (str: string) {
    if (!this.#handler) {
      const bytes = this.backend.allocBytes(str.length)
      const encodeBuf = this.encodeBuf
      if (this.#defaultCharByte === DEFAULT_CHAR_BYTE) {
        for (let i = 0; i < str.length; i++) {
          bytes[i] = encodeBuf[str.charCodeAt(i)]
        }
      } else {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i)
          const byte = encodeBuf[code]
          bytes[i] = byte !== DEFAULT_CHAR_BYTE || (code !== 0xFFFD && code === this.decodeBuf[DEFAULT_CHAR_BYTE])
            ? byte
            : this.#defaultCharByte
        }
      }
      return this.backend.bytesToResult(bytes, bytes.length)
    }

    return this.#writeWithHandler(str, false)
  }

  #isRepresentable (char: string) {
    const code = char.charCodeAt(0)
    return char.length === 1 && code !== 0xFFFD &&
      (this.encodeBuf[code] !== DEFAULT_CHAR_BYTE || code === this.decodeBuf[DEFAULT_CHAR_BYTE])
  }

  #writeWithHandler (str: string, final: boolean) {
    const output = new EncodingBuffer(this.backend, str.length)
    try {
      for (const { char, index } of this.#handler!.read(str, final)) {
        if (this.#isRepresentable(char)) {
          output.writeByte(this.encodeBuf[char.charCodeAt(0)])
          continue
        }
        const replacement = this.#handler!.resolve(char, index)
        if (replacement === null) {
          this.#handler!.clear()
          return null
        }
        if (replacement === undefined) {
          // Preserve the existing fallback: one byte per UTF-16 code unit.
          for (let i = 0; i < char.length; i++) output.writeByte(this.#defaultCharByte)
        } else {
          for (const replacementChar of replacement) {
            if (!this.#isRepresentable(replacementChar)) throw this.#handler!.replacementError(replacementChar, index)
            output.writeByte(this.encodeBuf[replacementChar.charCodeAt(0)])
          }
        }
      }
      return output.finish()
    } catch (error) {
      this.#handler!.clear()
      throw error
    }
  }

  end () {
    if (this.#handler?.hasPending) return this.#writeWithHandler("", true)
  }
}

class SBCSDecoder {
  declare decodeBuf: Uint16Array
  declare backend: Backend
  declare fatal: boolean
  declare encodingName: string
  #defaultCharUnicode: string

  constructor (opts: DecodeOptions | undefined, codec: SBCSCodec, backend: Backend) {
    this.decodeBuf = codec.decodeBuf
    this.backend = backend
    this.fatal = !!opts?.fatal
    this.encodingName = codec.encodingName
    this.#defaultCharUnicode = getDefaultCharUnicode(opts)
  }

  write (buf: Uint8Array) {
    // Strings are immutable in JS -> we use ucs2 buffer to speed up computations.
    const decodeBuf = this.decodeBuf
    const chars = this.backend.allocRawChars(buf.length)

    if (this.fatal) {
      for (let i = 0; i < buf.length; i++) {
        const code = decodeBuf[buf[i]]
        if (code === 0xFFFD) throw new TypeError("Invalid byte in " + this.encodingName)
        chars[i] = code
      }
    } else {
      for (let i = 0; i < buf.length; i++) {
        chars[i] = decodeBuf[buf[i]]
      }
    }
    const result = this.backend.rawCharsToResult(chars, chars.length)
    // Keep unassigned markers in the shared table for fatal decoding and encoding.
    // A callback inserts replacement text literally, including '$' patterns.
    return this.fatal || this.#defaultCharUnicode === "\uFFFD"
      ? result
      : result.replace(/\uFFFD/g, () => this.#defaultCharUnicode)
  }

  end (): undefined {}
}

export const _sbcs = SBCSCodec
