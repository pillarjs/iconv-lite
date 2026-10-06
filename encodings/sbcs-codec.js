"use strict"

// Single-byte codec. Needs a 'chars' string parameter that contains 256 or 128 chars that
// correspond to encoded bytes (if 128 - then lower half is ASCII).

exports._sbcs = class SBCSCodec {
  constructor (codecOptions, iconv) {
    if (!codecOptions) {
      throw new Error("SBCS codec is called without the data.")
    }

    // Prepare char buffer for decoding.
    if (!codecOptions.chars || (codecOptions.chars.length !== 128 && codecOptions.chars.length !== 256)) {
      throw new Error("Encoding '" + codecOptions.type + "' has incorrect 'chars' (must be of len 128 or 256)")
    }

    if (codecOptions.chars.length === 128) {
      var asciiString = ""
      for (let i = 0; i < 128; i++) {
        asciiString += String.fromCharCode(i)
      }
      codecOptions.chars = asciiString + codecOptions.chars
    }

    const decodeBuf = new Uint16Array(codecOptions.chars.length)

    for (let i = 0; i < codecOptions.chars.length; i++) {
      decodeBuf[i] = codecOptions.chars.charCodeAt(i)
    }

    this.decodeBuf = decodeBuf

    // Encoding buffer.
    const encodeBuf = iconv.backend.allocBytes(65536, iconv.defaultCharSingleByte.charCodeAt(0))

    for (let i = 0; i < codecOptions.chars.length; i++) {
      const code = codecOptions.chars.charCodeAt(i)
      // Decode tables use U+FFFD for unassigned bytes. Encoding that
      // replacement back to those bytes produces output TextDecoder
      // rejects in fatal mode; keep the default "?" instead.
      if (code === 0xFFFD) continue
      encodeBuf[code] = i
    }

    this.encodeBuf = encodeBuf
  }

  get encoder () { return SBCSEncoder }
  get decoder () { return SBCSDecoder }
}

class SBCSEncoder {
  constructor (opts, codec, backend) {
    this.backend = backend
    this.encodeBuf = codec.encodeBuf
  }

  write (str) {
    const bytes = this.backend.allocBytes(str.length)

    for (let i = 0; i < str.length; i++)
    { bytes[i] = this.encodeBuf[str.charCodeAt(i)] }

    return this.backend.bytesToResult(bytes, bytes.length)
  }

  end () {}
}

class SBCSDecoder {
  constructor (opts, codec, backend) {
    this.decodeBuf = codec.decodeBuf
    this.backend = backend
  }

  write (buf) {
    // Strings are immutable in JS -> we use ucs2 buffer to speed up computations.
    const decodeBuf = this.decodeBuf
    const chars = this.backend.allocRawChars(buf.length)

    for (let i = 0; i < buf.length; i++) {
      chars[i] = decodeBuf[buf[i]]
    }
    return this.backend.rawCharsToResult(chars, chars.length)
  }

  end () {}
}
