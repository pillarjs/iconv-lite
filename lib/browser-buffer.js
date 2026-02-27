"use strict"

// Minimal Buffer shim for iconv-lite browser usage.
// Implements only the subset of Buffer API used by iconv-lite codecs.
// Extends Uint8Array so instanceof checks and standard web APIs work.

var textEncoder = new TextEncoder()
var textDecoder = new TextDecoder()

class BufferShim extends Uint8Array {
  // Prevent inherited methods (like map, filter) from creating BufferShim instances.
  static get [Symbol.species] () { return Uint8Array }

  static alloc (size, fill) {
    var buf = new BufferShim(size)
    if (fill !== undefined && fill !== 0) {
      buf.fill(fill)
    }
    return buf
  }

  static from (arg, encoding) {
    if (typeof arg === "string") {
      return BufferShim._fromString(arg, encoding)
    }
    // Uint8Array, Array, or other array-like
    var result = new BufferShim(arg.length)
    result.set(arg)
    return result
  }

  static _fromString (str, encoding) {
    if (!encoding || encoding === "utf8" || encoding === "utf-8") {
      var encoded = textEncoder.encode(str)
      var buf = new BufferShim(encoded.length)
      buf.set(encoded)
      return buf
    }

    if (encoding === "ucs2" || encoding === "ucs-2" ||
        encoding === "utf16le" || encoding === "utf-16le") {
      var buf = new BufferShim(str.length * 2)
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i)
        buf[i * 2] = code & 0xFF
        buf[i * 2 + 1] = (code >> 8) & 0xFF
      }
      return buf
    }

    if (encoding === "binary" || encoding === "latin1") {
      var buf = new BufferShim(str.length)
      for (var i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0xFF
      }
      return buf
    }

    if (encoding === "base64") {
      // Node.js is lenient with base64 - strip invalid chars and add padding
      var cleaned = str.replace(/[^A-Za-z0-9+/]/g, "")
      while (cleaned.length % 4 !== 0) cleaned += "="
      var binaryStr
      try { binaryStr = atob(cleaned) } catch (e) { binaryStr = "" }
      var buf = new BufferShim(binaryStr.length)
      for (var i = 0; i < binaryStr.length; i++) {
        buf[i] = binaryStr.charCodeAt(i)
      }
      return buf
    }

    if (encoding === "hex") {
      var len = str.length >> 1
      var buf = new BufferShim(len)
      for (var i = 0; i < len; i++) {
        buf[i] = parseInt(str.substr(i * 2, 2), 16)
      }
      return buf
    }

    if (encoding === "ascii") {
      var buf = new BufferShim(str.length)
      for (var i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0x7F
      }
      return buf
    }

    // Fallback to utf8
    return BufferShim._fromString(str, "utf8")
  }

  static concat (list) {
    var totalLength = 0
    for (var i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
    var result = new BufferShim(totalLength)
    var offset = 0
    for (var i = 0; i < list.length; i++) {
      result.set(list[i], offset)
      offset += list[i].length
    }
    return result
  }

  static isBuffer (obj) {
    return obj instanceof BufferShim
  }

  toString (encoding) {
    if (!encoding || encoding === "utf8" || encoding === "utf-8") {
      return textDecoder.decode(this)
    }

    if (encoding === "ucs2" || encoding === "ucs-2" ||
        encoding === "utf16le" || encoding === "utf-16le") {
      var result = ""
      var CHUNK = 8192
      var count = this.length >> 1
      for (var start = 0; start < count; start += CHUNK) {
        var end = Math.min(start + CHUNK, count)
        var codes = new Array(end - start)
        for (var i = start; i < end; i++) {
          codes[i - start] = this[i * 2] | (this[i * 2 + 1] << 8)
        }
        result += String.fromCharCode.apply(null, codes)
      }
      return result
    }

    if (encoding === "base64") {
      var binaryStr = ""
      for (var i = 0; i < this.length; i++) {
        binaryStr += String.fromCharCode(this[i])
      }
      return btoa(binaryStr)
    }

    if (encoding === "binary" || encoding === "latin1") {
      var result = ""
      for (var i = 0; i < this.length; i++) {
        result += String.fromCharCode(this[i])
      }
      return result
    }

    if (encoding === "hex") {
      var result = ""
      for (var i = 0; i < this.length; i++) {
        result += (this[i] < 16 ? "0" : "") + this[i].toString(16)
      }
      return result
    }

    if (encoding === "ascii") {
      var result = ""
      for (var i = 0; i < this.length; i++) {
        result += String.fromCharCode(this[i] & 0x7F)
      }
      return result
    }

    // Fallback to utf8
    return textDecoder.decode(this)
  }

  slice (start, end) {
    var sliced = Uint8Array.prototype.slice.call(this, start, end)
    Object.setPrototypeOf(sliced, BufferShim.prototype)
    return sliced
  }

  write (str, offset) {
    // Only used in utf7.js for writing ASCII strings at an offset.
    // Returns number of bytes written.
    if (offset === undefined) offset = 0
    var len = Math.min(str.length, this.length - offset)
    for (var i = 0; i < len; i++) {
      this[offset + i] = str.charCodeAt(i) & 0xFF
    }
    return len
  }

  readUInt16LE (offset) {
    return this[offset] | (this[offset + 1] << 8)
  }

  writeUInt32LE (value, offset) {
    this[offset] = value & 0xFF
    this[offset + 1] = (value >>> 8) & 0xFF
    this[offset + 2] = (value >>> 16) & 0xFF
    this[offset + 3] = (value >>> 24) & 0xFF
    return offset + 4
  }

  writeUInt32BE (value, offset) {
    this[offset] = (value >>> 24) & 0xFF
    this[offset + 1] = (value >>> 16) & 0xFF
    this[offset + 2] = (value >>> 8) & 0xFF
    this[offset + 3] = value & 0xFF
    return offset + 4
  }
}

module.exports = { Buffer: BufferShim }
