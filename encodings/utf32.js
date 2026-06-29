"use strict"

const Buffer = require("buffer").Buffer

/**
 * UTF-32LE / UTF-32BE / UTF-32 (auto) codecs.
 *
 * NOTE: this step only restructures the previous implementation into the class-based codec interface
 * (createEncoder/createDecoder/bomAware) used by the other codecs; the conversion still goes through
 * the Node Buffer and the behavior is unchanged (lenient: surrogate code points pass through, trailing
 * incomplete bytes are dropped). Browser-native byte I/O, performance and strict conformance come in
 * later steps.
 *
 * @see https://en.wikipedia.org/wiki/UTF-32
 */

/** UTF-32LE codec. */
class Utf32LECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(true) }
  createDecoder (options, iconv) { return new Utf32Decoder(true, iconv.defaultCharUnicode.charCodeAt(0)) }
  get bomAware () { return true }
}

/** UTF-32BE codec. */
class Utf32BECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(false) }
  createDecoder (options, iconv) { return new Utf32Decoder(false, iconv.defaultCharUnicode.charCodeAt(0)) }
  get bomAware () { return true }
}

/**
 * UTF-32 encoder. Combines surrogate pairs into code points and writes each as 4 bytes. A lone
 * surrogate is written through as its own (semi-invalid) code point, which some applications expect
 * (e.g. Windows file names). Stateful across writes: a high surrogate at the end of one write() is
 * held for the next.
 */
class Utf32Encoder {
  /** @param {boolean} isLE Little-endian when true. */
  constructor (isLE) {
    this.isLE = isLE
    this.highSurrogate = 0
  }

  /**
   * @param {string} str
   * @returns {Buffer}
   */
  write (str) {
    const src = Buffer.from(str, "ucs2")
    let dst = Buffer.alloc(src.length * 2)
    const isLE = this.isLE
    let offset = 0

    for (let i = 0; i < src.length; i += 2) {
      const code = src.readUInt16LE(i)
      const isHighSurrogate = code >= 0xD800 && code < 0xDC00
      const isLowSurrogate = code >= 0xDC00 && code < 0xE000

      if (this.highSurrogate) {
        if (isHighSurrogate || !isLowSurrogate) {
          // Two high surrogates in a row, or a high surrogate not followed by a low one: keep the
          // pending high surrogate as a stand-alone (semi-invalid) character.
          if (isLE) { dst.writeUInt32LE(this.highSurrogate, offset) } else { dst.writeUInt32BE(this.highSurrogate, offset) }
          offset += 4
        } else {
          // Combine the high and low surrogate into a single 32-bit code point.
          const codepoint = (((this.highSurrogate - 0xD800) << 10) | (code - 0xDC00)) + 0x10000
          if (isLE) { dst.writeUInt32LE(codepoint, offset) } else { dst.writeUInt32BE(codepoint, offset) }
          offset += 4
          this.highSurrogate = 0
          continue
        }
      }

      if (isHighSurrogate) {
        this.highSurrogate = code
      } else {
        // A low surrogate with no preceding high surrogate is also kept as a stand-alone character.
        if (isLE) { dst.writeUInt32LE(code, offset) } else { dst.writeUInt32BE(code, offset) }
        offset += 4
        this.highSurrogate = 0
      }
    }

    if (offset < dst.length) { dst = dst.slice(0, offset) }
    return dst
  }

  /** @returns {Buffer|undefined} A leftover unpaired high surrogate, as a stand-alone character. */
  end () {
    if (!this.highSurrogate) { return }
    const buf = Buffer.alloc(4)
    if (this.isLE) { buf.writeUInt32LE(this.highSurrogate, 0) } else { buf.writeUInt32BE(this.highSurrogate, 0) }
    this.highSurrogate = 0
    return buf
  }
}

/**
 * UTF-32 decoder. Reads 4-byte code points and emits the corresponding UTF-16. A code point outside
 * 0..0x10FFFF is replaced with the bad-char. Streaming: a code point split across a chunk boundary is
 * buffered (`overflow`) and finished on the next write; trailing bytes that never complete a code
 * point are dropped at end().
 */
class Utf32Decoder {
  /**
   * @param {boolean} isLE Little-endian when true.
   * @param {number} badChar Code unit emitted for an out-of-range code point.
   */
  constructor (isLE, badChar) {
    this.isLE = isLE
    this.badChar = badChar
    this.overflow = []
  }

  /**
   * @param {Buffer|Uint8Array} src
   * @returns {string}
   */
  write (src) {
    if (src.length === 0) { return "" }

    const isLE = this.isLE
    const overflow = this.overflow
    const badChar = this.badChar
    const dst = Buffer.alloc(src.length + 4)
    let offset = 0
    let codepoint = 0
    let i = 0

    // Finish a code point that was split across the previous chunk boundary.
    if (overflow.length > 0) {
      for (; i < src.length && overflow.length < 4; i++) { overflow.push(src[i]) }
      if (overflow.length === 4) {
        if (isLE) {
          codepoint = overflow[0] | (overflow[1] << 8) | (overflow[2] << 16) | (overflow[3] << 24)
        } else {
          codepoint = overflow[3] | (overflow[2] << 8) | (overflow[1] << 16) | (overflow[0] << 24)
        }
        overflow.length = 0
        offset = writeCodepoint(dst, offset, codepoint, badChar)
      }
    }

    // Main loop.
    for (; i < src.length - 3; i += 4) {
      if (isLE) {
        codepoint = src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)
      } else {
        codepoint = src[i + 3] | (src[i + 2] << 8) | (src[i + 1] << 16) | (src[i] << 24)
      }
      offset = writeCodepoint(dst, offset, codepoint, badChar)
    }

