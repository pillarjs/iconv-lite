"use strict"

/**
 * Node.js-compatible "internal" codecs: UTF-8, CESU-8 and the byte-string transports binary
 * (latin1), base64 and hex. Their semantics deliberately match Node's Buffer built-ins so that
 * iconv-lite can be used as a drop-in replacement for Buffer-based conversions.
 *
 * Browser-native: the conversions only require APIs shared by Node and browsers (TextEncoder,
 * TextDecoder, atob/btoa and, where available, Uint8Array.fromBase64/toBase64/toHex) plus plain
 * Uint8Array byte I/O -- the Buffer module is never imported, so browser bundles don't need a
 * polyfill. When the runtime is Node, the conversion helpers pick the equivalent native Buffer
 * implementation instead, which is the fastest one there; the iconv-lite backend is touched only
 * for the encoders' final "bytes -> result" step, so encoding keeps returning a Buffer in Node
 * (like the utf16/utf32 codecs).
 *
 * Note the direction of the byte-string transports (binary/base64/hex): encode() parses the
 * *textual representation* into bytes and decode() serializes bytes back into that representation,
 * mirroring Buffer.from(str, enc) / buf.toString(enc).
 */

/** Max args for one String.fromCharCode.apply() before risking a call-stack overflow. */
const CHARS_CHUNK = 8192
/** Above this many code units the native TextDecoder beats fromCharCode; below it the per-call setup costs more. */
const TEXT_DECODER_MIN_UNITS = 64
/**
 * Turns decoded UTF-16 code units (held in a Uint16Array, native little-endian) into a string in
 * one native call. Only used for runs with no surrogate (where it equals the verbatim conversion),
 * since it would otherwise replace a lone surrogate with U+FFFD instead of passing it through.
 * @type {TextDecoder}
 */
const utf16leDecoder = new TextDecoder("utf-16le", { ignoreBOM: true })

/** Shared TextEncoder, encodes a string to well-formed UTF-8 bytes in one native call. @type {TextEncoder} */
const utf8Encoder = new TextEncoder()

/**
 * The native Buffer class when running in Node, else null. Buffer's built-in conversions are
 * several times faster than the portable paths below (they're what these codecs emulate), so the
 * helpers use them whenever they're available. Detected via process.versions.node so that a
 * bundler-injected Buffer polyfill (slower than the portable paths) doesn't take these shortcuts.
 */
const nodeBuffer = typeof process !== "undefined" && process.versions && process.versions.node &&
  typeof Buffer === "function"
  ? Buffer
  : null

/** Whether the runtime has Uint8Array.fromBase64 (Node 25+, modern browsers). */
const HAS_FROM_BASE64 = typeof Uint8Array.fromBase64 === "function"
/** Whether the runtime has Uint8Array.prototype.toBase64 (Node 25+, modern browsers). */
const HAS_TO_BASE64 = typeof Uint8Array.prototype.toBase64 === "function"
/** Whether the runtime has Uint8Array.prototype.toHex (Node 25+, modern browsers). */
const HAS_TO_HEX = typeof Uint8Array.prototype.toHex === "function"

/** Matches every char outside the base64 alphabet, including padding (see Base64Encoder). @type {RegExp} */
const NON_BASE64 = /[^A-Za-z0-9+/]/g

/**
 * Hex digit -> value table, indexed by char code & 0xFF (Buffer masks the code the same way, so
 * e.g. U+0130 parses as its low byte 0x30, "0"); -1 marks a non-digit. @type {Int8Array}
 */
const HEX_VALUES = new Int8Array(256).fill(-1)
for (let digit = 0; digit < 16; digit++) {
  HEX_VALUES["0123456789abcdef".charCodeAt(digit)] = digit
  HEX_VALUES["0123456789ABCDEF".charCodeAt(digit)] = digit
}

/** Byte value -> its 2 lowercase hex digits. @type {string[]} */
const HEX_CHARS = new Array(256)
for (let byte = 0; byte < 256; byte++) {
  HEX_CHARS[byte] = ((byte >> 4) & 0xF).toString(16) + (byte & 0xF).toString(16)
}

/**
 * Builds a string from the first `length` code units of an array-like, in stack-safe chunks.
 * @param {Uint16Array|Uint8Array} units
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

/**
 * Parses base64 text (pre-cleaned to alphabet chars only, no padding) into bytes, like Node's
 * forgiving parser: a dangling char (4k+1 length, no whole byte in it) is dropped. In Node it IS
 * Buffer's parser, which also beats Uint8Array.fromBase64 below ~100 KB (per-call overhead).
 * @param {string} str
 * @returns {Buffer|Uint8Array}
 */
