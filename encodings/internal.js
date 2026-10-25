"use strict"
const Buffer = require("buffer").Buffer

// ------------------------------------------------------------------------------

class InternalCodec {
  constructor (codecOptions, iconv) {
    this.enc = codecOptions.encodingName
    this.bomAware = codecOptions.bomAware
    this.encoder = InternalEncoder
    this.decoder = InternalDecoder

    if (this.enc === "base64") {
      this.encoder = InternalEncoderBase64
    } else if (this.enc === "utf8") {
      this.encoder = InternalEncoderUtf8
    } else if (this.enc === "cesu8") {
      this.enc = "utf8" // Use utf8 for decoding.
      this.encoder = InternalEncoderCesu8

      // Add decoder for versions of Node not supporting CESU-8
      if (Buffer.from("eda0bdedb2a9", "hex").toString() !== "💩") {
        this.decoder = InternalDecoderCesu8
        this.defaultCharUnicode = iconv.defaultCharUnicode
      }
    }
  }
}

// ------------------------------------------------------------------------------

class InternalDecoder {
  constructor (options, codec) {
    if (codec.enc === "hex" || codec.enc === "base64" || codec.enc === "binary") {
      this.decoder = {
        enc: codec.enc,
        buffer: Buffer.from(""),
        decode (buf) {
          if (buf === undefined) {
            var res = this.buffer
            this.buffer = Buffer.from("")
            return res.toString(this.enc)
          } else {
            if (!Buffer.isBuffer(buf)) {
              buf = Buffer.from(buf)
            }
            this.buffer = Buffer.concat([this.buffer, buf])
            return ""
          }
        }
      }
    } else {
      this.decoder = new TextDecoder(codec.enc, {
        ignoreBOM: options?.stripBOM === false || typeof options?.stripBOM === "function",
        fatal: !!options?.fatal
      })
    }
  }

  write (buf) {
    if (!Buffer.isBuffer(buf)) {
      buf = Buffer.from(buf)
    }
    return this.decoder.decode(buf, { stream: true })
  }

  end () {
    // Final flush (stream: false) so a trailing incomplete sequence is finalized: replaced with
    // U+FFFD, or (in fatal mode) raised as an error, per the WHATWG Encoding Standard.
    return this.decoder.decode()
  }
}

// ------------------------------------------------------------------------------
// Encoder is mostly trivial

class InternalEncoder {
  constructor (options, codec) {
    this.enc = codec.enc
  }

  write (str) {
    return Buffer.from(str, this.enc)
  }

  end () {}
}

// ------------------------------------------------------------------------------
// Except base64 encoder, which must keep its state.

class InternalEncoderBase64 {
  constructor () {
    this.prevStr = ""
  }

  write (str) {
    str = this.prevStr + str
    var completeQuads = str.length - (str.length % 4)
    this.prevStr = str.slice(completeQuads)
    str = str.slice(0, completeQuads)

    return Buffer.from(str, "base64")
  }

  end () {
    return Buffer.from(this.prevStr, "base64")
  }
}

// ------------------------------------------------------------------------------
// CESU-8 encoder is also special.

class InternalEncoderCesu8 {
  write (str) {
    var buf = Buffer.alloc(str.length * 3); var bufIdx = 0
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
    return buf.slice(0, bufIdx)
  }

  end () {}
}

// ------------------------------------------------------------------------------
// CESU-8 decoder is not implemented in Node v4.0+

class InternalDecoderCesu8 {
  constructor (options, codec) {
    this.acc = 0
    this.contBytes = 0
    this.accBytes = 0
    this.defaultCharUnicode = codec.defaultCharUnicode
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
    var res = 0
    if (this.contBytes > 0) { res += this.defaultCharUnicode }
    return res
  }
}

// ------------------------------------------------------------------------------
// check the chunk boundaries for surrogate pair

class InternalEncoderUtf8 {
  constructor () {
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

    return Buffer.from(str, this.enc)
  }

  end () {
    if (this.highSurrogate) {
      var str = this.highSurrogate
      this.highSurrogate = ""
      return Buffer.from(str, this.enc)
    }
  }
}

// Export Node.js internal encodings.

module.exports = {
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
