"use strict"

/**
 * UTF-7 (RFC 2152) and UTF-7-IMAP / Modified UTF-7 (RFC 3501) codecs.
 *
 * Both codecs are self-contained: they don't go through the iconv-lite backend for the actual
 * conversion, only native APIs shared by Node and browsers. Encoding uses a small hand-rolled bit
 * accumulator for the Base64 (no Buffer); decoding hands each Base64 run to atob() and turns direct
 * runs into substrings via TextDecoder. The only backend touch left is the encoder's final
 * "bytes -> result" step, so that encoding keeps returning a Buffer in Node (like the utf16 codec).
 *
 * @see https://tools.ietf.org/html/rfc2152
 * @see http://tools.ietf.org/html/rfc3501#section-5.1.3
 */

const PLUS = 0x2b // '+'
const MINUS = 0x2d // '-'
const AMP = 0x26 // '&'

/** Standard Base64 alphabet. @type {string} */
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
/** UTF-7-IMAP Base64 alphabet (uses ',' instead of '/'). @type {string} */
const BASE64_IMAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,"

/**
 * Builds the encode table: Base64 value (0..63) -> output byte (ASCII code of the Base64 char).
 * @param {string} alphabet The 64-char Base64 alphabet.
 * @returns {Uint8Array}
 */
function buildBytes (alphabet) {
  const bytes = new Uint8Array(64)
  for (let value = 0; value < 64; value++) { bytes[value] = alphabet.charCodeAt(value) }
  return bytes
}

/**
 * Builds the decode table: input byte -> Base64 value (0..63), or -1 if the byte is not Base64.
 * @param {string} alphabet The 64-char Base64 alphabet.
 * @returns {Int8Array}
 */
function buildInv (alphabet) {
  const inv = new Int8Array(256).fill(-1)
  for (let value = 0; value < alphabet.length; value++) { inv[alphabet.charCodeAt(value)] = value }
  return inv
}

const BASE64_BYTES = buildBytes(BASE64)
const BASE64_IMAP_BYTES = buildBytes(BASE64_IMAP)

const INV = buildInv(BASE64)
const INV_IMAP = buildInv(BASE64_IMAP)
// UTF-7-IMAP decoding is forgiving and also accepts a literal '/' as value 63.
INV_IMAP["/".charCodeAt(0)] = 63

/**
 * Lookup (indexed by char code < 128) of the chars UTF-7 represents directly (un-encoded), per
 * RFC 2152: Set D (mandatory), Set O (optional but allowed direct), and whitespace (SP, TAB, CR,
 * LF). Everything else is shifted into Base64: '+' (the shift char), '\', '~', and all non-ASCII.
 * @type {Uint8Array}
 */
const UTF7_DIRECT = new Uint8Array(128)
const UTF7_DIRECT_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" + // letters + digits (Set D)
  "'(),-./:?" + // Set D punctuation
  "!\"#$%&*;<=>@[]^_`{|}" + // Set O (optional direct)
  " \t\n\r" // whitespace
for (let index = 0; index < UTF7_DIRECT_CHARS.length; index++) {
  UTF7_DIRECT[UTF7_DIRECT_CHARS.charCodeAt(index)] = 1
}

/**
 * Whether `code` is a UTF-7 direct char (copied verbatim rather than Base64-encoded).
 * @param {number} code A UTF-16 code unit.
 * @returns {boolean}
 */
function utf7IsDirect (code) {
  return code < 128 && UTF7_DIRECT[code] === 1
}

/**
 * Regex matching the first non-direct char, derived from the same set so there's no second source
 * of truth. Used by the encoder to skip over direct runs in one native (C++) scan instead of a
 * per-char JS loop. The class metacharacters ] \ ^ - are escaped for use inside [^...].
 * @type {RegExp}
 */
const UTF7_NONDIRECT = new RegExp("[^" + UTF7_DIRECT_CHARS.replace(/[\]\\^-]/g, "\\$&") + "]", "g")

/**
 * Shared single-byte TextDecoder used to view the input as one char per byte. (The WHATWG "latin1"
 * label is windows-1252, single-byte; ASCII bytes < 0x80 decode 1:1, which is all the parser relies
 * on: direct runs are ASCII substrings, and Base64 runs are ASCII handed to atob().)
 * @type {TextDecoder}
 */
const latin1Decoder = new TextDecoder("latin1")