function base64ToBytes (str) {
  if (str.length % 4 === 1) { str = str.slice(0, -1) }
  if (nodeBuffer) { return nodeBuffer.from(str, "base64") }
  if (HAS_FROM_BASE64) { return Uint8Array.fromBase64(str, { lastChunkHandling: "loose" }) }
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i) }
  return bytes
}

/**
 * Serializes bytes as base64 text (standard alphabet, padded), like buf.toString("base64").
 * Only Buffer instances take the Buffer path, so the portable branches still run (and stay
 * covered) when a Uint8Array comes in, e.g. under the web backend.
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64 (bytes) {
  if (nodeBuffer && nodeBuffer.isBuffer(bytes)) { return bytes.toString("base64") }
  if (HAS_TO_BASE64) { return bytes.toBase64() }
  return btoa(charsFromUnits(bytes, bytes.length))
}

/**
 * UTF-8 codec.
 *
 * Decoding uses the WHATWG-standard TextDecoder, so it conforms to the Encoding Standard's "UTF-8
 * decode": ill-formed sequences (RFC 3629 / Unicode Standard, Section 3.9, definition D92) are
 * replaced with U+FFFD following the maximal-subpart rule, or throw with { fatal: true }.
 * Streaming (sequences split across chunks) is handled by TextDecoder itself.
 *
 * Encoding produces well-formed UTF-8: a lone (unpaired) surrogate is replaced with U+FFFD, the
 * same result as the WHATWG "UTF-8 encode" of a USVString. The encoder is streaming-safe: a
 * surrogate pair split across two write() calls is held over and encoded whole.
 */
class Utf8Codec {
  createEncoder (options, iconv) { return new Utf8Encoder(iconv.backend) }
  createDecoder (options, iconv) { return new Utf8Decoder(options) }
  get bomAware () { return true }
}

/**
 * CESU-8 codec (Unicode Technical Report #26, "Compatibility Encoding Scheme for UTF-16: 8-Bit").
 * Every UTF-16 code unit -- including each half of a surrogate pair -- is encoded in the 1..3-byte
 * UTF-8 byte pattern, so supplementary characters take 6 bytes (two 3-byte sequences) instead of
 * UTF-8's 4.
 */
class Cesu8Codec {
  createEncoder (options, iconv) { return new Cesu8Encoder(iconv.backend) }
  createDecoder (options, iconv) { return new Cesu8Decoder(iconv.defaultCharUnicode, !!(options && options.fatal)) }
  get bomAware () { return true }
}

/**
 * Binary codec, an alias of Node's "binary"/"latin1" Buffer encoding: byte value <-> code point
 * (the ISO-8859-1 identity mapping, U+0000..U+00FF). This is intentionally NOT the WHATWG "latin1"
 * label, which resolves to windows-1252; that one is served by the sbcs tables.
 */
class BinaryCodec {
  createEncoder (options, iconv) { return new BinaryEncoder(iconv.backend) }
  createDecoder (options, iconv) { return new BinaryDecoder() }
}

/**
 * Base64 codec (RFC 4648, Section 4), with Node Buffer's forgiving parser: non-alphabet bytes
 * (whitespace etc.) are ignored, the first "=" terminates the input, and an incomplete trailing
 * quantum is truncated. Both directions are streaming-safe: base64 maps 3 bytes <-> one 4-char
 * quantum, so the encoder only parses whole quanta and the decoder only serializes whole 3-byte
 * groups, carrying the remainder over to the next write().
 */
class Base64Codec {
  createEncoder (options, iconv) { return new Base64Encoder(iconv.backend) }
  createDecoder (options, iconv) { return new Base64Decoder() }
}

/**
 * Hex codec (RFC 4648, Section 8, "Base16"), matching Node Buffer's semantics: decoding emits
 * lowercase hex; encoding parses hex pairs (either case) and stops at the first invalid or
 * incomplete pair. The encoder is streaming-safe: a pair split across two write() calls is carried
 * over, not dropped.
 */
class HexCodec {
  createEncoder (options, iconv) { return new HexEncoder(iconv.backend) }
  createDecoder (options, iconv) { return new HexDecoder() }
}

