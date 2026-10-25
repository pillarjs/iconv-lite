// Keep streaming state here and delegate platform-specific conversions to the
// backend: native Buffer operations in Node, Web APIs and typed arrays in browsers.

// ------------------------------------------------------------------------------

class InternalCodec {
  constructor (codecOptions) {
    this.enc = codecOptions.encodingName
    this.bomAware = codecOptions.bomAware
  }

  createEncoder (options, iconv) {
    if (this.enc === "base64") {
      return new InternalEncoderBase64(iconv.backend)
    } else if (this.enc === "utf8") {
      return new InternalEncoderUtf8(iconv.backend)
    } else if (this.enc === "cesu8") {
      return new InternalEncoderCesu8(iconv.backend)
    }
    return new InternalEncoder(iconv.backend, this.enc)
  }

  createDecoder (options, iconv) {
    if (this.enc === "utf8") {
      return new InternalDecoder(options)
    } else if (this.enc === "cesu8") {
      return new InternalDecoderCesu8(iconv.defaultCharUnicode)
    }
    return new InternalDecoderBytes(iconv.backend, this.enc)
  }
}

// ------------------------------------------------------------------------------

class InternalDecoder {
  constructor (options) {
    // Leave BOM handling to iconv-lite's wrapper, including stripBOM callbacks.
    this.decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: !!options?.fatal })
  }

  write (buf) {
    return this.decoder.decode(buf, { stream: true })
  }

  end () {
    // Final flush (stream: false) so a trailing incomplete sequence is finalized: replaced with
    // U+FFFD, or (in fatal mode) raised as an error, per the WHATWG Encoding Standard.
    return this.decoder.decode()
  }
}

// Binary, hex and Base64 expose the buffered bytes as a string on final flush.
class InternalDecoderBytes {
  constructor (backend, encoding) {
    this.backend = backend
    this.enc = encoding
    this.chunks = []
  }

  // A complete input can be converted directly without retaining a copy.
  decode (buf) {
    return this.backend.decodeBytes(buf, this.enc)
  }

  write (buf) {
    if (buf.length > 0) {
      // Copy so callers can reuse or mutate their input after write().
      this.chunks.push(this.backend.copyBytes(buf))
    }
    return ""
  }

  end () {
    // Avoid a second copy for the common, single-write decode() call.
    const bytes = this.chunks.length === 1 ? this.chunks[0] : this.backend.concatByteResults(this.chunks)
    this.chunks = []
    return this.backend.decodeBytes(bytes, this.enc)
  }
}

// ------------------------------------------------------------------------------
// Encoder is mostly trivial

class InternalEncoder {
  constructor (backend, encoding) {
    this.backend = backend
    this.enc = encoding
  }

  write (str) {
    return this.backend.encodeString(str, this.enc)
  }

  end () {}
}

// ------------------------------------------------------------------------------
// Except base64 encoder, which must keep its state.

class InternalEncoderBase64 {
  constructor (backend) {
    this.backend = backend
    this.prevStr = ""
  }

  write (str) {
    str = this.prevStr + str
    var completeQuads = str.length - (str.length % 4)
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

class InternalEncoderCesu8 {
  constructor (backend) {
    this.backend = backend
  }

  write (str) {
    var buf = new Uint8Array(str.length * 3); var bufIdx = 0
    for (var i = 0; i < str.length; i++) {
      var charCode = str.charCodeAt(i)
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

  end () {}
}

// ------------------------------------------------------------------------------
// CESU-8 preserves UTF-16 code units, including lone surrogates. TextDecoder's
// UTF-8 decoder rejects these, so decode CESU-8 directly from bytes.

class InternalDecoderCesu8 {
  constructor (defaultCharUnicode) {
    this.acc = 0
    this.contBytes = 0
    this.accBytes = 0
    this.defaultCharUnicode = defaultCharUnicode
  }

  write (buf) {
    var acc = this.acc; var contBytes = this.contBytes; var accBytes = this.accBytes
    var res = ""
    for (var i = 0; i < buf.length; i++) {
      var curByte = buf[i]
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

class InternalEncoderUtf8 {
  constructor (backend) {
    this.backend = backend
    this.highSurrogate = ""
  }

  write (str) {
    if (this.highSurrogate) {
      str = this.highSurrogate + str
      this.highSurrogate = ""
    }

    if (str.length > 0) {
      var charCode = str.charCodeAt(str.length - 1)
      if (charCode >= 0xd800 && charCode < 0xdc00) {
        this.highSurrogate = str[str.length - 1]
        str = str.slice(0, str.length - 1)
      }
    }

    return this.backend.encodeString(str, "utf8")
  }

  end () {
    if (this.highSurrogate) {
      var str = this.highSurrogate
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
