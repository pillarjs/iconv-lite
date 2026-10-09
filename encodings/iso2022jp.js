"use strict"

/**
 * ISO-2022-JP codec (RFC 1468), following the WHATWG Encoding Standard.
 *
 * A stateful 7-bit encoding: escape sequences switch between character sets.
 *  - ESC ( B  ASCII
 *  - ESC ( J  JIS X 0201 Roman (ASCII with 0x5C = U+00A5 and 0x7E = U+203E)
 *  - ESC ( I  JIS X 0201 Katakana (halfwidth; decoded only, as in WHATWG)
 *  - ESC $ @  JIS X 0208-1978 and ESC $ B  JIS X 0208-1983 (both decoded with the same table)
 *
 * JIS X 0208 is the 94x94 plane EUC-JP stores at (0xA1-0xFE)x2, so its tables are derived from the
 * EUC-JP codec instead of shipping new data.
 *
 * The one deliberate difference from WHATWG: the encoder shifts back to ASCII before CR and LF (RFC
 * 1468 requires lines to end in ASCII), where WHATWG would stay in the Roman set. Both outputs decode
 * the same.
 *
 * @see https://encoding.spec.whatwg.org/#iso-2022-jp
 * @see https://tools.ietf.org/html/rfc1468
 */

const ESC = 0x1b

// Decoder states (WHATWG "ISO-2022-JP decoder state"). Encoder states reuse ASCII, ROMAN and LEAD
// (the latter standing for the WHATWG "jis0208" encoder state).
const ASCII = 0
const ROMAN = 1
const KATAKANA = 2
const LEAD = 3
const TRAIL = 4
const ESCAPE_START = 5
const ESCAPE = 6

const JIS0208_SIZE = 94 * 94

// The DBCS codec's trie stores a reference to node `i` as NODE_START - i (see dbcs-codec.js).
const DBCS_NODE_START = -1000

/** Max args for one String.fromCharCode.apply() before risking a call-stack overflow. */
const CHARS_CHUNK = 8192

/**
 * Builds a string from the first `length` code units of a Uint16Array, in stack-safe chunks.
 * @param {Uint16Array} units
 * @param {number} length
 * @returns {string}
 */
function charsFromUnits (units, length) {
  let result = ""
  for (let offset = 0; offset < length; offset += CHARS_CHUNK) {
    result += String.fromCharCode.apply(null, units.subarray(offset, Math.min(offset + CHARS_CHUNK, length)))
  }
  return result
}

/** ISO-2022-JP codec. Built once per iconv instance (getCodec caches it). */
class Iso2022JpCodec {
  /**
   * @param {object} codecOptions
   * @param {object} iconv The iconv-lite instance.
   */
  constructor (codecOptions, iconv) {
    // pointer -> code point (0 = unassigned). Pointer is (row * 94 + cell), both 0-based.
    this.decodeTable = new Uint16Array(JIS0208_SIZE)
    // code point -> pointer + 1 (0 = not in JIS X 0208). The first pointer wins, as in WHATWG.
    this.encodeTable = new Uint16Array(0x10000)

    const eucjp = iconv.getCodec("eucjp")
    const root = eucjp.decodeTables[0]
    for (let row = 0; row < 94; row++) {
      const ref = root[0xa1 + row]
      if (ref > DBCS_NODE_START) { continue } // Not a lead byte in EUC-JP.
      const node = eucjp.decodeTables[DBCS_NODE_START - ref]
      for (let cell = 0; cell < 94; cell++) {
        const codePoint = node[0xa1 + cell]
        if (codePoint <= 0 || codePoint > 0xffff) { continue }
        const pointer = row * 94 + cell
        this.decodeTable[pointer] = codePoint
        if (this.encodeTable[codePoint] === 0) { this.encodeTable[codePoint] = pointer + 1 }
      }
    }

    // WHATWG "index ISO-2022-JP katakana": halfwidth -> fullwidth katakana as per NFKC, except that
    // the voiced sound marks map to their spacing forms (U+309B, U+309C).
    this.katakana = new Uint16Array(0xff9f - 0xff61 + 1)
    for (let index = 0; index < this.katakana.length; index++) {
      this.katakana[index] = String.fromCharCode(0xff61 + index).normalize("NFKC").charCodeAt(0)
    }
    this.katakana[0xff9e - 0xff61] = 0x309b
    this.katakana[0xff9f - 0xff61] = 0x309c
  }

  /**
   * @param {object} options
   * @param {object} iconv
   * @returns {Iso2022JpEncoder}
   */
  createEncoder (options, iconv) {
    return new Iso2022JpEncoder(this, iconv)
  }

  /**
   * @param {object} options
   * @param {object} iconv
   * @returns {Iso2022JpDecoder}
   */
  createDecoder (options, iconv) {
    return new Iso2022JpDecoder(this, iconv)
  }

  /** @returns {boolean} */
  get bomAware () { return false }
}

