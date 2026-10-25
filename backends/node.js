"use strict"
// NOTE: This backend uses Buffer APIs that are only available in Node v4.5+ and v5.10+.

module.exports = {
  // Keep the internal encodings on Node's native conversion paths.
  encodeString (str, encoding) {
    return Buffer.from(str, encoding)
  },
  decodeBytes (bytes, encoding) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return buf.toString(encoding)
  },
  copyBytes (bytes) {
    return Buffer.from(bytes)
  },

  // Encoder string input: use str directly, .length, .charCodeAt(i).
  // Encoder bytes output: allocBytes() -> use Uint8Array -> bytesToResult().
  allocBytes (numBytes, fill) {
    // NOTE: We could do a 'new ArrayBuffer' here, but Buffer.alloc gives us pooling, which makes small chunks faster.
    const buf = Buffer.alloc(numBytes, fill)
    return new Uint8Array(buf.buffer, buf.byteOffset, numBytes)
  },
  bytesToResult (bytes, finalLen) {
    // Do not retain the backing allocation when no bytes were produced.
    if (finalLen === 0) return Buffer.alloc(0)
    return Buffer.from(bytes.buffer, bytes.byteOffset, finalLen)
  },
  concatByteResults (bufs) {
    return Buffer.concat(bufs)
  },

  // Decoder bytes input: use only array access + .length, so both Buffer-s and Uint8Array-s work.
  // Decoder string output: allocRawChars -> use Uint16Array -> rawCharsToResult().
  allocRawChars (numChars) {
    // NOTE: We could do a 'new ArrayBuffer' here, but Buffer.alloc gives us pooling, which makes small chunks faster.
    const buf = Buffer.alloc(numChars * Uint16Array.BYTES_PER_ELEMENT)
    return new Uint16Array(buf.buffer, buf.byteOffset, numChars)
  },
  rawCharsToResult (rawChars, finalLen) {
    if (finalLen === 0) {
      return ""
    }
    return Buffer.from(rawChars.buffer)
      .slice(rawChars.byteOffset, rawChars.byteOffset + finalLen * Uint16Array.BYTES_PER_ELEMENT)
      .toString("ucs2")
  }

  // Optimizations
  // maybe buf.swap16()?
}