/**
 * Turns decoded UTF-16 code units (held in a Uint16Array, native little-endian) into a string in one
 * native call. Only used for runs with no surrogate (where it equals the verbatim conversion), since
 * it would otherwise replace a lone surrogate with U+FFFD instead of passing it through.
 * @type {TextDecoder}
 */
const utf16leDecoder = new TextDecoder("utf-16le", { ignoreBOM: true })
/** Above this many code units the native TextDecoder beats fromCharCode; below it the per-call setup costs more. */
const TEXT_DECODER_MIN_UNITS = 64

/**
 * Decodes UTF-16BE bytes (no surrogate normalization issues since the caller only routes
 * surrogate-free runs here). Paired with Uint8Array.fromBase64 it does base64 -> bytes -> string
 * entirely natively, with no per-code-unit JS loop.
 * @type {TextDecoder}
 */
const utf16beDecoder = new TextDecoder("utf-16be", { ignoreBOM: true })
/** Whether the runtime has Uint8Array.fromBase64 (Node 25+, modern browsers). */
const HAS_FROM_BASE64 = typeof Uint8Array.fromBase64 === "function"
/** Above this many code units the native fromBase64 + utf-16be path (no JS pairs loop) beats atob. */
const FROM_BASE64_MIN_UNITS = 128

/** Matches any non-ASCII char (a byte >= 0x80): invalid while unshifted, so replaced with U+FFFD. @type {RegExp} */
const NON_ASCII = /[\u0080-\uffff]/g

/** Max args for one String.fromCharCode.apply() before risking a call-stack overflow. */
const CHARS_CHUNK = 8192

/**
 * Builds a string from the first `length` code units of a Uint16Array, in stack-safe chunks.
 * @param {Uint16Array} units
 * @param {number} length Number of valid code units in `units`.
 * @returns {string}
 */
function charsFromUnits (units, length) {
  let result = ""
  for (let offset = 0; offset < length; offset += CHARS_CHUNK) {
    result += String.fromCharCode.apply(null, units.subarray(offset, Math.min(offset + CHARS_CHUNK, length)))
  }
  return result
}

/** Shared TextEncoder to bulk-copy long direct (ASCII) runs into the output in one native call. @type {TextEncoder} */
const asciiEncoder = new TextEncoder()
/** Below this run length, a per-char copy is cheaper than the slice()+encodeInto() setup. */
const DIRECT_BULK_MIN = 16

/**
 * Emits the final partial Base64 sextet (the leftover < 6 bits, zero-padded).
 * @param {Uint8Array} out Output buffer.
 * @param {number} pos Current write position.
 * @param {number} bits Bit accumulator.
 * @param {number} nbits Number of valid bits in the accumulator.
 * @param {Uint8Array} bytes Base64 value -> byte table.
 * @returns {number} The new write position.
 */
function flushBase64Tail (out, pos, bits, nbits, bytes) {
  if (nbits > 0) { out[pos++] = bytes[(bits << (6 - nbits)) & 0x3f] }
  return pos
}

/**
 * Copies the direct-char run str[from, to) into `out` verbatim. Long runs go through TextEncoder in
 * one native call; short ones are cheaper to copy char by char.
 * @param {string} str
 * @param {number} from Inclusive start index.
 * @param {number} to Exclusive end index.
 * @param {Uint8Array} out Output buffer.
 * @param {number} pos Current write position.
 * @returns {number} The new write position.
 */
function copyDirectRun (str, from, to, out, pos) {
  if (to - from >= DIRECT_BULK_MIN) {
    // Avoid an extra substring copy when the whole string is one direct run (common for ASCII).
    const source = (from === 0 && to === str.length) ? str : str.slice(from, to)
    return pos + asciiEncoder.encodeInto(source, out.subarray(pos)).written
  }
  for (let index = from; index < to; index++) { out[pos++] = str.charCodeAt(index) }
  return pos
}

/**
 * Encodes the non-direct run str[from, to) as "+<base64>-" (UTF-16BE -> modified Base64).
 * @param {string} str
 * @param {number} from Inclusive start index.
 * @param {number} to Exclusive end index.
 * @param {Uint8Array} out Output buffer.
 * @param {number} pos Current write position.
 * @param {Uint8Array} bytes Base64 value -> byte table.
 * @returns {number} The new write position.
 */
