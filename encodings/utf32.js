"use strict"

/**
 * UTF-32LE / UTF-32BE / UTF-32 (auto) codecs.
 *
 * Browser-native: the conversion uses only plain Uint8Array byte I/O, never the Node Buffer (the
 * backend is touched only for the encoder's final "bytes -> result" step, so encoding keeps returning
 * a Buffer in Node, like the utf16 codec). There is no TextDecoder for UTF-32 (the WHATWG Encoding
 * Standard dropped it), so the code unit <-> UTF-16 conversion is done by hand here.
 *
 * Unlike UTF-8 (RFC 3629) and UTF-16 (RFC 2781), UTF-32 has no dedicated IETF RFC. It is defined by
 * The Unicode Standard, Chapter 3: the encoding form in Section 3.9 (definition D90, each Unicode
 * scalar value <-> one 32-bit code unit) and the byte-order serialization in Section 3.10 (D99 UTF-32,
 * D100 UTF-32BE, D101 UTF-32LE); also ISO/IEC 10646 (UCS-4). (The former UAX #19 has been retired into
 * the core standard.) Conformance: a UTF-32 code unit must be a Unicode scalar value (definition D76),
 * i.e. 0..0x10FFFF EXCLUDING the surrogate range 0xD800..0xDFFF (surrogate code points are not scalar
 * values, so they cannot appear in UTF-32). On decode, any other value - a surrogate code point, a
 * value above 0x10FFFF, or a truncated trailing code unit - is replaced with the bad-char (U+FFFD by
 * default), or throws with { fatal: true }. On encode, a lone (unpaired) surrogate in the input is
 * replaced with U+FFFD so the output is always well-formed UTF-32.
 *
 * @see https://www.unicode.org/versions/latest/core-spec/chapter-3/ (The Unicode Standard, ch. 3: Sections 3.9 and 3.10)
 * @see https://unicode.org/faq/utf_bom#utf32-7
 */

/** Unicode replacement character, emitted by the encoder for ill-formed input. */
const REPLACEMENT = 0xFFFD

/** Max args for one String.fromCharCode.apply() before risking a call-stack overflow. */
const CHARS_CHUNK = 8192
/** Above this many UTF-16 code units, the native TextDecoder beats fromCharCode; below it the setup costs more. */
const TEXT_DECODER_MIN_UNITS = 64
/**
 * Decodes the code-unit buffer to a string. The decoder only puts well-formed UTF-16 here (BMP units
 * and proper surrogate pairs, never a lone surrogate), so this native decode is safe. Viewing the
 * Uint16Array as little-endian bytes assumes a little-endian platform, which iconv-lite already does.
 * @type {TextDecoder}
 */
const utf16leDecoder = new TextDecoder("utf-16le", { ignoreBOM: true })

/** UTF-32LE codec. */
class Utf32LECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(iconv.backend, true) }
  createDecoder (options, iconv) { return new Utf32Decoder(true, iconv.defaultCharUnicode.charCodeAt(0), !!(options && options.fatal)) }
  get bomAware () { return true }
}

/** UTF-32BE codec. */
class Utf32BECodec {
  createEncoder (options, iconv) { return new Utf32Encoder(iconv.backend, false) }
  createDecoder (options, iconv) { return new Utf32Decoder(false, iconv.defaultCharUnicode.charCodeAt(0), !!(options && options.fatal)) }
  get bomAware () { return true }
}