/**
 * UTF-8 encoder. Delegates the conversion to Buffer.from(str, "utf8") in Node or TextEncoder
 * elsewhere; both encode each Unicode scalar value per RFC 3629 and replace a lone surrogate with
 * U+FFFD. The only state is chunk stitching: a high surrogate at the very end of a write() may be
 * the first half of a pair whose low half arrives in the next chunk, so it is held back instead of
 * being encoded (ill-formed) now.
 */
class Utf8Encoder {
  /** @param {object} backend The iconv-lite backend (its bytesToResult turns bytes into a Buffer/Uint8Array). */
  constructor (backend) {
    this.backend = backend
    this.highSurrogate = ""
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    if (this.highSurrogate) {
      str = this.highSurrogate + str
      this.highSurrogate = ""
    }

    if (str.length > 0) {
      const code = str.charCodeAt(str.length - 1)
      if (code >= 0xD800 && code < 0xDC00) {
        this.highSurrogate = str[str.length - 1]
        str = str.slice(0, str.length - 1)
      }
    }

    return this._encode(str)
  }

  /** @returns {Buffer|Uint8Array|undefined} U+FFFD (as EF BF BD) for a high surrogate left unpaired at end of input. */
  end () {
    if (this.highSurrogate) {
      const str = this.highSurrogate
      this.highSurrogate = ""
      return this._encode(str)
    }
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  _encode (str) {
    if (nodeBuffer) { return nodeBuffer.from(str, "utf8") }
    const bytes = utf8Encoder.encode(str)
    return this.backend.bytesToResult(bytes, bytes.length)
  }
}

/**
 * UTF-8 decoder: a thin wrapper over the WHATWG TextDecoder, which implements the Encoding
 * Standard's UTF-8 decoder (streaming, U+FFFD replacement and { fatal } are all native).
 *
 * BOM handling: by default TextDecoder consumes a leading BOM itself (ignoreBOM: false). When the
 * caller opts out of stripping (stripBOM: false) or wants to observe it (stripBOM: callback), the
 * BOM must reach iconv-lite's StripBOM wrapper instead, so the TextDecoder is told to leave it in.
 */
class Utf8Decoder {
  /** @param {{fatal?: boolean, stripBOM?: boolean|Function}} [options] */
  constructor (options) {
    this.decoder = new TextDecoder("utf8", {
      ignoreBOM: !!options && (options.stripBOM === false || typeof options.stripBOM === "function"),
      fatal: !!(options && options.fatal)
    })
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    return this.decoder.decode(buf, { stream: true })
  }

  /** @returns {string|undefined} U+FFFD for a sequence left truncated at end of input (or throws when fatal). */
  end () {
    const res = this.decoder.decode()
    return res.length > 0 ? res : undefined
  }
}

/**
 * CESU-8 encoder (UTR #26). Encodes each UTF-16 code unit independently in the UTF-8 byte pattern:
 * 1 byte for U+0000..U+007F, 2 bytes for U+0080..U+07FF, 3 bytes for U+0800..U+FFFF. Surrogate
 * halves are just code units here (0xD800..0xDFFF -> 3-byte form), which is exactly what makes it
 * CESU-8 rather than UTF-8. No state is needed: a pair split across chunks encodes the same way.
 */
class Cesu8Encoder {
  /** @param {object} backend */
  constructor (backend) {
    this.backend = backend
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    const out = new Uint8Array(str.length * 3)
    let pos = 0
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i)
      if (charCode < 0x80) {
        out[pos++] = charCode
      } else if (charCode < 0x800) {
        out[pos++] = 0xC0 + (charCode >>> 6)
        out[pos++] = 0x80 + (charCode & 0x3f)
      } else { // charCode is always < 0x10000 (it is a UTF-16 code unit).
        out[pos++] = 0xE0 + (charCode >>> 12)
        out[pos++] = 0x80 + ((charCode >>> 6) & 0x3f)
        out[pos++] = 0x80 + (charCode & 0x3f)
      }
    }
    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {void} */
  end () {}
}

/**
 * CESU-8 decoder (UTR #26). There is no native CESU-8 decoding (a WHATWG "utf-8" TextDecoder
 * correctly rejects surrogate byte sequences as ill-formed UTF-8), so this is a hand-rolled state
 * machine: a lead byte selects the sequence length (1..3 bytes; 4-byte lead bytes are ill-formed
 * in CESU-8), continuation bytes accumulate the code unit, and each completed unit is emitted
 * as-is (surrogate pairs reassemble naturally in the UTF-16 output). Ill-formed input -- an
 * aborted sequence, an unexpected continuation byte, an overlong encoding or a 4-byte lead -- is
 * replaced with the bad-char (U+FFFD by default), or throws with { fatal: true }. Exception: the
 * overlong NULL "C0 80" is accepted for Modified UTF-8 (Java) compatibility. Streaming: the
 * accumulator carries a sequence split across chunks.
 */
