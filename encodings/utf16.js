"use strict"

// == UTF16-LE / UTF16-BE codecs ===============================================
//
// Decoding uses the WHATWG-standard TextDecoder (available in both Node and browsers), so it
// conforms to the Encoding Standard's "shared UTF-16 decoder": invalid input (lone/unpaired
// surrogates, a trailing odd byte) is replaced with U+FFFD ('�'). This also makes the Node and Web
// backends behave identically, so the decoder no longer depends on the backend.
//
// Note: the Encoding Standard defines no UTF-16 *encoder* (only UTF-8), so the encoders below are an
// iconv-lite extension; they pass lone surrogates through and use the backend only for the final
// "bytes -> result" step, so that encoding keeps returning a Buffer in Node.

// == UTF16-LE codec. ==========================================================

class Utf16LECodec {
  createEncoder (options, iconv) {
    return new Utf16LEEncoder(iconv.backend)
  }

  createDecoder (options, iconv) {
    return new Utf16EndianDecoder("utf-16le", options)
  }

  get bomAware () { return true }
}

// == UTF16-BE codec. ==========================================================

class Utf16BECodec {
  createEncoder (options, iconv) {
    return new Utf16BEEncoder(iconv.backend)
  }

  createDecoder (options, iconv) {
    return new Utf16EndianDecoder("utf-16be", options)
  }

  get bomAware () { return true }
}

// == Encoders =================================================================

class Utf16LEEncoder {
  constructor (backend) {
    this.backend = backend
  }

  write (str) {
    // On little-endian platforms (assumed throughout this lib) a Uint16Array view writes the
    // code units in the correct byte order directly.
    const bytes = new Uint8Array(str.length * 2)
    const chars = new Uint16Array(bytes.buffer, 0, str.length)
    for (let i = 0; i < str.length; i++) {
      chars[i] = str.charCodeAt(i)
    }
    return this.backend.bytesToResult(bytes, bytes.length)
  }

  end () {}
}

class Utf16BEEncoder {
  constructor (backend) {
    this.backend = backend
  }

  write (str) {
    const bytes = new Uint8Array(str.length * 2)
    let pos = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      bytes[pos++] = char >> 8
      bytes[pos++] = char & 0xff
    }
    return this.backend.bytesToResult(bytes, pos)
  }

  end () {}
}

// == Decoder (shared between LE and BE) =======================================
// Thin wrapper over the WHATWG TextDecoder, which implements the Encoding Standard's shared UTF-16
// decoder. Streaming (chunk boundaries, split code units and split surrogate pairs) and U+FFFD
// replacement of invalid input are handled by TextDecoder itself.
// `ignoreBOM: true` leaves BOM stripping to iconv-lite's BOM handling (these codecs are bomAware).

class Utf16EndianDecoder {
  constructor (label, options) {
    // Opt-in WHATWG "fatal" mode: throw on invalid input instead of replacing with U+FFFD.
    // Default (fatal: false) matches TextDecoder's default and iconv-lite's lenient behavior.
    this.decoder = new TextDecoder(label, { ignoreBOM: true, fatal: !!(options && options.fatal) })
  }

  write (buf) {
    return this.decoder.decode(buf, { stream: true })
  }

  end () {
    const res = this.decoder.decode()
    return res.length > 0 ? res : undefined
  }
}

// == UTF-16 codec =============================================================
// iconv-lite extension (NOT WHATWG: the Encoding Standard maps the "utf-16" label straight to
// UTF-16LE). The decoder chooses automatically from UTF-16LE and UTF-16BE using the BOM and a
// space-based heuristic, defaulting to UTF-16LE (prevalent and the default in Node).
// http://en.wikipedia.org/wiki/UTF-16 and http://encoding.spec.whatwg.org/#utf-16le
// Decoder default can be changed: iconv.decode(buf, 'utf16', {defaultEncoding: 'utf-16be'});

// Encoder uses UTF-16LE and prepends BOM (which can be overridden with addBOM: false).

class Utf16Codec {
  createEncoder (options, iconv) {
    options = options || {}
    if (options.addBOM === undefined)
    { options.addBOM = true }
    return iconv.getEncoder("utf-16le", options)
  }

  createDecoder (options, iconv) {
    return new Utf16Decoder(options, iconv)
  }
}

class Utf16Decoder {
  constructor (options, iconv) {
    this.decoder = null
    this.initialBufs = []
    this.initialBufsLen = 0

    this.options = options || {}
    this.iconv = iconv
  }

  write (buf) {
    if (!this.decoder) {
      // Codec is not chosen yet. Accumulate initial bytes.
      this.initialBufs.push(buf)
      this.initialBufsLen += buf.length

      // We need more bytes to use space heuristic (see below)
      if (this.initialBufsLen < 16) {
        return ""
      }

      // We have enough bytes -> detect endianness.
      return this._detectEndiannessAndSetDecoder()
    }

    return this.decoder.write(buf)
  }

  end () {
    if (!this.decoder) {
      return this._detectEndiannessAndSetDecoder() + (this.decoder.end() || "")
    }
    return this.decoder.end()
  }

  _detectEndiannessAndSetDecoder () {
    const encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding)
    this.decoder = this.iconv.getDecoder(encoding, this.options)

    const resStr = this.initialBufs.reduce((a, b) => a + this.decoder.write(b), "")
    this.initialBufs.length = this.initialBufsLen = 0
    return resStr
  }
}

function detectEncoding (bufs, defaultEncoding) {
  const b = []
  let charsProcessed = 0
  let asciiCharsLE = 0; let asciiCharsBE = 0 // Number of ASCII chars when decoded as LE or BE.

  outerLoop:
  for (let i = 0; i < bufs.length; i++) {
    const buf = bufs[i]
    for (let j = 0; j < buf.length; j++) {
      b.push(buf[j])
      if (b.length === 2) {
        if (charsProcessed === 0) {
          // Check BOM first.
          if (b[0] === 0xFF && b[1] === 0xFE) return "utf-16le"
          if (b[0] === 0xFE && b[1] === 0xFF) return "utf-16be"
        }

        if (b[0] === 0 && b[1] !== 0) asciiCharsBE++
        if (b[0] !== 0 && b[1] === 0) asciiCharsLE++

        b.length = 0
        charsProcessed++

        if (charsProcessed >= 100) {
          break outerLoop
        }
      }
    }
  }

  // Make decisions.
  // Most of the time, the content has ASCII chars (U+00**), but the opposite (U+**00) is uncommon.
  // So, we count ASCII as if it was LE or BE, and decide from that.
  if (asciiCharsBE > asciiCharsLE) return "utf-16be"
  if (asciiCharsBE < asciiCharsLE) return "utf-16le"

  // Couldn't decide (likely all zeros or not enough data).
  return defaultEncoding || "utf-16le"
}

// == Exports ==================================================================

exports.utf16le = Utf16LECodec
// Aliases that the WHATWG Encoding Standard maps to UTF-16LE (keys are canonicalized labels).
exports.ucs2 = "utf16le"
exports.unicode = "utf16le"
exports.csunicode = "utf16le"
exports.iso10646ucs2 = "utf16le"
exports.unicodefeff = "utf16le"

exports.utf16be = Utf16BECodec
// Alias that the WHATWG Encoding Standard maps to UTF-16BE.
exports.unicodefffe = "utf16be"

exports.utf16 = Utf16Codec
