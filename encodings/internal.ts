import type { Backend, WebIconv, EncodeOptions, DecodeOptions } from "../lib/types.js"
// Keep streaming state here and delegate platform-specific conversions to the
// backend: native Buffer operations in Node, Web APIs and typed arrays in browsers.

import { TextEncoderWithHandler, isUnicodeScalar, isBinaryCharacter } from "../lib/encoding-handler.js"

// ------------------------------------------------------------------------------

type NativeEncoding = "utf8" | "binary" | "hex" | "base64"
interface InternalOptions { encodingName: NativeEncoding | "cesu8", bomAware?: boolean }

class InternalCodec {
  declare enc: NativeEncoding | "cesu8"
  declare bomAware: boolean | undefined

  constructor (codecOptions: InternalOptions) {
    this.enc = codecOptions.encodingName
    this.bomAware = codecOptions.bomAware
  }

  createEncoder<Bytes extends Uint8Array> (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    if ((this.enc === "hex" || this.enc === "base64") && options?.invalidCharHandler !== undefined) {
      throw new TypeError("invalidCharHandler is not supported for " + this.enc)
    }
    if (this.enc === "base64") {
      return new InternalEncoderBase64(iconv.backend)
    } else if (this.enc === "utf8") {
      const encoder = new InternalEncoderUtf8(iconv.backend)
      return typeof options?.invalidCharHandler === "function"
        ? new TextEncoderWithHandler(encoder, iconv.backend, options.invalidCharHandler, this.enc, isUnicodeScalar, "\uFFFD")
        : encoder
    } else if (this.enc === "cesu8") {
      return new InternalEncoderCesu8(iconv.backend)
    }
    const encoder = new InternalEncoder(iconv.backend, this.enc)
    return this.enc === "binary" && typeof options?.invalidCharHandler === "function"
      ? new TextEncoderWithHandler(encoder, iconv.backend, options.invalidCharHandler, this.enc, isBinaryCharacter)
      : encoder
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) {
    if (this.enc === "utf8") {
      return new InternalDecoder(options)
    } else if (this.enc === "cesu8") {
      return new InternalDecoderCesu8(iconv.defaultCharUnicode)
    } else if (this.enc === "base64") {
      return new InternalDecoderBase64(iconv.backend)
    }
    return new InternalDecoderBytes(iconv.backend, this.enc)
  }
}

// ------------------------------------------------------------------------------

class InternalDecoder {
  declare decoder: TextDecoder

  constructor (options: DecodeOptions | undefined) {
    // Leave BOM handling to iconv-lite's wrapper, including stripBOM callbacks.
    this.decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: !!options?.fatal })
  }

  write (buf: Uint8Array) {
    return this.decoder.decode(buf, { stream: true })
  }

  end () {
    // Final flush (stream: false) so a trailing incomplete sequence is finalized: replaced with
    // U+FFFD, or (in fatal mode) raised as an error, per the WHATWG Encoding Standard.
    return this.decoder.decode()
  }
}

// Binary and hex convert each chunk independently.
class InternalDecoderBytes {
  declare backend: Backend
  declare enc: "binary" | "hex" | "base64"

  constructor (backend: Backend, encoding: "binary" | "hex" | "base64") {
    this.backend = backend
    this.enc = encoding
  }

  // A complete input can be converted directly without retaining a copy.
  decode (buf: Uint8Array) {
    return this.backend.decodeBytes(buf, this.enc)
  }

  write (buf: Uint8Array) {
    return this.decode(buf)
  }

  end () {
    return ""
  }
}

// Base64 retains at most two bytes so padding appears only on final flush.
class InternalDecoderBase64 extends InternalDecoderBytes {
  #pending = new Uint8Array(3)
  #pendingLength = 0

  constructor (backend: Backend) {
    super(backend, "base64")
  }