class Cesu8Decoder {
  /**
   * @param {string} defaultCharUnicode Replacement for ill-formed input.
   * @param {boolean} fatal Throw on ill-formed input instead of emitting the replacement.
   */
  constructor (defaultCharUnicode, fatal) {
    this.acc = 0
    this.contBytes = 0
    this.accBytes = 0
    this.defaultCharUnicode = defaultCharUnicode
    this.fatal = fatal
    this.units = new Uint16Array(0) // Decoded code units, reused across writes; grows lazily.
  }

  /**
   * Handles one ill-formed sequence: throws when fatal, otherwise appends the bad-char's code units.
   * @param {Uint16Array} units
   * @param {number} pos Current code-unit write position.
   * @returns {number} The new code-unit write position.
   */
  _replacement (units, pos) {
    if (this.fatal) { throw new Error("Ill-formed CESU-8 byte sequence") }
    const badChar = this.defaultCharUnicode
    for (let i = 0; i < badChar.length; i++) { units[pos++] = badChar.charCodeAt(i) }
    return pos
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    let acc = this.acc
    let contBytes = this.contBytes
    let accBytes = this.accBytes
    // Worst case is one unit per byte, or the bad-char per byte if it's longer than one unit.
    const maxUnits = buf.length * Math.max(1, this.defaultCharUnicode.length) + 1
    if (this.units.length < maxUnits) { this.units = new Uint16Array(maxUnits) }
    const units = this.units
    let pos = 0

    for (let i = 0; i < buf.length; i++) {
      const curByte = buf[i]
      if ((curByte & 0xC0) !== 0x80) { // Lead byte.
        if (contBytes > 0) { // The previous sequence was aborted: ill-formed.
          pos = this._replacement(units, pos)
          contBytes = 0
        }

        if (curByte < 0x80) { // Single-byte code unit.
          units[pos++] = curByte
        } else if (curByte < 0xE0) { // Two-byte sequence.
          acc = curByte & 0x1F
          contBytes = 1; accBytes = 1
        } else if (curByte < 0xF0) { // Three-byte sequence.
          acc = curByte & 0x0F
          contBytes = 2; accBytes = 1
        } else { // Four or more bytes are ill-formed in CESU-8 (UTR #26 uses surrogate pairs instead).
          pos = this._replacement(units, pos)
        }
      } else { // Continuation byte.
        if (contBytes > 0) { // We're waiting for it.
          acc = (acc << 6) | (curByte & 0x3f)
          contBytes--; accBytes++
          if (contBytes === 0) {
            // Reject overlong encodings, but accept Modified UTF-8's NULL as "C0 80".
            if (accBytes === 2 && acc < 0x80 && acc > 0) {
              pos = this._replacement(units, pos)
            } else if (accBytes === 3 && acc < 0x800) {
              pos = this._replacement(units, pos)
            } else {
              units[pos++] = acc
            }
          }
        } else { // Unexpected continuation byte: ill-formed.
          pos = this._replacement(units, pos)
        }
      }
    }
    this.acc = acc; this.contBytes = contBytes; this.accBytes = accBytes

    // Long output converts in one native call unless it holds a LONE surrogate, which must pass
    // through verbatim and TextDecoder would replace with U+FFFD. Properly paired surrogates (the
    // normal CESU-8 case) decode natively just fine, so the scan only rejects unpaired ones --
    // e.g. ill-formed input, or a pair split at a chunk boundary.
    if (pos >= TEXT_DECODER_MIN_UNITS) {
      let loneSurrogate = false
      for (let k = 0; k < pos; k++) {
        const unit = units[k]
        if (unit >= 0xD800 && unit <= 0xDFFF) {
          if (unit < 0xDC00 && k + 1 < pos && units[k + 1] >= 0xDC00 && units[k + 1] <= 0xDFFF) {
            k++ // A high surrogate followed by a low one: a valid pair.
            continue
          }
          loneSurrogate = true
          break
        }
      }
      if (!loneSurrogate) { return utf16leDecoder.decode(new Uint8Array(units.buffer, 0, pos * 2)) }
    }
    return charsFromUnits(units, pos)
  }