    // Keep the trailing bytes that don't complete a code point for the next chunk.
    for (; i < src.length; i++) { overflow.push(src[i]) }

    return dst.slice(0, offset).toString("ucs2")
  }

  /** @returns {void} Trailing incomplete bytes are dropped. */
  end () {
    this.overflow.length = 0
  }
}

/**
 * Writes a code point as UTF-16LE bytes into `dst`, replacing out-of-range values with `badChar`.
 * NOTE: codepoint is read as a signed int32 (from `<< 24`) so it can be negative; that's intentional
 * and handled by the range check.
 * @param {Buffer} dst
 * @param {number} offset
 * @param {number} codepoint
 * @param {number} badChar
 * @returns {number} The new write offset.
 */
function writeCodepoint (dst, offset, codepoint, badChar) {
  if (codepoint < 0 || codepoint > 0x10FFFF) { codepoint = badChar }

  if (codepoint >= 0x10000) {
    // Astral plane: write the high surrogate, then fall through to write the low surrogate.
    codepoint -= 0x10000
    const high = 0xD800 | (codepoint >> 10)
    dst[offset++] = high & 0xff
    dst[offset++] = high >> 8
    codepoint = 0xDC00 | (codepoint & 0x3FF)
  }

  dst[offset++] = codepoint & 0xff
  dst[offset++] = codepoint >> 8
  return offset
}

/**
 * UTF-32 auto codec. The encoder defaults to UTF-32LE and prepends a BOM (override with addBOM: false
 * or defaultEncoding). The decoder picks UTF-32LE vs UTF-32BE from the BOM, falling back to a
 * space/zero heuristic, defaulting to UTF-32LE.
 * Decoder default can be changed: iconv.decode(buf, 'utf32', { defaultEncoding: 'utf-32be' }).
 */
class Utf32Codec {
  createEncoder (options, iconv) {
    options = options || {}
    if (options.addBOM === undefined) { options.addBOM = true }
    return iconv.getEncoder(options.defaultEncoding || "utf-32le", options)
  }

  createDecoder (options, iconv) {
    return new Utf32AutoDecoder(options, iconv)
  }
}

class Utf32AutoDecoder {
  constructor (options, iconv) {
    this.decoder = null
    this.initialBufs = []
    this.initialBufsLen = 0
    this.options = options || {}
    this.iconv = iconv
  }

  write (buf) {
    if (!this.decoder) {
      // Codec not chosen yet: accumulate initial bytes until the heuristic has enough to work with.
      this.initialBufs.push(buf)
      this.initialBufsLen += buf.length
      if (this.initialBufsLen < 32) { return "" }
      return this._chooseDecoder()
    }
    return this.decoder.write(buf)
  }

  end () {
    if (this.decoder) { return this.decoder.end() }
    // Endianness wasn't decided during write() (fewer than 32 bytes): decide and decode the buffered
    // bytes now. A trailing incomplete code point is dropped, like in the LE/BE decoders.
    return this._chooseDecoder()
  }

  _chooseDecoder () {
    const encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding)
    this.decoder = this.iconv.getDecoder(encoding, this.options)
    const res = this.initialBufs.reduce((acc, buf) => acc + this.decoder.write(buf), "")
    this.initialBufs.length = this.initialBufsLen = 0
    return res
  }
}

/**
 * Detects UTF-32 endianness from the leading bytes: a BOM if present, otherwise a heuristic counting
 * how many code units look like valid BMP characters when read as LE vs BE.
 * @param {Array<Buffer|Uint8Array>} bufs
 * @param {string} [defaultEncoding]
 * @returns {string} "utf-32le" or "utf-32be".
 */
function detectEncoding (bufs, defaultEncoding) {
  const b = []
  let charsProcessed = 0
  let invalidLE = 0; let invalidBE = 0 // Code units out of the 0..0x10FFFF range when read LE / BE.
  let bmpCharsLE = 0; let bmpCharsBE = 0 // Code units that look like BMP characters when read LE / BE.

  outerLoop:
  for (let i = 0; i < bufs.length; i++) {
    const buf = bufs[i]
    for (let j = 0; j < buf.length; j++) {
      b.push(buf[j])
      if (b.length === 4) {
        if (charsProcessed === 0) {
          // Check the BOM first.
          if (b[0] === 0xFF && b[1] === 0xFE && b[2] === 0 && b[3] === 0) { return "utf-32le" }
          if (b[0] === 0 && b[1] === 0 && b[2] === 0xFE && b[3] === 0xFF) { return "utf-32be" }
        }

        if (b[0] !== 0 || b[1] > 0x10) { invalidBE++ }
        if (b[3] !== 0 || b[2] > 0x10) { invalidLE++ }
        if (b[0] === 0 && b[1] === 0 && (b[2] !== 0 || b[3] !== 0)) { bmpCharsBE++ }
        if ((b[0] !== 0 || b[1] !== 0) && b[2] === 0 && b[3] === 0) { bmpCharsLE++ }

        b.length = 0
        charsProcessed++
        if (charsProcessed >= 100) { break outerLoop }
      }
    }
  }

  // Decide from the heuristic.
  if (bmpCharsBE - invalidBE > bmpCharsLE - invalidLE) { return "utf-32be" }
  if (bmpCharsBE - invalidBE < bmpCharsLE - invalidLE) { return "utf-32le" }

  // Couldn't decide (likely all zeros or not enough data).
  return defaultEncoding || "utf-32le"
}

exports.utf32le = Utf32LECodec
exports.utf32be = Utf32BECodec
// Aliases.
exports.ucs4le = "utf32le"
exports.ucs4be = "utf32be"

exports.utf32 = Utf32Codec
exports.ucs4 = "utf32"
