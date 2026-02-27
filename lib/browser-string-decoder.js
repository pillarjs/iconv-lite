"use strict"

// Minimal StringDecoder shim for iconv-lite browser usage.
// Replaces Node.js string_decoder module.
// Supports only the encodings used by iconv-lite's internal.js: utf8, ucs2, binary, base64, hex.

function BrowserStringDecoder (encoding) {
  this.encoding = normalizeEncoding(encoding)

  if (this.encoding === "utf8") {
    this._decoder = new TextDecoder("utf-8", { fatal: false })
  } else if (this.encoding === "ucs2") {
    this._lastByte = -1
  } else if (this.encoding === "base64") {
    this._remainder = null
  }
  // binary, hex, and ascii need no state
}

function normalizeEncoding (enc) {
  enc = (enc || "utf8").toLowerCase().replace(/[^a-z0-9]/g, "")
  if (enc === "utf8") return "utf8"
  if (enc === "ucs2" || enc === "utf16le") return "ucs2"
  if (enc === "binary" || enc === "latin1") return "binary"
  if (enc === "base64") return "base64"
  if (enc === "hex") return "hex"
  if (enc === "ascii") return "ascii"
  return "utf8" // fallback
}

BrowserStringDecoder.prototype.write = function (buf) {
  if (!buf || buf.length === 0) return ""

  switch (this.encoding) {
    case "utf8":
      return this._decoder.decode(buf, { stream: true })

    case "ucs2": {
      var str = ""
      var i = 0
      if (this._lastByte !== -1) {
        if (buf.length > 0) {
          str += String.fromCharCode(this._lastByte | (buf[0] << 8))
          i = 1
        }
        this._lastByte = -1
      }
      var end = buf.length
      if ((end - i) % 2 !== 0) {
        this._lastByte = buf[end - 1]
        end--
      }
      for (; i < end; i += 2) {
        str += String.fromCharCode(buf[i] | (buf[i + 1] << 8))
      }
      return str
    }

    case "binary": {
      var str = ""
      for (var i = 0; i < buf.length; i++) {
        str += String.fromCharCode(buf[i])
      }
      return str
    }

    case "base64": {
      var data = buf
      if (this._remainder) {
        var combined = new Uint8Array(this._remainder.length + buf.length)
        combined.set(this._remainder)
        combined.set(buf, this._remainder.length)
        data = combined
        this._remainder = null
      }
      var leftover = data.length % 3
      if (leftover > 0) {
        this._remainder = data.slice(data.length - leftover)
        data = data.slice(0, data.length - leftover)
      }
      if (data.length === 0) return ""
      var binaryStr = ""
      for (var i = 0; i < data.length; i++) {
        binaryStr += String.fromCharCode(data[i])
      }
      return btoa(binaryStr)
    }

    case "hex": {
      var str = ""
      for (var i = 0; i < buf.length; i++) {
        str += (buf[i] < 16 ? "0" : "") + buf[i].toString(16)
      }
      return str
    }

    case "ascii": {
      var str = ""
      for (var i = 0; i < buf.length; i++) {
        str += String.fromCharCode(buf[i] & 0x7F)
      }
      return str
    }

    default:
      return ""
  }
}

BrowserStringDecoder.prototype.end = function (buf) {
  var res = ""

  if (buf && buf.length > 0) {
    if (this.encoding === "utf8") {
      // Final call without stream:true to flush
      res = this._decoder.decode(buf)
    } else {
      res = this.write(buf)
    }
  } else if (this.encoding === "utf8") {
    // Flush any remaining incomplete bytes
    res = this._decoder.decode()
  }

  // Flush buffered state
  if (this.encoding === "ucs2" && this._lastByte !== -1) {
    this._lastByte = -1
  }

  if (this.encoding === "base64" && this._remainder) {
    var binaryStr = ""
    for (var i = 0; i < this._remainder.length; i++) {
      binaryStr += String.fromCharCode(this._remainder[i])
    }
    res += btoa(binaryStr)
    this._remainder = null
  }

  return res
}

module.exports = { StringDecoder: BrowserStringDecoder }
