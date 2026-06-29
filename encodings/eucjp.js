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
    // The codec instance is cached per encoding, so build the reverse map only once.
    if (!this.encodeMap) { this.encodeMap = buildEncodeMap() }
    return new EucJpEncoder(this.encodeMap, iconv.backend)
  }

  createDecoder (options) {
    return new EucJpDecoder(options)
  }
}

// code unit (0x0000..0xFFFF) -> byte sequence (array). Built by decoding every valid EUC-JP byte
// sequence once; first (lowest index-order) sequence wins for characters with duplicates.
function buildEncodeMap () {
  const dec = new TextDecoder(LABEL)
  const map = new Array(0x10000).fill(null)

  const put = (seq) => {
    const s = dec.decode(Uint8Array.from(seq))
    if (s.length === 1 && s !== REPLACEMENT && map[s.charCodeAt(0)] === null) {
      map[s.charCodeAt(0)] = seq
    }
  }

  for (let b = 0; b < 0x80; b++) { put([b]) } // ASCII
  for (let t = 0xa1; t <= 0xdf; t++) { put([0x8e, t]) } // half-width katakana
  for (let l = 0xa1; l <= 0xfe; l++) { for (let t = 0xa1; t <= 0xfe; t++) { put([l, t]) } } // JIS X 0208
  for (let l = 0xa1; l <= 0xfe; l++) { for (let t = 0xa1; t <= 0xfe; t++) { put([0x8f, l, t]) } } // JIS X 0212

  // Special cases from the WHATWG EUC-JP encoder that decode-inversion can't recover, because no
  // byte decodes to these characters (see https://encoding.spec.whatwg.org/#euc-jp-encoder):
  //   steps 3-4: YEN SIGN / OVERLINE encode to 0x5C / 0x7E (JIS X 0201); encode-only, since the
  //              decoder maps those bytes back to ASCII '\' and '~'.
  //   step 6:    MINUS SIGN (U+2212) is encoded like FULLWIDTH HYPHEN-MINUS (U+FF0D).
  map[0x00a5] = [0x5c]
  map[0x203e] = [0x7e]
  map[0x2212] = map[0xff0d]
  return map
}

class EucJpEncoder {
  constructor (encodeMap, backend) {
    this.encodeMap = encodeMap
    this.backend = backend
  }

  write (str) {
    const bytes = this.backend.allocBytes(str.length * 3) // worst case: 3 bytes per character.
    let pos = 0
    for (let i = 0; i < str.length; i++) {
      const seq = this.encodeMap[str.charCodeAt(i)]
      if (seq) {
        for (let j = 0; j < seq.length; j++) { bytes[pos++] = seq[j] }
      } else {
        bytes[pos++] = DEFAULT_BYTE
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
