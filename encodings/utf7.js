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
  for (let i = 0; i < 64; i++) { bytes[i] = alphabet.charCodeAt(i) }
  return bytes
}

// input byte -> Base64 value (0..63), or -1 if the byte is not a Base64 char.
function buildInv (alphabet) {
  const inv = new Int8Array(256).fill(-1)
  for (let i = 0; i < alphabet.length; i++) { inv[alphabet.charCodeAt(i)] = i }
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
for (let di = 0; di < UTF7_DIRECT_CHARS.length; di++) { UTF7_DIRECT[UTF7_DIRECT_CHARS.charCodeAt(di)] = 1 }

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

// Builds a string from the first `len` code units of a Uint16Array. Done in chunks because
// String.fromCharCode.apply() blows the call stack on very large argument counts.
const CHARS_CHUNK = 8192
function charsFromUnits (units, len) {
  let s = ""
  for (let i = 0; i < len; i += CHARS_CHUNK) {
    s += String.fromCharCode.apply(null, units.subarray(i, Math.min(i + CHARS_CHUNK, len)))
  }
  return s
}

// Shared TextEncoder to bulk-copy long direct (ASCII) runs into the output in one native call.
const asciiEncoder = new TextEncoder()
// Below this length, a per-char copy is cheaper than the slice()+encodeInto() setup.
const DIRECT_BULK_MIN = 16

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
    const n = str.length
    const out = new Uint8Array(n * 5 + 10)
    let p = 0
    let i = 0

    while (i < n) {
      // Maximal run of direct chars -> copied verbatim. The run end is found with one native regex
      // scan; long runs go through TextEncoder in one native call, short ones are copied char by char.
      const dStart = i
      UTF7_NONDIRECT.lastIndex = i
      const m = UTF7_NONDIRECT.exec(str)
      i = m ? m.index : n
      if (i - dStart >= DIRECT_BULK_MIN) {
        // Avoid an extra substring copy when the whole string is one direct run (common for ASCII).
        const src = (dStart === 0 && i === n) ? str : str.slice(dStart, i)
        p += asciiEncoder.encodeInto(src, out.subarray(p)).written
      } else {
        for (let j = dStart; j < i; j++) { out[p++] = str.charCodeAt(j) }
      }
      if (i >= n) { break }

      const code = str.charCodeAt(i)
      if (code === PLUS && (i + 1 >= n || utf7IsDirect(str.charCodeAt(i + 1)))) {
        // A lone "+" (not part of a longer non-direct run) is encoded as "+-".
        out[p++] = PLUS
        out[p++] = MINUS
        i++
        continue
      }

      // Maximal run of non-direct chars -> "+<base64>-".
      out[p++] = PLUS
      let bits = 0
      let nbits = 0
      while (i < n) {
        const c = str.charCodeAt(i)
        if (utf7IsDirect(c)) { break }
        bits = (bits << 16) | c
        nbits += 16
        while (nbits >= 6) {
          nbits -= 6
          out[p++] = BASE64_BYTES[(bits >> nbits) & 0x3f]
          bits &= (1 << nbits) - 1
        }
        i++
      }
      if (nbits > 0) {
        out[p++] = BASE64_BYTES[(bits << (6 - nbits)) & 0x3f]
      }
      out[p++] = MINUS
    }

    return this.backend.bytesToResult(out, p)
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

  write (str) {
    const out = new Uint8Array(str.length * 5 + 10)
    let p = 0

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)

      if (code >= 0x20 && code <= 0x7e) { // Direct character or '&'.
        if (this.inBase64) {
          if (this.nbits > 0) {
            out[p++] = BASE64_IMAP_BYTES[(this.bits << (6 - this.nbits)) & 0x3f]
          }
          out[p++] = MINUS // Close Base64, back to direct mode.
          this.inBase64 = false
          this.bits = 0
          this.nbits = 0
        }

        out[p++] = code
        if (code === AMP) { out[p++] = MINUS } // Ampersand -> "&-".
      } else { // Non-direct character.
        if (!this.inBase64) {
          out[p++] = AMP // Shift into Base64.
          this.inBase64 = true
        }
        this.bits = (this.bits << 16) | code
        this.nbits += 16
        while (this.nbits >= 6) {
          this.nbits -= 6
          out[p++] = BASE64_IMAP_BYTES[(this.bits >> this.nbits) & 0x3f]
          this.bits &= (1 << this.nbits) - 1
        }
      }
    }

    return this.backend.bytesToResult(out, p)
  }

  end () {
    const out = new Uint8Array(2)
    let p = 0
    if (this.inBase64) {
      if (this.nbits > 0) {
        out[p++] = BASE64_IMAP_BYTES[(this.bits << (6 - this.nbits)) & 0x3f]
      }
      out[p++] = MINUS
      this.inBase64 = false
      this.bits = 0
      this.nbits = 0
    }
    return this.backend.bytesToResult(out, p)
  }
}