function encodeBase64Run (str, from, to, out, pos, bytes) {
  out[pos++] = PLUS
  let bits = 0
  let nbits = 0
  for (let index = from; index < to; index++) {
    bits = (bits << 16) | str.charCodeAt(index)
    nbits += 16
    while (nbits >= 6) {
      nbits -= 6
      out[pos++] = bytes[(bits >> nbits) & 0x3f]
      bits &= (1 << nbits) - 1
    }
  }
  pos = flushBase64Tail(out, pos, bits, nbits, bytes)
  out[pos++] = MINUS
  return pos
}

/** UTF-7 codec (RFC 2152). */
class Utf7Codec {
  /**
   * @param {object} options
   * @param {object} iconv The iconv-lite instance (provides `backend`).
   * @returns {Utf7Encoder}
   */
  createEncoder (options, iconv) {
    return new Utf7Encoder(iconv.backend)
  }

  /**
   * @param {object} options
   * @param {object} iconv
   * @returns {Utf7Decoder}
   */
  createDecoder (options, iconv) {
    return new Utf7Decoder(PLUS, "+", INV, false)
  }

  /** @returns {boolean} */
  get bomAware () { return true }
}

/**
 * UTF-7-IMAP / Modified UTF-7 codec (RFC 3501). Differences from plain UTF-7:
 *  - Base64 part is started by "&" instead of "+".
 *  - Direct characters are 0x20-0x7E, except "&" (0x26).
 *  - In Base64, "," is used instead of "/".
 *  - Base64 must not be used to represent direct characters.
 *  - No implicit shift back from Base64 (always ends with '-').
 */
class Utf7IMAPCodec {
  /**
   * @param {object} options
   * @param {object} iconv
   * @returns {Utf7IMAPEncoder}
   */
  createEncoder (options, iconv) {
    return new Utf7IMAPEncoder(iconv.backend)
  }

  /**
   * @param {object} options
   * @param {object} iconv
   * @returns {Utf7Decoder}
   */
  createDecoder (options, iconv) {
    return new Utf7Decoder(AMP, "&", INV_IMAP, true)
  }

  /** @returns {boolean} */
  get bomAware () { return true }
}

/**
 * UTF-7 encoder. The steps follow the three rules in RFC 2152, section "UTF-7 Definition".
 * Stateless per write(): every run shifts in and out within the same call. Walks the input one
 * maximal run at a time:
 *  1. A run of direct chars is copied through verbatim as ASCII -- Set D and (optionally) Set O
 *     per Rule 1, plus space/tab/CR/LF per Rule 3.
 *  2. A lone "+" is emitted as "+-" (Rule 2: the "+-" sequence encodes a literal '+').
 *  3. A run of non-direct chars is shifted in with "+", emitted as the Modified Base64 of the
 *     chars' UTF-16BE bytes (Rule 2: 16-bit quantities -> octets, most significant first), then
 *     shifted out with "-" (which a decoder absorbs).
 *
 * e.g. "A" + "≢Α" + "." -> "A" + "+ImIDkQ-" + "."  ==  "A+ImIDkQ-."
 */