/**
 * ISO-2022-JP encoder: the WHATWG algorithm, stateful across writes. Characters that can't be
 * encoded (and ESC, SO, SI, which would change the decoder's state) become
 * iconv.defaultCharSingleByte, always written in ASCII.
 */
class Iso2022JpEncoder {
  /**
   * @param {Iso2022JpCodec} codec
   * @param {object} iconv
   */
  constructor (codec, iconv) {
    this.encodeTable = codec.encodeTable
    this.katakana = codec.katakana
    this.backend = iconv.backend
    const defaultByte = iconv.defaultCharSingleByte.charCodeAt(0)
    this.defaultByte = defaultByte < 0x80 && defaultByte !== ESC ? defaultByte : 0x3f // '?'
    this.state = ASCII
    this.leadSurrogate = -1
  }

  /**
   * Writes the escape sequence that switches to `state`.
   * @param {Uint8Array} out
   * @param {number} pos
   * @param {number} state ASCII, ROMAN or LEAD.
   * @returns {number} The new write position.
   */
  _shift (out, pos, state) {
    out[pos++] = ESC
    if (state === LEAD) {
      out[pos++] = 0x24 // $
      out[pos++] = 0x42 // B
    } else {
      out[pos++] = 0x28 // (
      out[pos++] = state === ROMAN ? 0x4a /* J */ : 0x42 /* B */
    }
    this.state = state
    return pos
  }

  /**
   * @param {Uint8Array} out
   * @param {number} pos
   * @returns {number}
   */
  _unmappable (out, pos) {
    if (this.state !== ASCII) { pos = this._shift(out, pos, ASCII) }
    out[pos++] = this.defaultByte
    return pos
  }

  /**
   * Encodes one UTF-16 code unit (surrogates are handled by the caller).
   * @param {number} code
   * @param {Uint8Array} out
   * @param {number} pos
   * @returns {number} The new write position.
   */
  _encodeChar (code, out, pos) {
    if (code < 0x80) {
      if (code === 0x0e || code === 0x0f || code === ESC) { return this._unmappable(out, pos) }
      // Roman shares ASCII except "\" and "~". Lines must end in ASCII (RFC 1468).
      if (this.state !== ASCII &&
          !(this.state === ROMAN && code !== 0x5c && code !== 0x7e && code !== 0x0a && code !== 0x0d)) {
        pos = this._shift(out, pos, ASCII)
      }
      out[pos++] = code
      return pos
    }

    if (code === 0xa5 || code === 0x203e) {
      if (this.state !== ROMAN) { pos = this._shift(out, pos, ROMAN) }
      out[pos++] = code === 0xa5 ? 0x5c : 0x7e
      return pos
    }

    if (code === 0x2212) {
      code = 0xff0d
    } else if (code >= 0xff61 && code <= 0xff9f) {
      code = this.katakana[code - 0xff61]
    }

    const pointer = this.encodeTable[code] - 1
    if (pointer < 0) { return this._unmappable(out, pos) }
    if (this.state !== LEAD) { pos = this._shift(out, pos, LEAD) }
    out[pos++] = 0x21 + ((pointer / 94) | 0)
    out[pos++] = 0x21 + (pointer % 94)
    return pos
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    // Worst case per char: a 3-byte escape + 2 bytes; plus a pending surrogate from the last write.
    const out = new Uint8Array(str.length * 5 + 4)
    let pos = 0

    for (let index = 0; index < str.length; index++) {
      const code = str.charCodeAt(index)

      if (this.leadSurrogate !== -1) {
        this.leadSurrogate = -1
        pos = this._unmappable(out, pos) // Nothing outside the BMP is in JIS X 0208.
        if (code >= 0xdc00 && code <= 0xdfff) { continue } // The pair is a single character.
      }
      if (code >= 0xd800 && code <= 0xdbff) {
        this.leadSurrogate = code
        continue
      }

      pos = this._encodeChar(code, out, pos)
    }

    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {Buffer|Uint8Array|undefined} The shift back to ASCII, if needed. */
  end () {
    const out = new Uint8Array(4)
    let pos = 0
    if (this.leadSurrogate !== -1) {
      this.leadSurrogate = -1
      pos = this._unmappable(out, pos)
    }
    if (this.state !== ASCII) { pos = this._shift(out, pos, ASCII) }
    return pos > 0 ? this.backend.bytesToResult(out, pos) : undefined
  }
}

/**
 * ISO-2022-JP decoder: the WHATWG algorithm, one byte at a time. All state lives on the instance,
 * so escape sequences and double-byte characters may be split across chunks. Errors are replaced
 * with iconv.defaultCharUnicode (U+FFFD by default). In particular, two escape sequences with no
 * character between them are an error (a WHATWG rule against hiding content).
 */
class Iso2022JpDecoder {
  /**
   * @param {Iso2022JpCodec} codec
   * @param {object} iconv
   */
  constructor (codec, iconv) {
    this.decodeTable = codec.decodeTable
    this.replacement = iconv.defaultCharUnicode.charCodeAt(0)
    this._reset()
  }