  write (buf: Uint8Array) {
    let result = ""
    if (this.#pendingLength > 0) {
      const length = Math.min(3 - this.#pendingLength, buf.length)
      this.#pending.set(buf.subarray(0, length), this.#pendingLength)
      this.#pendingLength += length
      if (this.#pendingLength < 3) return ""
      result = this.decode(this.#pending)
      this.#pendingLength = 0
      buf = buf.subarray(length)
    }

    const completeLength = buf.length - (buf.length % 3)
    if (completeLength > 0) result += this.decode(buf.subarray(0, completeLength))
    this.#pending.set(buf.subarray(completeLength))
    this.#pendingLength = buf.length - completeLength
    return result
  }

  end () {
    const result = this.decode(this.#pending.subarray(0, this.#pendingLength))
    this.#pendingLength = 0
    return result
  }
}

// ------------------------------------------------------------------------------
// Encoder is mostly trivial

class InternalEncoder<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>
  declare enc: NativeEncoding

  constructor (backend: Backend<Bytes>, encoding: NativeEncoding) {
    this.backend = backend
    this.enc = encoding
  }

  write (str: string) {
    return this.backend.encodeString(str, this.enc)
  }

  end (): undefined {}
}

// ------------------------------------------------------------------------------
// Except base64 encoder, which must keep its state.

class InternalEncoderBase64<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>
  declare prevStr: string

  constructor (backend: Backend<Bytes>) {
    this.backend = backend
    this.prevStr = ""
  }

  write (str: string) {
    str = this.prevStr + str
    const completeQuads = str.length - (str.length % 4)
    this.prevStr = str.slice(completeQuads)
    str = str.slice(0, completeQuads)

    return this.backend.encodeString(str, "base64")
  }

  end () {
    return this.backend.encodeString(this.prevStr, "base64")
  }
}

// ------------------------------------------------------------------------------
// CESU-8 encoder is also special.

class InternalEncoderCesu8<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>

  constructor (backend: Backend<Bytes>) {
    this.backend = backend
  }

  write (str: string) {
    const buf = new Uint8Array(str.length * 3); let bufIdx = 0
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i)
      // Naive implementation, but it works because CESU-8 is especially easy
      // to convert from UTF-16 (which all JS strings are encoded in).
      if (charCode < 0x80) { buf[bufIdx++] = charCode } else if (charCode < 0x800) {
        buf[bufIdx++] = 0xC0 + (charCode >>> 6)
        buf[bufIdx++] = 0x80 + (charCode & 0x3f)
      } else { // charCode will always be < 0x10000 in javascript.
        buf[bufIdx++] = 0xE0 + (charCode >>> 12)
        buf[bufIdx++] = 0x80 + ((charCode >>> 6) & 0x3f)
        buf[bufIdx++] = 0x80 + (charCode & 0x3f)
      }
    }
    return this.backend.bytesToResult(buf, bufIdx)
  }

  end (): undefined {}
}

// ------------------------------------------------------------------------------
// CESU-8 preserves UTF-16 code units, including lone surrogates. TextDecoder's
// UTF-8 decoder rejects these, so decode CESU-8 directly from bytes.

class InternalDecoderCesu8 {
  declare acc: number
  declare contBytes: number
  declare accBytes: number
  declare defaultCharUnicode: string

  constructor (defaultCharUnicode: string) {
    this.acc = 0
    this.contBytes = 0
    this.accBytes = 0
    this.defaultCharUnicode = defaultCharUnicode
  }

  write (buf: Uint8Array) {
    let acc = this.acc; let contBytes = this.contBytes; let accBytes = this.accBytes
    let res = ""
    for (let i = 0; i < buf.length; i++) {
      const curByte = buf[i]
      if ((curByte & 0xC0) !== 0x80) { // Leading byte
        if (contBytes > 0) { // Previous code is invalid
          res += this.defaultCharUnicode
          contBytes = 0
        }

        if (curByte < 0x80) { // Single-byte code
          res += String.fromCharCode(curByte)
        } else if (curByte < 0xE0) { // Two-byte code
          acc = curByte & 0x1F
          contBytes = 1; accBytes = 1
        } else if (curByte < 0xF0) { // Three-byte code
          acc = curByte & 0x0F
          contBytes = 2; accBytes = 1
        } else { // Four or more are not supported for CESU-8.
          res += this.defaultCharUnicode
        }
      } else { // Continuation byte
        if (contBytes > 0) { // We're waiting for it.
          acc = (acc << 6) | (curByte & 0x3f)
          contBytes--; accBytes++
          if (contBytes === 0) {
            // Check for overlong encoding, but support Modified UTF-8 (encoding NULL as C0 80)
            if (accBytes === 2 && acc < 0x80 && acc > 0) {
              res += this.defaultCharUnicode
            } else if (accBytes === 3 && acc < 0x800) {
              res += this.defaultCharUnicode
            } else {
              // Actually add character.
              res += String.fromCharCode(acc)
            }
          }
        } else { // Unexpected continuation byte
          res += this.defaultCharUnicode
        }
      }
    }
    this.acc = acc; this.contBytes = contBytes; this.accBytes = accBytes
    return res
  }

  end () {
    if (this.contBytes > 0) {
      this.contBytes = 0
      return this.defaultCharUnicode
    }
  }
}

// ------------------------------------------------------------------------------
// check the chunk boundaries for surrogate pair

class InternalEncoderUtf8<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>
  declare highSurrogate: string

  constructor (backend: Backend<Bytes>) {
    this.backend = backend
    this.highSurrogate = ""
  }

  write (str: string) {
    if (this.highSurrogate) {
      str = this.highSurrogate + str
      this.highSurrogate = ""
    }

    if (str.length > 0) {
      const charCode = str.charCodeAt(str.length - 1)
      if (charCode >= 0xd800 && charCode < 0xdc00) {
        this.highSurrogate = str[str.length - 1]
        str = str.slice(0, str.length - 1)
      }
    }

    return this.backend.encodeString(str, "utf8")
  }

  end () {
    if (this.highSurrogate) {
      const str = this.highSurrogate
      this.highSurrogate = ""
      return this.backend.encodeString(str, "utf8")
    }
  }
}

// Export the internal encodings shared by Node and browsers.

export default {
  // Encodings
  utf8: { type: "_internal", bomAware: true },
  cesu8: { type: "_internal", bomAware: true },
  unicode11utf8: "utf8",

  // NOTE: utf-16le/ucs2 are in utf16.js.

  binary: { type: "_internal" },
  base64: { type: "_internal" },
  hex: { type: "_internal" },

  // Codec.
  _internal: InternalCodec
}