class Utf7Encoder {
  /** @param {object} backend The iconv-lite backend (its bytesToResult turns bytes into a Buffer/Uint8Array). */
  constructor (backend) {
    this.backend = backend
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array} The UTF-7 bytes.
   */
  write (str) {
    const length = str.length
    const out = new Uint8Array(length * 5 + 10)
    let pos = 0
    let cursor = 0

    while (cursor < length) {
      // Step 1 (RFC 2152, Rule 1 & Rule 3): copy the maximal run of direct chars verbatim. The run
      // end is found with one native regex scan.
      const directStart = cursor
      UTF7_NONDIRECT.lastIndex = cursor
      const match = UTF7_NONDIRECT.exec(str)
      cursor = match ? match.index : length
      pos = copyDirectRun(str, directStart, cursor, out, pos)
      if (cursor >= length) { break }

      const code = str.charCodeAt(cursor)
      if (code === PLUS && (cursor + 1 >= length || utf7IsDirect(str.charCodeAt(cursor + 1)))) {
        // Step 2 (RFC 2152, Rule 2): a lone "+" is encoded as "+-".
        out[pos++] = PLUS
        out[pos++] = MINUS
        cursor++
        continue
      }

      // Step 3 (RFC 2152, Rule 2): shift the maximal run of non-direct chars into "+<base64>-".
      let runEnd = cursor + 1
      while (runEnd < length && !utf7IsDirect(str.charCodeAt(runEnd))) { runEnd++ }
      pos = encodeBase64Run(str, cursor, runEnd, out, pos, BASE64_BYTES)
      cursor = runEnd
    }

    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {void} */
  end () {}
}

/**
 * UTF-7-IMAP / Modified UTF-7 encoder. The steps follow RFC 3501, section 5.1.3 ("Mailbox
 * International Naming Convention"). Stateful across writes: keeps the Base64 bit accumulator open
 * until a direct char or end(). Per character:
 *  1. A printable US-ASCII char except "&" (octets 0x20-0x25 and 0x27-0x7e) represents itself.
 *  2. "&" (0x26) is emitted as "&-".
 *  3. Any other char (0x00-0x1f and 0x7f-0xff) is shifted in with "&" and accumulated as Modified
 *     Base64 of its UTF-16BE bytes, with "," used instead of "/"; the run is closed with "-" at the
 *     next direct char or at end().
 */
class Utf7IMAPEncoder {
  /** @param {object} backend */
  constructor (backend) {
    this.backend = backend
    this.inBase64 = false
    this.bits = 0
    this.nbits = 0
  }

  /**
   * Closes an open Base64 run: flush the leftover bits, write the shift-out '-', reset state.
   * @param {Uint8Array} out
   * @param {number} pos
   * @returns {number} The new write position.
   */
  _closeBase64 (out, pos) {
    pos = flushBase64Tail(out, pos, this.bits, this.nbits, BASE64_IMAP_BYTES)
    out[pos++] = MINUS
    this.inBase64 = false
    this.bits = 0
    this.nbits = 0
    return pos
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    const out = new Uint8Array(str.length * 5 + 10)
    let pos = 0

    for (let cursor = 0; cursor < str.length; cursor++) {
      const code = str.charCodeAt(cursor)

      if (code >= 0x20 && code <= 0x7e) { // Printable US-ASCII (RFC 3501 5.1.3): direct, or '&'.
        if (this.inBase64) { pos = this._closeBase64(out, pos) }
        out[pos++] = code
        if (code === AMP) { out[pos++] = MINUS } // Step 2: "&" (0x26) -> "&-".
      } else { // Step 3 (RFC 3501 5.1.3): other chars (0x00-0x1f, 0x7f-0xff) -> "&"-shifted Base64.
        if (!this.inBase64) {
          out[pos++] = AMP // Shift into Base64.
          this.inBase64 = true
        }
        this.bits = (this.bits << 16) | code
        this.nbits += 16
        while (this.nbits >= 6) {
          this.nbits -= 6
          out[pos++] = BASE64_IMAP_BYTES[(this.bits >> this.nbits) & 0x3f]
          this.bits &= (1 << this.nbits) - 1
        }
      }
    }

    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {Buffer|Uint8Array} Any trailing shift-out bytes from an open Base64 run. */
  end () {
    const out = new Uint8Array(2)
    const pos = this.inBase64 ? this._closeBase64(out, 0) : 0
    return this.backend.bytesToResult(out, pos)
  }
}

/**
 * UTF-7 / UTF-7-IMAP decoder. The steps invert RFC 2152, Rule 2 (and Rule 1/3 for direct chars);
 * for UTF-7-IMAP the equivalent rules are in RFC 3501, section 5.1.3. It runs in two alternating
 * modes:
 *  1. Direct mode: copy ASCII bytes through verbatim until the shift-in byte ("+" or "&").
 *     (RFC 2152 Rule 1 & Rule 3 / RFC 3501 5.1.3: those chars represent themselves.)
 *  2. "+-" / "&-" decodes to a literal "+" / "&". (RFC 2152 Rule 2: the "+-" sequence.)
 *  3. Otherwise the shift-in enters Base64 mode: read Modified Base64 chars until a non-Base64 byte
 *     (the terminator), then decode them (Base64 -> UTF-16BE bytes -> UTF-16 code units, the inverse
 *     of Rule 2's "16-bit quantities -> octets, most significant first").
 *  4. A trailing "-" is absorbed; any other terminator is re-read in direct mode (step 1).
 *     (RFC 2152 Rule 2: the closing "-" "is absorbed".)
 *
 * Implementation: each write() views the input bytes as a "latin1" string (1 char per byte) and
 * scans them natively: direct runs become plain substrings, and Base64 runs go through atob() in
 * bulk. Streaming-aware: a Base64 run split across chunks flushes its aligned prefix and carries
 * only the < 8-char tail, so memory stays bounded.
 *
 * Conformance (RFC 2152): only ASCII is valid in direct mode, and a Base64 run must end on a 16-bit
 * boundary with zero padding bits. Ill-formed input is replaced with U+FFFD: a non-ASCII byte while
 * unshifted, an incomplete code unit, or non-zero trailing bits.
 */
class Utf7Decoder {
  /**
   * @param {number} shiftIn Byte that starts a Base64 run ('+' or '&').
   * @param {string} literal The same char, for the "+-"/"&-" -> literal case.
   * @param {Int8Array} inv Base64 byte -> value table; also tells a Base64 byte from a terminator (-1).
   * @param {boolean} imap Whether this is UTF-7-IMAP (',' maps back to '/' for atob()).
   */
  constructor (shiftIn, literal, inv, imap) {
    this.shiftIn = shiftIn
    this.literal = literal
    this.inv = inv
    this.imap = imap

    this.inBase64 = false
    this.pending = "" // Unflushed Base64 chars of a run open from a previous chunk (kept < 8).
    this.sawBase64 = false // Whether the current run has had any Base64 char (vs the "+-" literal).
    this.units = new Uint16Array(0) // Decoded code units, reused across runs; grows lazily.
  }

