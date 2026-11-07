import * as nano from "iconv-nano"
import { createSinglebyteEncoder, createSinglebyteDecoder } from "@exodus/bytes/single-byte.js"
import { createMultibyteEncoder, createMultibyteDecoder } from "@exodus/bytes/multi-byte.js"
import { utf8fromStringLoose, utf8toStringLoose } from "@exodus/bytes/utf8.js"
import { utf16fromString, utf16toStringLoose } from "@exodus/bytes/utf16.js"

const empty = new Uint8Array(0)

// Keep the benchmark labels while selecting the equivalent public codec names.
export function canonicalEncoding (encoding) {
  return { big5hkscs: "big5", eucjp: "euc-jp", cp949: "euc-kr" }[encoding] || encoding
}

function exodusCodec (encoding) {
  if (encoding === "utf8") {
    return { encode: utf8fromStringLoose, decode: utf8toStringLoose }
  }
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    const format = encoding === "utf-16le" ? "uint8-le" : "uint8-be"
    return {
      encode: string => utf16fromString(string, format),
      decode: bytes => utf16toStringLoose(bytes, format)
    }
  }
  if (encoding === "windows-1251") {
    return {
      encode: createSinglebyteEncoder(encoding),
      decode: createSinglebyteDecoder(encoding, true)
    }
  }
  if (["gbk", "gb18030", "big5", "shift_jis", "euc-jp", "euc-kr"].includes(encoding)) {
    return {
      encode: createMultibyteEncoder(encoding),
      decode: createMultibyteDecoder(encoding, true),
      decodeChunks (bytes) {
        const decode = createMultibyteDecoder(encoding, true)
        let result = ""
        for (let i = 0; i < bytes.length; i++) result += decode(bytes.subarray(i, i + 1), true)
        return result + decode(empty)
      }
    }
  }
}

function nanoCodec (encoding) {
  const codec = nano[encoding.replaceAll("-", "_")]
  if (!codec) return
  return {
    // iconv-lite's automatic UTF-32 encoding adds a BOM by default.
    encode: encoding === "utf-32" ? string => codec.encode(string, { addBOM: true }) : codec.encode,
    decode: codec.decode
    // iconv-nano has no public incremental decoder API.
  }
}

export function competitors (encoding) {
  const canonical = canonicalEncoding(encoding)
  return [
    { name: "@exodus/bytes", ...exodusCodec(canonical) },
    { name: "iconv-nano", ...nanoCodec(canonical) }
  ]
}