  /** @returns {string|undefined} The bad-char for a sequence left truncated at end of input (or throws when fatal). */
  end () {
    if (this.contBytes === 0) { return }
    this.contBytes = 0
    if (this.fatal) { throw new Error("Truncated CESU-8 sequence at end of input") }
    return this.defaultCharUnicode
  }
}

/**
 * Binary encoder (latin1 text -> bytes): each char becomes the byte `charCode & 0xFF` (Buffer's
 * "binary"/"latin1" behavior for code points above U+00FF). Stateless.
 */
class BinaryEncoder {
  /** @param {object} backend */
  constructor (backend) {
    this.backend = backend
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    if (nodeBuffer) { return nodeBuffer.from(str, "binary") }
    const out = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) { out[i] = str.charCodeAt(i) & 0xFF }
    return this.backend.bytesToResult(out, out.length)
  }

  /** @returns {void} */
  end () {}
}

/**
 * Binary decoder (bytes -> latin1 text): byte value -> code point, 1:1. Stateless, so each chunk
 * is serialized as it comes in. Without Buffer, long chunks are widened into a reusable
 * Uint16Array and converted in one native TextDecoder call (safe: values <= 0xFF are never
 * surrogates).
 */
class BinaryDecoder {
  constructor () {
    this.units = new Uint16Array(0) // Reused across writes; grows lazily.
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    if (nodeBuffer && nodeBuffer.isBuffer(buf)) { return buf.toString("binary") }
    if (buf.length >= TEXT_DECODER_MIN_UNITS) {
      if (this.units.length < buf.length) { this.units = new Uint16Array(buf.length) }
      const units = this.units
      for (let i = 0; i < buf.length; i++) { units[i] = buf[i] }
      return utf16leDecoder.decode(new Uint8Array(units.buffer, 0, buf.length * 2))
    }
    return charsFromUnits(buf, buf.length)
  }

  /** @returns {void} */
  end () {}
}

/**
 * Base64 encoder (base64 text -> bytes), with Node Buffer's exact parsing semantics: non-alphabet
 * chars (whitespace etc.) are ignored, and the first "=" terminates the input -- its quantum is
 * finished and everything after it is discarded. Streaming-safe: only whole 4-char quanta
 * (RFC 4648, Section 4) are parsed per write(); the remainder (up to 3 chars) is carried over,
 * otherwise it would mis-parse as a truncated final quantum.
 */
class Base64Encoder {
  /** @param {object} backend */
  constructor (backend) {
    this.backend = backend
    this.prevStr = ""
    this.done = false // Whether a "=" terminator has been consumed (all further input is discarded).
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    if (this.done) { return this.backend.bytesToResult(new Uint8Array(0), 0) }
    const full = this.prevStr + str

    // "=" ends the stream, like Buffer.from: decode the chars before it as the final quantum.
    const eq = full.indexOf("=")
    const chunk = eq !== -1 ? full.slice(0, eq) : full.slice(0, full.length - (full.length % 4))

    // Fast path: parse assuming clean base64 (the common case) and verify via the byte count.
    // Ignored bytes shorten the output below 3/4 of the chars (Buffer skips foreign chars, atob
    // strips whitespace) and the other parsers throw on them -- either way a count match proves
    // the chunk was clean and no realignment (the replace below) is needed.
    let bytes = null
    try {
      const parsed = base64ToBytes(chunk)
      const parseLen = chunk.length - (chunk.length % 4 === 1 ? 1 : 0) // base64ToBytes drops a dangling char.
      if (parsed.length === (parseLen * 3) >> 2) { bytes = parsed }
    } catch (e) {}

    if (bytes === null) {
      // Dirty input: drop the non-alphabet chars, realign, reparse.
      const cleaned = full.slice(0, eq !== -1 ? eq : full.length).replace(NON_BASE64, "")
      const quads = eq !== -1 ? cleaned.length : cleaned.length - (cleaned.length % 4)
      bytes = base64ToBytes(cleaned.slice(0, quads))
      this.prevStr = eq !== -1 ? "" : cleaned.slice(quads)
    } else {
      this.prevStr = eq !== -1 ? "" : full.slice(chunk.length)
    }
    if (eq !== -1) { this.done = true }

    return this.backend.bytesToResult(bytes, bytes.length)
  }

