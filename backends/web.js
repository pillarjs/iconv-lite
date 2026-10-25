"use strict"
// NOTE: This backend uses TextDecoder class.
// NOTE: Web backend differs from Node in handling invalid surrogates when decoding to strings in rawCharsToResult() function.
//   Node passes them through unchanged, web backend (actually TextDecoder) replaces them with '�'. I haven't found a
//   performant way to unify these behaviors while keeping compatibility with Node <11 where there's no TextDecoder.
//   Not too worried as it seems like an edge case mostly concerning utf-16/utf-32/cesu8 codecs, but something to be aware of.

const utf8Encoder = new TextEncoder()
const binaryDecoder = new TextDecoder("utf-16le", { ignoreBOM: true })
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"))
const BASE64_VALUES = new Int16Array(256).fill(-1)
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_VALUES[BASE64_CHARS.charCodeAt(i)] = i
}
BASE64_VALUES[0x2d] = 62 // Accept the URL-safe alphabet too.
BASE64_VALUES[0x5f] = 63

module.exports = {
  encodeString (str, encoding) {
    if (encoding === "utf8") return utf8Encoder.encode(str)
    if (encoding === "hex") return hexToBytes(str)
    if (encoding === "base64") return base64ToBytes(str)
    const bytes = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
    return bytes
  },
  decodeBytes (bytes, encoding) {
    if (encoding === "hex") {
      if (typeof bytes.toHex === "function") return bytes.toHex()
      let result = ""
      for (const byte of bytes) result += HEX_BYTES[byte]
      return result
    }
    if (encoding === "base64" && typeof bytes.toBase64 === "function") return bytes.toBase64()
    const binary = bytesToBinaryString(bytes)
    return encoding === "base64" ? btoa(binary) : binary
  },
  copyBytes (bytes) {
    return new Uint8Array(bytes)
  },

  // Encoder string input: use str directly, .length, .charCodeAt(i).
  // Encoder bytes output: allocBytes() -> use Uint8Array -> bytesToResult().
  allocBytes (numBytes, fill) {
    const arr = new Uint8Array(new ArrayBuffer(numBytes))
    if (fill != null) {
      arr.fill(fill)
    }
    return arr
  },
  bytesToResult (bytes, finalLen) {
    return bytes.subarray(0, finalLen)
  },
  concatByteResults (bufs) {
    bufs = bufs.filter((b) => b.length > 0)
    if (bufs.length === 0) {
      return new Uint8Array()
    } else if (bufs.length === 1) {
      return bufs[0]
    }

    const totalLen = bufs.reduce((a, b) => a + b.length, 0)
    const res = new Uint8Array(new ArrayBuffer(totalLen))
    let curPos = 0
    for (var i = 0; i < bufs.length; i++) {
      res.set(bufs[i], curPos)
      curPos += bufs[i].length
    }
    return res
  },

  // Decoder bytes input: use only array access + .length, so both Buffer-s and Uint8Array-s work.
  // Decoder string output: allocRawChars -> use Uint16Array -> rawCharsToResult().
  allocRawChars (numChars) {
    return new Uint16Array(new ArrayBuffer(numChars * Uint16Array.BYTES_PER_ELEMENT))
  },
  rawCharsToResult (rawChars, finalLen) {
    rawChars = rawChars.subarray(0, finalLen)
    // NOTE: TextDecoder will convert all invalid surrogates to '�'-s.
    const res = new TextDecoder("utf-16", { ignoreBOM: true }).decode(rawChars)
    if (res.length !== finalLen) { throw new Error("TextDecoder returned different length string on array " + rawChars) }
    return res
  }

  // Optimizations
  // maybe buf.swap16()?
}

function bytesToBinaryString (bytes) {
  if (bytes.length >= 64) {
    // Widen bytes to UTF-16 code units before native decoding. Unlike a "latin1"
    // TextDecoder (Windows-1252), this preserves 0x80..0x9f. As in utf32.js, the
    // Uint16Array view uses the little-endian platforms supported by the codecs.
    return binaryDecoder.decode(new Uint16Array(bytes))
  }
  // Emit one flat string for short chunks, with a bounded argument count.
  if (bytes.length >= 16) return String.fromCharCode.apply(null, bytes)
  let result = ""
  for (let i = 0; i < bytes.length; i++) result += String.fromCharCode(bytes[i])
  return result
}

function hexValue (code) {
  if (code >= 0x30 && code <= 0x39) return code - 0x30
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10
  return -1
}

function hexToBytes (str) {
  // Native parsing pays off on larger inputs and requires valid pairs.
  // Keep the forgiving path for short strings and malformed input.
  if (str.length >= 128 && typeof Uint8Array.fromHex === "function" && str.length % 2 === 0 && !/[^0-9a-f]/i.test(str)) {
    return Uint8Array.fromHex(str)
  }
  const bytes = new Uint8Array(Math.floor(str.length / 2))
  let length = 0
  for (let i = 0; i + 1 < str.length; i += 2) {
    // Preserve Buffer's low-byte interpretation of non-ASCII code units.
    const high = hexValue(str.charCodeAt(i) & 0xff)
    const low = hexValue(str.charCodeAt(i + 1) & 0xff)
    if (high < 0 || low < 0) break
    bytes[length++] = (high << 4) | low
  }
  return length === bytes.length ? bytes : bytes.subarray(0, length)
}

function base64ToBytes (str) {
  // Avoid native-call and validation overhead on short strings. Larger, complete
  // standard-alphabet quads can use the native decoder; keep the forgiving fallback.
  if (str.length >= 1024 && typeof Uint8Array.fromBase64 === "function" && str.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    return Uint8Array.fromBase64(str)
  }
  // Match the forgiving Buffer decoder: accept both alphabets, skip invalid
  // characters, stop at padding and ignore any incomplete final sextet.
  const bytes = new Uint8Array(Math.floor(str.length * 3 / 4))
  let acc = 0
  let bits = 0
  let length = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) & 0xff
    if (code === 0x3d) break
    const value = BASE64_VALUES[code]
    if (value < 0) continue
    acc = (acc << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[length++] = (acc >>> bits) & 0xff
    }
  }
  return length === bytes.length ? bytes : bytes.subarray(0, length)
}
