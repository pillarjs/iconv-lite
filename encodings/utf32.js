"use strict"

/**
 * UTF-32LE / UTF-32BE / UTF-32 (auto) codecs.
 *
 * Browser-native: the conversion uses only plain Uint8Array byte I/O, never the Node Buffer (the
 * backend is touched only for the encoder's final "bytes -> result" step, so encoding keeps returning
 * a Buffer in Node, like the utf16 codec). The decoder builds the output string with String.fromCharCode
 * so a lone surrogate still passes through unchanged.
 *
 * NOTE: the behavior is still lenient (surrogate code points pass through, out-of-range code points
 * become the bad-char, trailing incomplete bytes are dropped). Performance and strict conformance come
 * in later steps.
 *
 * @see https://en.wikipedia.org/wiki/UTF-32
 */

/** Max args for one String.fromCharCode.apply() before risking a call-stack overflow. */
const CHARS_CHUNK = 8192

/** UTF-32LE codec. */
class Utf32LECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(iconv.backend, true) }
  createDecoder (options, iconv) { return new Utf32Decoder(true, iconv.defaultCharUnicode.charCodeAt(0)) }
  get bomAware () { return true }
}

/** UTF-32BE codec. */
class Utf32BECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(iconv.backend, false) }
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
  /**
   * @param {object} backend The iconv-lite backend (bytesToResult turns bytes into a Buffer/Uint8Array).
   * @param {boolean} isLE Little-endian when true.
   */
  constructor (backend, isLE) {
    this.backend = backend
    this.isLE = isLE
    this.highSurrogate = 0
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    const length = str.length
    // Worst case is 4 bytes per code unit, plus 4 for a high surrogate held over from a prior write().
    const out = new Uint8Array(length * 4 + 4)
    const isLE = this.isLE
    let pos = 0

    for (let index = 0; index < length; index++) {
      const code = str.charCodeAt(index)
      const isHighSurrogate = code >= 0xD800 && code < 0xDC00
      const isLowSurrogate = code >= 0xDC00 && code < 0xE000

      if (this.highSurrogate) {
        if (isHighSurrogate || !isLowSurrogate) {
          // Two high surrogates in a row, or a high surrogate not followed by a low one: keep the
          // pending high surrogate as a stand-alone (semi-invalid) character.
          pos = writeCodepoint(out, pos, this.highSurrogate, isLE)
        } else {
          // Combine the high and low surrogate into a single 32-bit code point.
          pos = writeCodepoint(out, pos, (((this.highSurrogate - 0xD800) << 10) | (code - 0xDC00)) + 0x10000, isLE)
          this.highSurrogate = 0
          continue
        }
      }

      if (isHighSurrogate) {
        this.highSurrogate = code
      } else {
        // A low surrogate with no preceding high surrogate is also kept as a stand-alone character.
        pos = writeCodepoint(out, pos, code, isLE)
        this.highSurrogate = 0
      }
    }

    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {Buffer|Uint8Array|undefined} A leftover unpaired high surrogate, as a stand-alone character. */
  end () {
    if (!this.highSurrogate) { return }
    const out = new Uint8Array(4)
    writeCodepoint(out, 0, this.highSurrogate, this.isLE)
    this.highSurrogate = 0
    return this.backend.bytesToResult(out, 4)
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
    this.units = new Uint16Array(0) // Decoded code units, reused across writes; grows lazily.
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
    // Each code point yields at most 2 UTF-16 units; +2 of slack covers rounding and a finished overflow.
    const maxUnits = (((overflow.length + src.length) >> 2) + 1) * 2
    if (this.units.length < maxUnits) { this.units = new Uint16Array(maxUnits) }
    const units = this.units
    let pos = 0
    let codepoint = 0
    let i = 0

    // Finish a code point that was split across the previous chunk boundary.
    if (overflow.length > 0) {
      for (; i < src.length && overflow.length < 4; i++) { overflow.push(src[i]) }
      if (overflow.length === 4) {
        codepoint = readCodepoint(overflow, 0, isLE)
        overflow.length = 0
        pos = pushCodepoint(units, pos, codepoint, badChar)
      }
    }

    // Main loop.
    for (; i < src.length - 3; i += 4) {
      codepoint = readCodepoint(src, i, isLE)
      pos = pushCodepoint(units, pos, codepoint, badChar)
    }

    // Keep the trailing bytes that don't complete a code point for the next chunk.
    for (; i < src.length; i++) { overflow.push(src[i]) }

    return stringFromUnits(units, pos)
  }

  /** @returns {void} Trailing incomplete bytes are dropped. */
  end () {
    this.overflow.length = 0
  }
}

/**
 * Writes a code point as 4 bytes in the given endianness.
 * @param {Uint8Array} out
 * @param {number} pos Current write position.
 * @param {number} codepoint A value in 0..0x10FFFF.
 * @param {boolean} isLE Little-endian when true.
 * @returns {number} The new write position.
 */
function writeCodepoint (out, pos, codepoint, isLE) {
  if (isLE) {
    out[pos++] = codepoint & 0xff
    out[pos++] = (codepoint >> 8) & 0xff
    out[pos++] = (codepoint >> 16) & 0xff
    out[pos++] = (codepoint >> 24) & 0xff
  } else {
    out[pos++] = (codepoint >> 24) & 0xff
    out[pos++] = (codepoint >> 16) & 0xff
    out[pos++] = (codepoint >> 8) & 0xff
    out[pos++] = codepoint & 0xff
  }
  return pos
}

/**
 * Reads a 4-byte code point from a byte source in the given endianness.
 * NOTE: the high byte uses `<< 24`, so the result is read as a signed int32 and can be negative; the
 * range check in pushCodepoint() treats negatives as out of range.
 * @param {Uint8Array|number[]} src
 * @param {number} pos
 * @param {boolean} isLE
 * @returns {number}
 */
function readCodepoint (src, pos, isLE) {
  if (isLE) {
    return src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24)
  }
  return src[pos + 3] | (src[pos + 2] << 8) | (src[pos + 1] << 16) | (src[pos] << 24)
}

/**
 * Appends one decoded code point to the code-unit buffer, replacing out-of-range values with `badChar`.
 * @param {Uint16Array} units
 * @param {number} pos Current code-unit write position.
 * @param {number} codepoint
 * @param {number} badChar
 * @returns {number} The new code-unit write position.
 */
function pushCodepoint (units, pos, codepoint, badChar) {
  if (codepoint < 0 || codepoint > 0x10FFFF) { codepoint = badChar }

  if (codepoint > 0xFFFF) {
    // Astral plane: split into a surrogate pair.
    const offset = codepoint - 0x10000
    units[pos++] = 0xD800 | (offset >> 10)
    units[pos++] = 0xDC00 | (offset & 0x3FF)
  } else {
    units[pos++] = codepoint
  }
  return pos
}

/**
 * Builds a string from the first `length` UTF-16 code units of a Uint16Array. Uses String.fromCharCode
 * (not TextDecoder) so a lone surrogate passes through as its own code unit.
 * @param {Uint16Array} units
 * @param {number} length Number of valid code units in `units`.
 * @returns {string}
 */
function stringFromUnits (units, length) {
  let result = ""
  for (let offset = 0; offset < length; offset += CHARS_CHUNK) {
    result += String.fromCharCode.apply(null, units.subarray(offset, Math.min(offset + CHARS_CHUNK, length)))
  }
  return result
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
