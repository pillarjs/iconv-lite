"use strict"

// EUC-JP codec.
//
// Decoding uses the WHATWG-standard TextDecoder("euc-jp") (available in Node and browsers), which
// maps every valid sequence (ASCII, half-width katakana, JIS X 0208 two-byte and JIS X 0212
// three-byte) identically to iconv-lite's previous baked table, so that table (encodings/tables/
// eucjp.json) is no longer shipped. Node and Web decode identically.
//
// The WHATWG EUC-JP encoder only emits JIS X 0208 (its index is jis0208), so it cannot encode the
// JIS X 0212 characters the decoder accepts. iconv-lite keeps encoding them (as the old table did),
// so the encoder builds a reverse map from the full decoder index instead. When a character has
// several valid encodings the earliest one in index order wins; the emitted bytes can differ from
// the old table for a few duplicate-mapped characters, but always round-trip back to the same
// character.
//
// Spec: https://encoding.spec.whatwg.org/#euc-jp (the "EUC-JP decoder" and "EUC-JP encoder"
// algorithms; the index is jis0208 plus the 0x8F-prefixed JIS X 0212 plane).

const LABEL = "euc-jp"
const DEFAULT_BYTE = 0x3f // '?'
const REPLACEMENT = "�"

// Node's ICU euc-jp decoder passes the unused C1 bytes (0x80-0x8D, 0x90-0x9F) through as
// U+0080-U+009F, but the WHATWG euc-jp decoder treats them as errors. No valid EUC-JP sequence ever
// produces a C1 character, so any C1 in the output came from one of those invalid bytes; bring the
// result in line with the spec (and browsers / the old table). Regexes are built from char codes to
// keep the source ASCII-only.
const C1_RANGE = "[" + String.fromCharCode(0x80) + "-" + String.fromCharCode(0x9f) + "]"
const C1_TEST = new RegExp(C1_RANGE)
const C1_REPLACE = new RegExp(C1_RANGE, "g")

class EucJpCodec {
  createEncoder (options, iconv) {
    // The codec instance is cached per encoding, so build the reverse table only once.
    if (!this.encodeTable) { this.encodeTable = buildEncodeTable() }
    return new EucJpEncoder(this.encodeTable, iconv.backend)
  }

  createDecoder (options) {
    return new EucJpDecoder(options)
  }
}

// Pack a 1-3 byte sequence into one 32-bit value for fast encoding: byte count in bits 24-31, then
// the bytes in bits 16-23, 8-15, 0-7. 0 means "no mapping" (a mapped value always has count >= 1).
function pack (seq) {
  return (seq.length << 24) | (seq[0] << 16) | ((seq[1] || 0) << 8) | (seq[2] || 0)
}

// code unit (0x0000..0xFFFF) -> packed byte sequence, as a Uint32Array (see pack()). The comments
// map each part to the steps of the WHATWG EUC-JP encoder (https://encoding.spec.whatwg.org/#euc-jp-encoder).
// Step 1 (end-of-queue -> finished) is handled by the encoder's write loop, not here.
function buildEncodeTable () {
  const dec = new TextDecoder(LABEL)
  const table = new Uint32Array(0x10000)

  // Record the byte sequence for the character it decodes to (first/earliest sequence wins). This
  // covers the steps whose output is simply "the bytes that decode back to the character".
  const put = (seq) => {
    const s = dec.decode(Uint8Array.from(seq))
    if (s.length === 1 && s !== REPLACEMENT && table[s.charCodeAt(0)] === 0) {
      table[s.charCodeAt(0)] = pack(seq)
    }
  }

  // Step 2: an ASCII code point encodes to the byte of the same value.
  for (let b = 0; b < 0x80; b++) { put([b]) }
  // Step 5: U+FF61..U+FF9F (half-width katakana) encode to 0x8E, code point - 0xFF61 + 0xA1.
  for (let t = 0xa1; t <= 0xdf; t++) { put([0x8e, t]) }
  // Step 7: look the code point up in index jis0208 (two bytes, lead/trail in 0xA1..0xFE).
  for (let l = 0xa1; l <= 0xfe; l++) { for (let t = 0xa1; t <= 0xfe; t++) { put([l, t]) } }
  // iconv-lite extension (the spec encoder only does jis0208): JIS X 0212, prefixed with 0x8F.
  for (let l = 0xa1; l <= 0xfe; l++) { for (let t = 0xa1; t <= 0xfe; t++) { put([0x8f, l, t]) } }

  // Steps 3, 4 and 6 map characters that NO byte decodes to, so the loops above can't capture them;
  // add them explicitly (they take precedence over the index lookup, as in the spec's step order).
  table[0x00a5] = pack([0x5c]) // Step 3: U+00A5 (YEN SIGN) -> 0x5C. Encode-only; decoder gives '\' for 0x5C.
  table[0x203e] = pack([0x7e]) // Step 4: U+203E (OVERLINE) -> 0x7E. Encode-only; decoder gives '~' for 0x7E.
  table[0x2212] = table[0xff0d] // Step 6: U+2212 (MINUS SIGN) -> encode as U+FF0D (FULLWIDTH HYPHEN-MINUS).
  return table
}

class EucJpEncoder {
  constructor (encodeTable, backend) {
    this.encodeTable = encodeTable
    this.backend = backend
  }

  write (str) {
    const table = this.encodeTable
    const bytes = this.backend.allocBytes(str.length * 3) // worst case: 3 bytes per character.
    let pos = 0
    for (let i = 0; i < str.length; i++) {
      const v = table[str.charCodeAt(i)]
      if (v === 0) { bytes[pos++] = DEFAULT_BYTE; continue } // unmapped -> '?'
      const len = v >>> 24
      bytes[pos++] = (v >>> 16) & 0xff
      if (len > 1) {
        bytes[pos++] = (v >>> 8) & 0xff
        if (len > 2) { bytes[pos++] = v & 0xff }
      }
    }
    return this.backend.bytesToResult(bytes, pos)
  }

  end () {}
}

// Thin wrapper over TextDecoder; multi-byte sequences split across chunks are reassembled by
// TextDecoder itself via { stream: true }. A trailing incomplete sequence is flushed in end().
class EucJpDecoder {
  constructor (options) {
    this.fatal = !!(options && options.fatal)
    this.decoder = new TextDecoder(LABEL, { fatal: this.fatal })
  }

  write (buf) {
    return this._conform(this.decoder.decode(buf, { stream: true }))
  }

  end () {
    const res = this._conform(this.decoder.decode())
    return res.length > 0 ? res : undefined
  }

  // Replace (or, in fatal mode, reject) the C1 characters that Node's decoder leaks for invalid
  // bytes, so the codec matches the WHATWG spec. Valid output never contains C1, so the common path
  // returns the string untouched.
  _conform (str) {
    if (!C1_TEST.test(str)) { return str }
    if (this.fatal) { throw new TypeError("The encoded data was not valid for encoding " + LABEL) }
    return str.replace(C1_REPLACE, REPLACEMENT)
  }
}

exports.eucjp = EucJpCodec