/**
 * UTF-32 encoder. Applies the UTF-32 encoding form (Unicode Standard, Section 3.9, definition D90:
 * each Unicode scalar value -> one 32-bit code unit). The input is UTF-16, so per code unit:
 *  1. A high surrogate followed by a low surrogate is combined into its supplementary scalar value.
 *  2. A lone (unpaired) surrogate is not a scalar value (definition D76), so it is replaced with
 *     U+FFFD, keeping the output well-formed UTF-32.
 *  3. Any other code unit is already a scalar value and is written unchanged.
 * Each scalar value is written as one 32-bit code unit (little-endian; big-endian is byte-swapped at
 * the end). Stateful across writes: a high surrogate at the end of one write() is held for the next.
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
    // Worst case is one code point per code unit, plus one for a high surrogate held over from a
    // prior write(). The Uint32Array view writes each code point in one store (native little-endian);
    // BE output is byte-swapped afterwards.
    const out = new Uint8Array(length * 4 + 4)
    const codepoints = new Uint32Array(out.buffer)
    let pos = 0 // code-point count

    for (let index = 0; index < length; index++) {
      const code = str.charCodeAt(index)

      if (this.highSurrogate !== 0) {
        if (code >= 0xDC00 && code <= 0xDFFF) {
          // Step 1: combine the high + low surrogate into its supplementary scalar value.
          codepoints[pos++] = (((this.highSurrogate - 0xD800) << 10) | (code - 0xDC00)) + 0x10000
          this.highSurrogate = 0
          continue
        }
        // Step 2: the held high surrogate is unpaired -> U+FFFD, then handle the current unit below.
        codepoints[pos++] = REPLACEMENT
        this.highSurrogate = 0
      }

      if (code >= 0xD800 && code <= 0xDBFF) {
        this.highSurrogate = code // High surrogate: hold for the next unit (its low half, step 1).
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        codepoints[pos++] = REPLACEMENT // Step 2: unpaired low surrogate.
      } else {
        codepoints[pos++] = code // Step 3: a BMP scalar value, written as-is.
      }
    }

    const byteLength = pos * 4
    if (!this.isLE) { swap32(out, byteLength) }
    return this.backend.bytesToResult(out, byteLength)
  }

  /** @returns {Buffer|Uint8Array|undefined} U+FFFD for a high surrogate left unpaired at end of input. */
  end () {
    if (this.highSurrogate === 0) { return }
    const out = new Uint8Array(4)
    new Uint32Array(out.buffer)[0] = REPLACEMENT
    if (!this.isLE) { swap32(out, 4) }
    this.highSurrogate = 0
    return this.backend.bytesToResult(out, 4)
  }
}

/**
 * UTF-32 decoder. Inverts the UTF-32 encoding form (Unicode Standard, Section 3.9, definition D90).
 * Per 32-bit code unit:
 *  1. Read its numeric value.
 *  2. Validate it is a Unicode scalar value (definition D76: 0..D7FF or E000..10FFFF). A surrogate
 *     code point (D800..DFFF) or a value above 0x10FFFF is ill-formed -> replaced with the bad-char
 *     (U+FFFD by default), or throws when `fatal`. A code unit truncated at end of input is treated
 *     the same way.
 *  3. Emit the scalar value as UTF-16 (a surrogate pair for supplementary code points).
 * Streaming: a code unit split across a chunk boundary is buffered (`overflow`) and finished on the
 * next write.
 */
class Utf32Decoder {
  /**
   * @param {boolean} isLE Little-endian when true.
   * @param {number} badChar Code unit emitted for ill-formed input.
   * @param {boolean} fatal Throw on ill-formed input instead of emitting the bad-char.
   */
  constructor (isLE, badChar, fatal) {
    this.isLE = isLE
    this.badChar = badChar
    this.fatal = fatal
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
    const fatal = this.fatal
    // Each code point yields at most 2 UTF-16 units; +2 of slack covers rounding and a finished overflow.
    const maxUnits = (((overflow.length + src.length) >> 2) + 1) * 2
    if (this.units.length < maxUnits) { this.units = new Uint16Array(maxUnits) }
    const units = this.units
    let pos = 0
    let i = 0

    // Finish a code point that was split across the previous chunk boundary.
    if (overflow.length > 0) {
      for (; i < src.length && overflow.length < 4; i++) { overflow.push(src[i]) }
      if (overflow.length === 4) {
        pos = pushCodepoint(units, pos, readCodepoint(overflow, 0, isLE), badChar, fatal)
        overflow.length = 0
      }
    }

    // Main loop. For little-endian, view the aligned input as code points directly (one read each)
    // instead of assembling them byte by byte; fall back to byte reads for big-endian or unaligned input.
    const count = (src.length - i) >> 2
    if (isLE && count > 0 && (src.byteOffset + i) % 4 === 0) {
      const codepoints = new Uint32Array(src.buffer, src.byteOffset + i, count)
      for (let k = 0; k < count; k++) {
        pos = pushCodepoint(units, pos, codepoints[k], badChar, fatal)
      }
      i += count * 4
    } else {
      for (; i < src.length - 3; i += 4) {
        pos = pushCodepoint(units, pos, readCodepoint(src, i, isLE), badChar, fatal)
      }
    }

    // Keep the trailing bytes that don't complete a code point for the next chunk.
    for (; i < src.length; i++) { overflow.push(src[i]) }

    return stringFromUnits(units, pos)
  }