// == Decoder (shared by UTF-7 and UTF-7-IMAP) =================================
// Each write() turns the input bytes into a "latin1" string (1 char per byte) and parses it with
// native scans: direct runs are plain substrings, and each Base64 run is decoded in bulk with
// atob(). Streaming-aware: a Base64 run split across chunks is buffered (in `pending`) until it
// ends. A trailing shift-out ('-') is optional.
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
    this.pending = "" // Base64 chars of a run still open from a previous chunk.
    this.units = new Uint16Array(0) // Decoded code units, reused across runs; grows lazily.
  }

  // Decode one complete Base64 run (its chars) to a string. Per RFC 2152 the bytes are UTF-16BE
  // code units, decoded verbatim (a lone surrogate passes through as its raw code unit). An
  // ill-formed tail (incomplete code unit or non-zero padding) is replaced with U+FFFD.
  _decodeRun (b64) {
    const len = b64.length
    if (len === 0) { return "" }

    // Validate the trailing bits without decoding them: a run of `len` Base64 chars carries 6*len
    // bits; the remainder mod 16 must be 0/2/4 zero-padding bits, else it's an incomplete or
    // non-zero-padded code unit.
    const leftover = (6 * len) % 16
    let bad = leftover > 4
    if (!bad && leftover > 0 && (this.inv[b64.charCodeAt(len - 1)] & ((1 << leftover) - 1)) !== 0) {
      bad = true
    }

    let bytes
    try {
      bytes = atob(this.imap ? b64.replace(/,/g, "/") : b64)
    } catch {
      return "�" // Not valid Base64 (e.g. length % 4 === 1).
    }

    const nUnits = bytes.length >> 1 // Pairs of bytes -> UTF-16BE code units.
    let s = ""
    if (nUnits > 0) {
      if (this.units.length < nUnits) { this.units = new Uint16Array(nUnits) }
      const units = this.units
      for (let i = 0, j = 0; i < nUnits; i++, j += 2) {
        units[i] = (bytes.charCodeAt(j) << 8) | bytes.charCodeAt(j + 1)
      }
      s = charsFromUnits(units, nUnits)
    }
    return bad ? s + "�" : s
  }

  write (buf) {
    const s = latin1Decoder.decode(buf) // 1 char per input byte.
    const len = s.length
    let res = ""
    let i = 0
    // Whether `s` has any non-ASCII byte (ill-formed in direct mode). Valid UTF-7 is pure ASCII, so
    // this is usually false and lets the direct segments skip the per-segment replace. Computed once,
    // lazily on the first direct segment, so an all-Base64 run never pays for the scan.
    let hasNonAscii = -1

    while (i < len) {
      if (!this.inBase64) { // Direct mode: copy ASCII up to the next shift-in byte.
        const shift = buf.indexOf(this.shiftIn, i)
        const dEnd = shift === -1 ? len : shift
        if (dEnd > i) {
          if (hasNonAscii === -1) { hasNonAscii = s.search(NON_ASCII) !== -1 ? 1 : 0 }
          const seg = s.slice(i, dEnd)
          res += hasNonAscii === 0 ? seg : seg.replace(NON_ASCII, "�") // Non-ASCII is ill-formed here.
        }
        if (shift === -1) { break }
        this.inBase64 = true
        i = shift + 1
      } else { // Base64 mode: scan bytes to the run terminator (first non-Base64 byte).
        let end = i
        while (end < len && this.inv[buf[end]] !== -1) { end++ }
        if (end === len) { // Run continues past this chunk.
          this.pending += s.slice(i)
          return res
        }
        const run = this.pending + s.slice(i, end)
        this.pending = ""
        const term = buf[end]
        if (run.length === 0 && term === MINUS) { // "+-"/"&-" -> literal.
          res += this.literal
          i = end + 1
        } else {
          res += this._decodeRun(run)
          i = term === MINUS ? end + 1 : end // '-' is absorbed; anything else is re-read as direct.
        }
        this.inBase64 = false
      }
    }

    return res
  }

  end () {
    // A stream may end mid-run (the trailing '-' is optional), so decode whatever is buffered.
    const res = this.inBase64 ? this._decodeRun(this.pending) : ""
    this.inBase64 = false
    this.pending = ""
    return res.length > 0 ? res : undefined
  }
}

// == Exports ==================================================================

exports.utf7 = Utf7Codec
exports.unicode11utf7 = "utf7" // Alias UNICODE-1-1-UTF-7.

exports.utf7imap = Utf7IMAPCodec