  /** @returns {Buffer|Uint8Array} Bytes of the remaining (possibly truncated) final quantum. */
  end () {
    // The fast path can carry unverified (non-alphabet) chars over; atob would throw on them.
    const bytes = base64ToBytes(this.prevStr.replace(NON_BASE64, ""))
    this.prevStr = ""
    this.done = false
    return this.backend.bytesToResult(bytes, bytes.length)
  }
}

/**
 * Base64 decoder (bytes -> base64 text). Only whole 3-byte groups are serialized during write()
 * (they map to whole 4-char quanta, so no padding is emitted mid-stream and the concatenated
 * chunks equal the base64 of the whole input); the remainder (up to 2 bytes) is carried over, and
 * end() serializes it as the final, padded, quantum.
 */
class Base64Decoder {
  constructor () {
    this.overflow = new Uint8Array(3) // Bytes of an incomplete final group, finished by the next chunk.
    this.overflowLen = 0
  }

  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    if (this.overflowLen + buf.length < 3) {
      for (let i = 0; i < buf.length; i++) { this.overflow[this.overflowLen++] = buf[i] }
      return ""
    }

    let res = ""
    let pos = 0
    if (this.overflowLen > 0) {
      // Finish the group that was split across the previous chunk boundary.
      for (; this.overflowLen < 3; pos++) { this.overflow[this.overflowLen++] = buf[pos] }
      res = bytesToBase64(this.overflow)
      this.overflowLen = 0
    }

    const groupsEnd = pos + ((buf.length - pos) / 3 | 0) * 3
    if (groupsEnd > pos) { res += bytesToBase64(buf.subarray(pos, groupsEnd)) }

    for (let i = groupsEnd; i < buf.length; i++) { this.overflow[this.overflowLen++] = buf[i] }
    return res
  }

  /** @returns {string|undefined} The final quantum, padded per RFC 4648, for 1..2 leftover bytes. */
  end () {
    if (this.overflowLen === 0) { return }
    const res = bytesToBase64(this.overflow.subarray(0, this.overflowLen))
    this.overflowLen = 0
    return res
  }
}

/**
 * Hex encoder (hex text -> bytes). A byte is a 2-digit pair (RFC 4648, Section 8); like Buffer,
 * parsing stops at the first invalid pair and an odd trailing digit is carried over to the next
 * write() instead of being dropped as an incomplete pair mid-stream.
 */
class HexEncoder {
  /** @param {object} backend */
  constructor (backend) {
    this.backend = backend
    this.prevChar = ""
  }

  /**
   * @param {string} str
   * @returns {Buffer|Uint8Array}
   */
  write (str) {
    if (this.prevChar) {
      str = this.prevChar + str
      this.prevChar = ""
    }
    if (str.length % 2 !== 0) {
      this.prevChar = str[str.length - 1]
      str = str.slice(0, -1)
    }

    if (nodeBuffer) { return nodeBuffer.from(str, "hex") }
    const out = new Uint8Array(str.length >> 1)
    let pos = 0
    for (let i = 0; i < str.length; i += 2) {
      const hi = HEX_VALUES[str.charCodeAt(i) & 0xFF]
      const lo = HEX_VALUES[str.charCodeAt(i + 1) & 0xFF]
      if (hi < 0 || lo < 0) { break } // Stop at the first invalid pair, like Buffer.from(str, "hex").
      out[pos++] = (hi << 4) | lo
    }
    return this.backend.bytesToResult(out, pos)
  }

  /** @returns {void} A dangling lone digit is an incomplete pair, dropped like Buffer.from does. */
  end () {
    this.prevChar = ""
  }
}

/**
 * Hex decoder (bytes -> hex text): byte -> 2 lowercase digits. Stateless, so each chunk is
 * serialized as it comes in.
 */
class HexDecoder {
  /**
   * @param {Buffer|Uint8Array} buf
   * @returns {string}
   */
  write (buf) {
    if (nodeBuffer && nodeBuffer.isBuffer(buf)) { return buf.toString("hex") }
    if (HAS_TO_HEX) { return buf.toHex() }
    let res = ""
    for (let i = 0; i < buf.length; i++) { res += HEX_CHARS[buf[i]] }
    return res
  }

  /** @returns {void} */
  end () {}
}

exports.utf8 = Utf8Codec
// Alias UNICODE-1-1-UTF-8 (WHATWG maps it to UTF-8; pre-Unicode-2.0 UTF-8 differed only above BMP).
exports.unicode11utf8 = "utf8"

exports.cesu8 = Cesu8Codec

exports.binary = BinaryCodec
exports.base64 = Base64Codec
exports.hex = HexCodec
