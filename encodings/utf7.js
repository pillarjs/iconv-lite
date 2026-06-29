"use strict"

// == UTF-7 / UTF-7-IMAP codecs ================================================
//
// UTF-7, according to https://tools.ietf.org/html/rfc2152
// UTF-7-IMAP (Modified UTF-7), according to http://tools.ietf.org/html/rfc3501#section-5.1.3
//
// Both codecs are self-contained: they don't go through the iconv-lite backend for the actual
// conversion, only native APIs shared by Node and browsers. Encoding uses a small hand-rolled bit
// accumulator for the Base64 (no Buffer); decoding hands each Base64 run to atob() and turns direct
// runs into substrings via TextDecoder. The only backend touch left is the encoder's final
// "bytes -> result" step, so that encoding keeps returning a Buffer in Node (like the utf16 codec).

// -- Shared tables and constants ----------------------------------------------

const PLUS = 0x2b // '+'
const MINUS = 0x2d // '-'
const AMP = 0x26 // '&'

// Standard Base64 alphabet, plus the UTF-7-IMAP variant which uses ',' instead of '/'.
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const BASE64_IMAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,"

// value (0..63) -> output byte (ASCII code of the Base64 char).
function buildBytes (alphabet) {
  const bytes = new Uint8Array(64)
  for (let value = 0; value < 64; value++) { bytes[value] = alphabet.charCodeAt(value) }
  return bytes
}

// input byte -> Base64 value (0..63), or -1 if the byte is not a Base64 char.
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

// Characters that UTF-7 represents directly (un-encoded), per RFC 2152: Set D (mandatory),
// Set O (optional but allowed direct), and whitespace (SP, TAB, CR, LF). Everything else --
// including '+' (the shift char), '\', '~' and all non-ASCII -- is shifted into Base64.
const UTF7_DIRECT = new Uint8Array(128)
const UTF7_DIRECT_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" + // letters + digits (Set D)
  "'(),-./:?" + // Set D punctuation
  "!\"#$%&*;<=>@[]^_`{|}" + // Set O (optional direct)
  " \t\n\r" // whitespace
for (let index = 0; index < UTF7_DIRECT_CHARS.length; index++) {
  UTF7_DIRECT[UTF7_DIRECT_CHARS.charCodeAt(index)] = 1
}

function utf7IsDirect (code) {
  return code < 128 && UTF7_DIRECT[code] === 1
}

// Regex matching the first non-direct char, derived from the same set so there's no second source
// of truth. Used by the encoder to skip over direct runs in one native (C++) scan instead of a
// per-char JS loop. The class metacharacters ] \ ^ - are escaped for use inside [^...].
const UTF7_NONDIRECT = new RegExp("[^" + UTF7_DIRECT_CHARS.replace(/[\]\\^-]/g, "\\$&") + "]", "g")

// Shared single-byte TextDecoder used to view the input as one char per byte. (The WHATWG
// "latin1" label is windows-1252, single-byte; ASCII bytes < 0x80 decode 1:1, which is all the
// parser relies on -- direct runs are ASCII substrings and Base64 runs are ASCII handed to atob().)
const latin1Decoder = new TextDecoder("latin1")
// Matches any non-ASCII char (a byte >= 0x80): invalid while unshifted, so replaced with U+FFFD.
const NON_ASCII = /[\u0080-\uffff]/g

// Builds a string from the first `length` code units of a Uint16Array. Done in chunks because
// String.fromCharCode.apply() blows the call stack on very large argument counts.
const CHARS_CHUNK = 8192
function charsFromUnits (units, length) {
  let result = ""
  for (let offset = 0; offset < length; offset += CHARS_CHUNK) {
    result += String.fromCharCode.apply(null, units.subarray(offset, Math.min(offset + CHARS_CHUNK, length)))
  }
  return result
}

// Shared TextEncoder to bulk-copy long direct (ASCII) runs into the output in one native call.
const asciiEncoder = new TextEncoder()
// Below this length, a per-char copy is cheaper than the slice()+encodeInto() setup.
const DIRECT_BULK_MIN = 16

// -- Encoder helpers ----------------------------------------------------------

// Emit the final partial Base64 sextet (the leftover < 6 bits, zero-padded). Returns the new `pos`.
function flushBase64Tail (out, pos, bits, nbits, bytes) {
  if (nbits > 0) { out[pos++] = bytes[(bits << (6 - nbits)) & 0x3f] }
  return pos
}

