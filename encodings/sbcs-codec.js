import { EncodingHandler, EncodingBuffer } from "../lib/encoding-handler.js"

// Single-byte codec. Needs a 'chars' string parameter that contains 256 or 128 chars that
// correspond to encoded bytes (if 128 - then lower half is ASCII).

export const _sbcs = class SBCSCodec {
  constructor (codecOptions, iconv) {
    if (!codecOptions) {
      throw new Error("SBCS codec is called without the data.")
    }

    // Prepare char buffer for decoding.
    if (!codecOptions.chars || (codecOptions.chars.length !== 128 && codecOptions.chars.length !== 256)) {
      throw new Error("Encoding '" + codecOptions.type + "' has incorrect 'chars' (must be of len 128 or 256)")
    }

    if (codecOptions.chars.length === 128) {
      var asciiString = ""
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

    // Encoding buffer.
    const defaultCharSingleByte = iconv.defaultCharSingleByte
    const defaultCharByte = typeof defaultCharSingleByte === "string" &&
      defaultCharSingleByte.length === 1
      ? defaultCharSingleByte.charCodeAt(0)
      : NaN
    if (defaultCharByte > 0xFF || Number.isNaN(defaultCharByte)) {
      throw new TypeError("defaultCharSingleByte must be a single-byte character")
    }
    const encodeBuf = iconv.backend.allocBytes(65536, defaultCharByte)

    for (let i = 0; i < codecOptions.chars.length; i++) {
      const code = codecOptions.chars.charCodeAt(i)
      // U+FFFD marks unassigned bytes in decode tables, not an encodable character.
      // Keep defaultCharSingleByte for it instead of mapping it to an unassigned byte.
      if (code === 0xFFFD) continue
      encodeBuf[code] = i
    }

    this.encodingName = codecOptions.encodingName
    this.encodeBuf = encodeBuf
    this.defaultCharByte = defaultCharByte
    this.defaultCharCode = codecOptions.chars.charCodeAt(defaultCharByte)
  }

  get encoder () { return SBCSEncoder }
  get decoder () { return SBCSDecoder }
}

class SBCSEncoder {
  #handler

  constructor (opts, codec, backend) {
    this.backend = backend
    this.encodeBuf = codec.encodeBuf
    if (typeof opts?.invalidCharHandler === "function") {
      this.#handler = new EncodingHandler(opts.invalidCharHandler, codec.encodingName)
    }
    this.defaultCharByte = codec.defaultCharByte
    this.defaultCharCode = codec.defaultCharCode
  }

  write (str) {
    if (!this.#handler) {
      const bytes = this.backend.allocBytes(str.length)
      const encodeBuf = this.encodeBuf
      for (let i = 0; i < str.length; i++) {
        bytes[i] = encodeBuf[str.charCodeAt(i)]
      }
      return this.backend.bytesToResult(bytes, bytes.length)
    }

    return this.#writeWithHandler(str, false)
  }

  #isRepresentable (char) {
    const code = char.charCodeAt(0)
    return char.length === 1 && code !== 0xFFFD &&
      (this.encodeBuf[code] !== this.defaultCharByte || code === this.defaultCharCode)
  }

  #writeWithHandler (str, final) {
    const output = new EncodingBuffer(this.backend, str.length)
    try {
      for (const { char, index } of this.#handler.read(str, final)) {
        if (this.#isRepresentable(char)) {
          output.writeByte(this.encodeBuf[char.charCodeAt(0)])
          continue
        }
        const replacement = this.#handler.resolve(char, index)
        if (replacement === null) {
          this.#handler.clear()
          return null
        }
        if (replacement === undefined) {
          // Preserve the existing fallback: one byte per UTF-16 code unit.
          for (let i = 0; i < char.length; i++) output.writeByte(this.defaultCharByte)
        } else {
          for (const replacementChar of replacement) {
            if (!this.#isRepresentable(replacementChar)) throw this.#handler.replacementError(replacementChar, index)
            output.writeByte(this.encodeBuf[replacementChar.charCodeAt(0)])
          }
        }
      }
      return output.finish()
    } catch (error) {
      this.#handler.clear()
      throw error
    }
  }

  end () {
    if (this.#handler?.hasPending) return this.#writeWithHandler("", true)
  }
}

class SBCSDecoder {
  constructor (opts, codec, backend) {
    this.decodeBuf = codec.decodeBuf
    this.backend = backend
  }

  write (buf) {
    // Strings are immutable in JS -> we use ucs2 buffer to speed up computations.
    const decodeBuf = this.decodeBuf
    const chars = this.backend.allocRawChars(buf.length)

    for (let i = 0; i < buf.length; i++) {
      chars[i] = decodeBuf[buf[i]]
    }
    return this.backend.rawCharsToResult(chars, chars.length)
  }

  end () {}
}