  /**
   * Decodes a Base64 string (Base64 alphabet only) to its UTF-16BE code units. No validation: bytes
   * are paired into code units verbatim (a lone surrogate passes through), and invalid Base64
   * (length % 4 === 1) yields "" (the caller flags that as ill-formed).
   * @param {string} base64
   * @returns {string}
   */
  _decodeBase64 (base64) {
    const std = this.imap ? base64.replace(/,/g, "/") : base64

    // Fast path (Node 25+/modern browsers): for long runs, decode base64 -> bytes -> string entirely
    // natively. A surrogate (high byte 0xD8-0xDF) must pass through verbatim, which TextDecoder won't
    // do, so scan for one and pair the bytes by hand only when present.
    if (HAS_FROM_BASE64 && ((std.length * 3) >> 3) >= FROM_BASE64_MIN_UNITS) {
      let bytes
      try {
        bytes = Uint8Array.fromBase64(std, { lastChunkHandling: "loose" })
      } catch {
        return ""
      }
      const unitCount = bytes.length >> 1
      let hasSurrogate = false
      for (let bytePos = 0; bytePos < unitCount * 2; bytePos += 2) {
        if (bytes[bytePos] >= 0xd8 && bytes[bytePos] <= 0xdf) { hasSurrogate = true; break }
      }
      if (!hasSurrogate) {
        return utf16beDecoder.decode(bytes.length === unitCount * 2 ? bytes : bytes.subarray(0, unitCount * 2))
      }
      if (this.units.length < unitCount) { this.units = new Uint16Array(unitCount) }
      const units = this.units
      for (let unitPos = 0, bytePos = 0; unitPos < unitCount; unitPos++, bytePos += 2) {
        units[unitPos] = (bytes[bytePos] << 8) | bytes[bytePos + 1]
      }
      return charsFromUnits(units, unitCount)
    }

    // Fallback (Node < 25, and shorter runs): atob() yields a binary string, paired by hand. For a
    // long surrogate-free run, the bulk TextDecoder("utf-16le") step still beats fromCharCode.
    let bytes
    try {
      bytes = atob(std)
    } catch {
      return ""
    }
    const unitCount = bytes.length >> 1
    if (unitCount === 0) { return "" }
    if (this.units.length < unitCount) { this.units = new Uint16Array(unitCount) }
    const units = this.units
    let hasSurrogate = false
    for (let unitPos = 0, bytePos = 0; unitPos < unitCount; unitPos++, bytePos += 2) {
      const unit = (bytes.charCodeAt(bytePos) << 8) | bytes.charCodeAt(bytePos + 1)
      if (unit >= 0xd800 && unit <= 0xdfff) { hasSurrogate = true }
      units[unitPos] = unit
    }
    if (!hasSurrogate && unitCount >= TEXT_DECODER_MIN_UNITS) {
      return utf16leDecoder.decode(new Uint8Array(units.buffer, units.byteOffset, unitCount * 2))
    }
    return charsFromUnits(units, unitCount)
  }