// Copy a run of direct chars str[from, to) into `out` verbatim. Long runs go through TextEncoder in
// one native call; short ones are cheaper to copy char by char. Returns the new `pos`.
function copyDirectRun (str, from, to, out, pos) {
  if (to - from >= DIRECT_BULK_MIN) {
    // Avoid an extra substring copy when the whole string is one direct run (common for ASCII).
    const source = (from === 0 && to === str.length) ? str : str.slice(from, to)
    return pos + asciiEncoder.encodeInto(source, out.subarray(pos)).written
  }
  for (let index = from; index < to; index++) { out[pos++] = str.charCodeAt(index) }
  return pos
}

// Encode the non-direct run str[from, to) as "+<base64>-" (UTF-16BE -> modified Base64). Returns
// the new `pos`.
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

// == UTF-7 codec ==============================================================

class Utf7Codec {
  createEncoder (options, iconv) {
    return new Utf7Encoder(iconv.backend)
  }

  createDecoder (options, iconv) {
    return new Utf7Decoder(PLUS, "+", INV, false)
  }

  get bomAware () { return true }
}

// == UTF-7-IMAP codec =========================================================
// Differences from plain UTF-7:
//  * Base64 part is started by "&" instead of "+"
//  * Direct characters are 0x20-0x7E, except "&" (0x26)
//  * In Base64, "," is used instead of "/"
//  * Base64 must not be used to represent direct characters.
//  * No implicit shift back from Base64 (always ends with '-')

class Utf7IMAPCodec {
  createEncoder (options, iconv) {
    return new Utf7IMAPEncoder(iconv.backend)
  }

  createDecoder (options, iconv) {
    return new Utf7Decoder(AMP, "&", INV_IMAP, true)
  }

  get bomAware () { return true }
}

// == UTF-7 encoder ============================================================
// Naive (stateless per write): non-direct chars are encoded as "+<base64>-"; a lone "+" -> "+-".

class Utf7Encoder {
  constructor (backend) {
    this.backend = backend
  }

  write (str) {
    const length = str.length
    const out = new Uint8Array(length * 5 + 10)
    let pos = 0
    let cursor = 0

    while (cursor < length) {
      // Maximal run of direct chars -> copied verbatim (run end found with one native regex scan).
      const directStart = cursor
      UTF7_NONDIRECT.lastIndex = cursor
      const match = UTF7_NONDIRECT.exec(str)
      cursor = match ? match.index : length
      pos = copyDirectRun(str, directStart, cursor, out, pos)
      if (cursor >= length) { break }

      const code = str.charCodeAt(cursor)
      if (code === PLUS && (cursor + 1 >= length || utf7IsDirect(str.charCodeAt(cursor + 1)))) {
        // A lone "+" (not part of a longer non-direct run) is encoded as "+-".
        out[pos++] = PLUS
        out[pos++] = MINUS
        cursor++
        continue
      }

      // Maximal run of non-direct chars -> "+<base64>-".
      let runEnd = cursor + 1
      while (runEnd < length && !utf7IsDirect(str.charCodeAt(runEnd))) { runEnd++ }
      pos = encodeBase64Run(str, cursor, runEnd, out, pos, BASE64_BYTES)
      cursor = runEnd
    }

    return this.backend.bytesToResult(out, pos)
  }

  end () {}
}

// == UTF-7-IMAP encoder =======================================================
// Stateful across writes: keeps the Base64 bit accumulator open until a direct char or end().

class Utf7IMAPEncoder {
  constructor (backend) {
    this.backend = backend
    this.inBase64 = false
    this.bits = 0
    this.nbits = 0
  }

  // Close an open Base64 run: flush the leftover bits, write the shift-out '-', reset. Returns `pos`.
  _closeBase64 (out, pos) {
    pos = flushBase64Tail(out, pos, this.bits, this.nbits, BASE64_IMAP_BYTES)
    out[pos++] = MINUS
    this.inBase64 = false
    this.bits = 0
    this.nbits = 0
    return pos
  }

