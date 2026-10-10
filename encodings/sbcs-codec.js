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
    const defaultCharSingleByte = iconv.defaultCharSingleByte
    const defaultCharByte = typeof defaultCharSingleByte === "string" &&
      defaultCharSingleByte.length === 1
      ? defaultCharSingleByte.charCodeAt(0)
      : NaN
    if (defaultCharByte > 0xFF || Number.isNaN(defaultCharByte)) {
      throw new TypeError("defaultCharSingleByte must be a single-byte character")
    }
    const encodeBuf = iconv.backend.allocBytes(65536, defaultCharByte)

    for (let i = 0; i < codecOptions.chars.length; i++) {
      encodeBuf[codecOptions.chars.charCodeAt(i)] = i
    }

    this.encodeBuf = encodeBuf
    this.defaultCharByte = defaultCharByte
    this.defaultCharCode = codecOptions.chars.charCodeAt(defaultCharByte)
  }

  get encoder () { return SBCSEncoder }
  get decoder () { return SBCSDecoder }
}

class SBCSEncoder {
  constructor (opts, codec, backend) {
    this.backend = backend
    this.encodeBuf = codec.encodeBuf
    this.invalidCharHandler = opts && opts.invalidCharHandler
    this.defaultCharByte = codec.defaultCharByte
    this.defaultCharCode = codec.defaultCharCode
  }

  write (str) {
    const bytes = this.backend.allocBytes(str.length)
    const encodeBuf = this.encodeBuf
    const invalidCharHandler = this.invalidCharHandler

    if (typeof invalidCharHandler === "function") {
      const defaultCharByte = this.defaultCharByte
      const defaultCharCode = this.defaultCharCode
      let codePointIndex = 0

      for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i)
        const encodedByte = encodeBuf[charCode]

        // `encodeBuf` uses the default byte for unmappable chars. Allow the
        // codec character that genuinely maps to that byte.
        if (encodedByte !== defaultCharByte || charCode === defaultCharCode) {
          bytes[i] = encodedByte
          codePointIndex++
          continue
        }

        // Report a surrogate pair together rather than as two invalid code units.
        if (charCode >= 0xD800 && charCode <= 0xDBFF && i + 1 < str.length) {
          const nextCharCode = str.charCodeAt(i + 1)
          if (nextCharCode >= 0xDC00 && nextCharCode <= 0xDFFF) {
            if (invalidCharHandler(str.slice(i, i + 2), codePointIndex) === true) {
              return null
            }
            bytes[i] = encodedByte
            bytes[i + 1] = encodeBuf[nextCharCode]
            i++
            codePointIndex++
            continue
          }
        }

        if (invalidCharHandler(str.charAt(i), codePointIndex) === true) {
          return null
        }
        bytes[i] = encodedByte
        codePointIndex++
      }
    } else {
      for (let i = 0; i < str.length; i++)
      { bytes[i] = encodeBuf[str.charCodeAt(i)] }
    }

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
