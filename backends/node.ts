// NOTE: This backend uses Buffer APIs that are only available in Node v4.5+ and v5.10+.
import type { Backend } from "../lib/iconv.js"

export default {
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
    // Buffer is also a Uint8Array, so callers can write into it directly.
    return Buffer.alloc(numBytes, fill)
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
    return new Uint16Array(numChars)
  },
  rawCharsToResult (rawChars, finalLen) {
    if (finalLen === 0) {
      return ""
    }
    // Avoid exposing the backing ArrayBuffer for short outputs. Native UCS-2
    // conversion is faster once the character buffer exceeds 64 bytes.
    if (rawChars.length <= 32) {
      // Copying a short prefix is faster than creating a subarray view here.
      const chars = finalLen === rawChars.length ? rawChars : rawChars.slice(0, finalLen)
      return String.fromCharCode.apply(null, chars as unknown as number[])
    }
    return Buffer.from(rawChars.buffer, rawChars.byteOffset, finalLen * Uint16Array.BYTES_PER_ELEMENT)
      .toString("ucs2")
  }

  // Optimizations
  // maybe buf.swap16()?
} satisfies Backend<Buffer>