  /** @returns {void} */
  _reset () {
    this.state = ASCII
    this.outputState = ASCII // The state to return to after an escape sequence.
    this.lead = 0 // Lead byte of a JIS X 0208 pair, or the byte after ESC.
    this.output = false // Whether an escape sequence was the last thing seen (WHATWG "output").
    this.reprocess = false // Set when the current byte must be read again in the new state.
  }

  /**
   * Runs the WHATWG decoder handler for one byte.
   * @param {number} byte
   * @param {Uint16Array} out
   * @param {number} pos
   * @returns {number} The new write position.
   */
  _decodeByte (byte, out, pos) {
    switch (this.state) {
      case ASCII:
      case ROMAN:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        if (byte >= 0x80 || byte === 0x0e || byte === 0x0f) {
          out[pos++] = this.replacement
        } else if (this.state === ROMAN && byte === 0x5c) {
          out[pos++] = 0xa5
        } else if (this.state === ROMAN && byte === 0x7e) {
          out[pos++] = 0x203e
        } else {
          out[pos++] = byte
        }
        return pos

      case KATAKANA:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        out[pos++] = byte >= 0x21 && byte <= 0x5f ? 0xff61 - 0x21 + byte : this.replacement
        return pos

      case LEAD:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        if (byte >= 0x21 && byte <= 0x7e) {
          this.lead = byte
          this.state = TRAIL
        } else {
          out[pos++] = this.replacement
        }
        return pos

      case TRAIL:
        if (byte === ESC) { // The output state stays LEAD.
          this.state = ESCAPE_START
          out[pos++] = this.replacement
          return pos
        }
        this.state = LEAD
        if (byte >= 0x21 && byte <= 0x7e) {
          const codePoint = this.decodeTable[(this.lead - 0x21) * 94 + byte - 0x21]
          out[pos++] = codePoint !== 0 ? codePoint : this.replacement
        } else {
          out[pos++] = this.replacement
        }
        return pos

      case ESCAPE_START:
        if (byte === 0x24 || byte === 0x28) { // $ or (
          this.lead = byte
          this.state = ESCAPE
          return pos
        }
        this.reprocess = true
        this.output = false
        this.state = this.outputState
        out[pos++] = this.replacement
        return pos

      default: { // ESCAPE
        const lead = this.lead
        this.lead = 0
        let state = -1
        if (lead === 0x28 && byte === 0x42) { // ( B
          state = ASCII
        } else if (lead === 0x28 && byte === 0x4a) { // ( J
          state = ROMAN
        } else if (lead === 0x28 && byte === 0x49) { // ( I
          state = KATAKANA
        } else if (lead === 0x24 && (byte === 0x40 || byte === 0x42)) { // $ @ or $ B
          state = LEAD
        }

        if (state !== -1) {
          this.state = this.outputState = state
          const output = this.output
          this.output = true
          if (output) { out[pos++] = this.replacement }
          return pos
        }

        // Unknown sequence: an error, then both bytes after ESC are read again in the current set.
        this.output = false
        this.state = this.outputState
        out[pos++] = this.replacement
        pos = this._decodeByte(lead, out, pos) // Never needs reprocessing: lead is "$" or "(".
        this.reprocess = true
        return pos
      }
    }
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    // Each byte yields at most one code unit, plus up to two for an escape sequence that turns out
    // to be invalid (U+FFFD and its re-read lead byte).
    const out = new Uint16Array(buf.length + 2)
    let pos = 0
    for (let index = 0; index < buf.length; index++) {
      pos = this._decodeByte(buf[index], out, pos)
      if (this.reprocess) {
        this.reprocess = false
        index--
      }
    }
    return charsFromUnits(out, pos)
  }

  /** @returns {string|undefined} Replacement chars for a truncated character or escape sequence. */
  end () {
    const out = new Uint16Array(4)
    let pos = 0
    for (;;) { // The WHATWG handler for end-of-queue, until it returns "finished".
      if (this.state === TRAIL) {
        this.state = LEAD
        out[pos++] = this.replacement
      } else if (this.state === ESCAPE_START) {
        this.output = false
        this.state = this.outputState
        out[pos++] = this.replacement
      } else if (this.state === ESCAPE) {
        const lead = this.lead
        this.lead = 0
        this.output = false
        this.state = this.outputState
        out[pos++] = this.replacement
        pos = this._decodeByte(lead, out, pos) // In the LEAD state this moves to TRAIL.
      } else {
        break
      }
    }
    this._reset()
    return pos > 0 ? charsFromUnits(out, pos) : undefined
  }
}

exports.iso2022jp = Iso2022JpCodec
exports.csiso2022jp = "iso2022jp"