  write (str) {
    const out = new Uint8Array(str.length * 5 + 10)
    let pos = 0

    for (let cursor = 0; cursor < str.length; cursor++) {
      const code = str.charCodeAt(cursor)

      if (code >= 0x20 && code <= 0x7e) { // Direct character or '&'.
        if (this.inBase64) { pos = this._closeBase64(out, pos) }
        out[pos++] = code
        if (code === AMP) { out[pos++] = MINUS } // Ampersand -> "&-".
      } else { // Non-direct character.
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

  end () {
    const out = new Uint8Array(2)
    const pos = this.inBase64 ? this._closeBase64(out, 0) : 0
    return this.backend.bytesToResult(out, pos)
  }
}

// == Decoder (shared by UTF-7 and UTF-7-IMAP) =================================
// Each write() turns the input bytes into a "latin1" string (1 char per byte) and parses it with
// native scans: direct runs are plain substrings, and each Base64 run is decoded in bulk with
// atob(). Streaming-aware: a Base64 run split across chunks flushes its aligned prefix and carries
// only the < 8-char tail. A trailing shift-out ('-') is optional.
//
// Conformance (RFC 2152): only ASCII is valid in direct mode, and a Base64 run must end on a 16-bit
// boundary with zero padding bits. Ill-formed input -- a non-ASCII byte while unshifted, an
// incomplete code unit, or non-zero trailing bits -- is replaced with U+FFFD.

class Utf7Decoder {
  constructor (shiftIn, literal, inv, imap) {
    this.shiftIn = shiftIn // Byte that starts a Base64 run ('+' or '&').
    this.literal = literal // The same char, for the "+-"/"&-" -> literal case.
    this.inv = inv // Base64 byte -> value table; also tells a Base64 byte from a run terminator (-1).
    this.imap = imap // UTF-7-IMAP uses ',' for value 63 and must be mapped back to '/' for atob().

    this.inBase64 = false
    this.pending = "" // Unflushed Base64 chars of a run open from a previous chunk (kept < 8).
    this.sawBase64 = false // Whether the current run has had any Base64 char (vs the "+-" literal).
    this.units = new Uint16Array(0) // Decoded code units, reused across runs; grows lazily.
  }

  // Decode a Base64 string (Base64 alphabet only) to its UTF-16BE code units. No validation: bytes
  // are paired into code units verbatim (a lone surrogate passes through), and invalid Base64
  // (length % 4 === 1) yields "" -- the caller flags that as ill-formed.
  _decodeBase64 (base64) {
    let bytes
    try {
      bytes = atob(this.imap ? base64.replace(/,/g, "/") : base64)
    } catch {
      return ""
    }
    const unitCount = bytes.length >> 1 // Pairs of bytes -> UTF-16BE code units.
    if (unitCount === 0) { return "" }
    if (this.units.length < unitCount) { this.units = new Uint16Array(unitCount) }
    const units = this.units
    for (let unitPos = 0, bytePos = 0; unitPos < unitCount; unitPos++, bytePos += 2) {
      units[unitPos] = (bytes.charCodeAt(bytePos) << 8) | bytes.charCodeAt(bytePos + 1)
    }
    return charsFromUnits(units, unitCount)
  }

  // Decode one complete Base64 run, with RFC 2152 trailing-bit validation: a run of `length` Base64
  // chars carries 6*length bits, whose remainder mod 16 must be 0/2/4 zero-padding bits -- else it's
  // an incomplete code unit or non-zero padding, replaced with U+FFFD.
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
      if (!this.inBase64) { // Direct mode: copy ASCII up to the next shift-in byte.
        const shift = buf.indexOf(this.shiftIn, cursor)
        const directEnd = shift === -1 ? length : shift
        if (directEnd > cursor) {
          if (hasNonAscii === -1) { hasNonAscii = chars.search(NON_ASCII) !== -1 ? 1 : 0 }
          const segment = chars.slice(cursor, directEnd)
          result += hasNonAscii === 0 ? segment : segment.replace(NON_ASCII, "�") // Non-ASCII is ill-formed here.
        }
        if (shift === -1) { break }
        this.inBase64 = true
        this.sawBase64 = false
        cursor = shift + 1
      } else { // Base64 mode: scan bytes to the run terminator (first non-Base64 byte).
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
        if (!this.sawBase64 && terminator === MINUS) { // "+-"/"&-" with no Base64 chars -> literal.
          result += this.literal
          cursor = runEnd + 1
        } else {
          result += this._decodeRun(runChars)
          cursor = terminator === MINUS ? runEnd + 1 : runEnd // '-' absorbed; else re-read as direct.
        }
        this.inBase64 = false
        this.sawBase64 = false
      }
    }

    return result
  }

  end () {
    // A stream may end mid-run (the trailing '-' is optional), so decode whatever is buffered.
    const result = this.inBase64 ? this._decodeRun(this.pending) : ""
    this.inBase64 = false
    this.pending = ""
    this.sawBase64 = false
    return result.length > 0 ? result : undefined
  }
}

// == Exports ==================================================================

exports.utf7 = Utf7Codec
exports.unicode11utf7 = "utf7" // Alias UNICODE-1-1-UTF-7.

exports.utf7imap = Utf7IMAPCodec