  /**
   * Decodes one complete Base64 run, with RFC 2152 trailing-bit validation: a run of `length`
   * Base64 chars carries 6*length bits, whose remainder mod 16 must be 0/2/4 zero-padding bits;
   * otherwise it's an incomplete code unit or non-zero padding, replaced with U+FFFD.
   * @param {string} base64
   * @returns {string}
   */
  _decodeRun (base64) {
    const length = base64.length
    if (length === 0) { return "" }
    const leftover = (6 * length) % 16
    let bad = leftover > 4
    if (!bad && leftover > 0 && (this.inv[base64.charCodeAt(length - 1)] & ((1 << leftover) - 1)) !== 0) {
      bad = true
    }
    const decoded = this._decodeBase64(base64)
    return bad ? decoded + "�" : decoded
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    const chars = latin1Decoder.decode(buf) // 1 char per input byte.
    const length = chars.length
    let result = ""
    let cursor = 0
    // Whether `chars` has any non-ASCII byte (ill-formed in direct mode). Valid UTF-7 is pure ASCII,
    // so this is usually false and lets the direct segments skip the per-segment replace. Computed
    // once, lazily on the first direct segment, so an all-Base64 run never pays for the scan.
    let hasNonAscii = -1

    while (cursor < length) {
      if (!this.inBase64) { // Step 1 (RFC 2152 Rule 1/3): copy ASCII up to the next shift-in byte.
        const shift = buf.indexOf(this.shiftIn, cursor)
        const directEnd = shift === -1 ? length : shift
        if (directEnd > cursor) {
          if (hasNonAscii === -1) { hasNonAscii = chars.search(NON_ASCII) !== -1 ? 1 : 0 }
          const segment = chars.slice(cursor, directEnd)
          result += hasNonAscii === 0 ? segment : segment.replace(NON_ASCII, "�") // Non-ASCII is ill-formed.
        }
        if (shift === -1) { break }
        this.inBase64 = true
        this.sawBase64 = false
        cursor = shift + 1
      } else { // Step 3 (RFC 2152 Rule 2): scan bytes to the run terminator (first non-Base64 byte).
        let runEnd = cursor
        while (runEnd < length && this.inv[buf[runEnd]] !== -1) { runEnd++ }
        if (runEnd > cursor) { this.sawBase64 = true }
        if (runEnd === length) {
          // Run continues past this chunk: flush its 16-bit-aligned prefix (8 Base64 chars = 3 code
          // units, no leftover bits) and carry only the < 8-char tail, so memory stays bounded.
          const accumulated = this.pending + chars.slice(cursor)
          const aligned = accumulated.length - (accumulated.length % 8)
          result += this._decodeBase64(accumulated.slice(0, aligned))
          this.pending = accumulated.slice(aligned)
          return result
        }
        const runChars = this.pending + chars.slice(cursor, runEnd)
        this.pending = ""
        const terminator = buf[runEnd]
        if (!this.sawBase64) {
          // No Base64 char after the shift-in. RFC 2152: "+-"/"&-" decodes to a literal "+"/"&"
          // (Step 2); "+"/"&" followed by any other non-Base64 char is an ill-formed sequence.
          result += terminator === MINUS ? this.literal : "�"
        } else {
          result += this._decodeRun(runChars)
        }
        // Step 4 (RFC 2152 Rule 2): a closing "-" is absorbed; any other terminator is re-read.
        cursor = terminator === MINUS ? runEnd + 1 : runEnd
        this.inBase64 = false
        this.sawBase64 = false
      }
    }

    return result
  }

  /** @returns {string|undefined} Any code units decoded from a Base64 run still open at end of input. */
  end () {
    // A stream may end mid-run (the trailing '-' is optional), so decode whatever is buffered.
    const result = this.inBase64 ? this._decodeRun(this.pending) : ""
    this.inBase64 = false
    this.pending = ""
    this.sawBase64 = false
    return result.length > 0 ? result : undefined
  }
}

exports.utf7 = Utf7Codec
exports.unicode11utf7 = "utf7" // Alias UNICODE-1-1-UTF-7.

exports.utf7imap = Utf7IMAPCodec