  /** @returns {string|undefined} U+FFFD for a code point left truncated at end of input (or throws when fatal). */
  end () {
    if (this.overflow.length === 0) { return }
    this.overflow.length = 0
    if (this.fatal) { throw new Error("Truncated UTF-32 code unit at end of input") }
    return String.fromCharCode(this.badChar)
  }
}

/**
 * Reverses the byte order of each 4-byte group in `out[0, byteLength)` in place. The encoder builds
 * code points as native little-endian (via a Uint32Array view); this turns them into big-endian.
 * @param {Uint8Array} out
 * @param {number} byteLength A multiple of 4.
 */
function swap32 (out, byteLength) {
  for (let pos = 0; pos < byteLength; pos += 4) {
    const b0 = out[pos]; const b1 = out[pos + 1]
    out[pos] = out[pos + 3]
    out[pos + 1] = out[pos + 2]
    out[pos + 2] = b1
    out[pos + 3] = b0
  }
}

/**
 * Reads a 4-byte code point (unsigned, 0..0xFFFFFFFF) from a byte source in the given endianness. The
 * high byte is added with `* 0x1000000` rather than `<< 24` to avoid the signed-int32 wrap of `|`.
 * @param {Uint8Array|number[]} src
 * @param {number} pos
 * @param {boolean} isLE
 * @returns {number}
 */
function readCodepoint (src, pos, isLE) {
  if (isLE) {
    return (src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16)) + src[pos + 3] * 0x1000000
  }
  return (src[pos + 3] | (src[pos + 2] << 8) | (src[pos + 1] << 16)) + src[pos] * 0x1000000
}

/**
 * Decode steps 2 and 3: validate one code point as a Unicode scalar value (definition D76) and append
 * its UTF-16 form. A surrogate code point (D800..DFFF) or a value above 0x10FFFF is not a scalar value,
 * so it becomes `badChar`, or throws when `fatal`. (Code points are read unsigned, so a value with the
 * high bit set is just > 0x10FFFF.)
 * @param {Uint16Array} units
 * @param {number} pos Current code-unit write position.
 * @param {number} codepoint An unsigned value in 0..0xFFFFFFFF.
 * @param {number} badChar
 * @param {boolean} fatal
 * @returns {number} The new code-unit write position.
 */
function pushCodepoint (units, pos, codepoint, badChar, fatal) {
  // Step 3 fast path: a BMP scalar value below the surrogate range (the common case for real text).
  if (codepoint < 0xD800) {
    units[pos++] = codepoint
    return pos
  }

  // Step 2: reject non-scalar values. Past the check above, codepoint >= 0xD800, so codepoint <= 0xDFFF
  // means a surrogate code point; codepoint > 0x10FFFF is out of range.
  if (codepoint > 0x10FFFF || codepoint <= 0xDFFF) {
    if (fatal) { throw new Error("Invalid UTF-32 code unit: 0x" + codepoint.toString(16)) }
    units[pos++] = badChar
    return pos
  }

  // Step 3: emit the remaining scalar values (E000..10FFFF) as UTF-16.
  if (codepoint > 0xFFFF) {
    // Supplementary code point -> surrogate pair.
    const offset = codepoint - 0x10000
    units[pos++] = 0xD800 | (offset >> 10)
    units[pos++] = 0xDC00 | (offset & 0x3FF)
  } else {
    units[pos++] = codepoint
  }
  return pos
}

/**
 * Builds a string from the first `length` UTF-16 code units of a Uint16Array.
 * @param {Uint16Array} units
 * @param {number} length Number of valid code units in `units`.
 * @returns {string}
 */
function stringFromUnits (units, length) {
  if (length >= TEXT_DECODER_MIN_UNITS) {
    return utf16leDecoder.decode(new Uint8Array(units.buffer, units.byteOffset, length * 2))
  }
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
    // bytes now, then flush any trailing replacement char from the chosen decoder.
    const res = this._chooseDecoder()
    const trail = this.decoder.end()
    return trail ? res + trail : res
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
