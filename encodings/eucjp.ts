import type { Backend, WebIconv, EncodeOptions, DecodeOptions } from "../lib/iconv.js"
import { getDefaultCharByte, TextEncoderWithHandler } from "../lib/encoding-handler.js"
import { getDefaultCharUnicode, replaceDecodeErrors, asciiPrefixLength } from "../lib/decoding.js"
import { getJis0208, getJis0212 } from "./jis.js"

type EncodeTable = Uint32Array[]
let encodeTable: EncodeTable | undefined

function getEncodeTable () {
  if (encodeTable) return encodeTable
  const empty = new Uint32Array(256)
  const table: EncodeTable = new Array(256).fill(empty)
  function set (code: number, value: number) {
    const page = code >>> 8
    if (table[page] === empty) table[page] = new Uint32Array(256)
    table[page][code & 0xFF] = value
  }
  // Keep the historical trie order: JIS X 0212 wins over duplicate JIS X 0208
  // mappings. Changing this preference would change existing encoded output.
  for (const [index, prefix] of [[getJis0212(), 0x8F0000], [getJis0208(), 0]] as const) {
    for (let pointer = 0; pointer < index.length; pointer++) {
      const code = index[pointer]
      if (code && !table[code >>> 8][code & 0xFF]) {
        set(code, prefix | ((0xA1 + Math.floor(pointer / 94)) << 8) | (0xA1 + pointer % 94))
      }
    }
  }
  for (let code = 0xFF61; code <= 0xFF9F; code++) set(code, 0x8EA1 + code - 0xFF61)
  set(0xA5, 0x5C)
  set(0x203E, 0x7E)
  encodeTable = table
  return table
}

class EucJpCodec {
  createEncoder<Bytes extends Uint8Array> (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    const table = getEncodeTable()
    const encoder = new EucJpEncoder(table, iconv.backend, getDefaultCharByte(options))
    return typeof options?.invalidCharHandler === "function"
      ? new TextEncoderWithHandler(encoder, iconv.backend, options.invalidCharHandler, "eucjp",
        char => {
          const code = char.charCodeAt(0)
          return char.length === 1 && (code < 0x80 || table[code >>> 8][code & 0xFF] !== 0)
        }, "\uFFFD")
      : encoder
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) {
    return new EucJpDecoder(iconv.backend, options)
  }
}

class EucJpEncoder<Bytes extends Uint8Array> {
  #table: EncodeTable
  #backend: Backend<Bytes>
  #replacement: number
  #lead = false

  constructor (table: EncodeTable, backend: Backend<Bytes>, replacement: number) {
    this.#table = table
    this.#backend = backend
    this.#replacement = replacement
  }

  write (str: string): Bytes {
    if (str.length >= 64 && !this.#lead) {
      const nonAscii = str.search(/[\u0080-\uFFFF]/)
      if (nonAscii === -1) return this.#backend.encodeString(str, "utf8")
      if (nonAscii >= 64) {
        return this.#backend.concatByteResults([
          this.#backend.encodeString(str.slice(0, nonAscii), "utf8"), this.write(str.slice(nonAscii))
        ])
      }
    }
    const bytes = this.#backend.allocBytes((str.length + Number(this.#lead)) * 3)
    const table = this.#table
    const replacement = this.#replacement
    let pos = 0
    let start = 0
    if (this.#lead && str.length) {
      this.#lead = false
      bytes[pos++] = replacement
      const first = str.charCodeAt(0)
      if (first >= 0xDC00 && first <= 0xDFFF) start = 1
    }
    for (let i = start; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code < 0x80) { bytes[pos++] = code; continue }
      const mapped = table[code >>> 8][code & 0xFF]
      if (mapped === 0) {
        // Only unmapped characters can be surrogates. Keep their state handling
        // out of the common mapped-character path, replacing a pair just once.
        if (code >= 0xD800 && code <= 0xDBFF) {
          if (i + 1 === str.length) { this.#lead = true; break }
          const next = str.charCodeAt(i + 1)
          if (next >= 0xDC00 && next <= 0xDFFF) i++
        }
        bytes[pos++] = replacement
        continue
      }
      if (mapped > 0xFFFF) bytes[pos++] = mapped >>> 16
      if (mapped > 0xFF) bytes[pos++] = mapped >>> 8
      bytes[pos++] = mapped
    }
    return this.#backend.bytesToResult(bytes, pos)
  }

  end () {
    if (!this.#lead) return undefined
    this.#lead = false
    return this.#backend.bytesToResult(new Uint8Array([this.#replacement]), 1)
  }
}

class EucJpDecoder {
  #backend: Backend
  #jis0208 = getJis0208()
  #jis0212 = getJis0212()
  #lead = 0
  #plane = false
  #pending: Uint8Array | undefined
  #replacement: string
  #fatal: boolean

  constructor (backend: Backend, options: DecodeOptions | undefined) {
    this.#backend = backend
    this.#replacement = getDefaultCharUnicode(options)
    this.#fatal = !!options?.fatal
  }

  write (input: Uint8Array): string {
    if (this.#pending) {
      const merged = new Uint8Array(this.#pending.length + input.length)
      merged.set(this.#pending)
      merged.set(input, this.#pending.length)
      this.#pending = undefined
      input = merged
    }
    if (!input.length) return ""
    if (!this.#lead && input.length >= 64) {
      if ((input[0] | input[input.length - 1]) < 0x80 && this.#backend.isAscii?.(input)) {
        return this.#backend.decodeBytes(input, "binary")
      }
      const prefix = asciiPrefixLength(input)
      if (prefix === input.length) return this.#backend.decodeBytes(input, "binary")
      if (prefix >= 64) return this.#backend.decodeBytes(input.subarray(0, prefix), "binary") + this.write(input.subarray(prefix))
    }
    const chars = this.#backend.allocRawChars(input.length + Number(this.#lead !== 0))
    const errors = this.#replacement === "\uFFFD" ? undefined : [] as number[]
    let pos = 0
    let lead = this.#lead
    let plane = this.#plane
    for (let i = 0; i < input.length; i++) {
      const byte = input[i]
      let code = 0
      if (lead) {
        if (lead === 0x8F && byte >= 0xA1 && byte <= 0xFE) {
          lead = byte
          plane = true
          continue
        }
        if (lead === 0x8E) {
          if (byte >= 0xA1 && byte <= 0xDF) code = 0xFF61 + byte - 0xA1
        } else if (lead >= 0xA1 && byte >= 0xA1 && byte <= 0xFE) {
          code = (plane ? this.#jis0212 : this.#jis0208)[(lead - 0xA1) * 94 + byte - 0xA1]
        }
        lead = 0
        plane = false
        if (!code && byte < 0x80) i-- // Restore ASCII after an invalid sequence.
      } else if (byte < 0x80) {
        chars[pos++] = byte
        continue
      } else if (byte === 0x8E || byte === 0x8F || (byte >= 0xA1 && byte <= 0xFE)) {
        // Consume complete, assigned JIS X 0208 pairs without entering the
        // incremental lead-byte state. Invalid or split pairs use the path above.
        if (byte >= 0xA1) {
          const trail = input[i + 1]
          if (trail >= 0xA1 && trail <= 0xFE) {
            const mapped = this.#jis0208[(byte - 0xA1) * 94 + trail - 0xA1]
            if (mapped) {
              chars[pos++] = mapped
              i++
              continue
            }
          }
        }
        lead = byte
        continue
      }
      if (!code) {
        if (this.#fatal) {
          this.#lead = 0
          this.#plane = false
          this.#pending = new Uint8Array(input.subarray(i + 1))
          throw new TypeError("Invalid multibyte sequence")
        }
        code = 0xFFFD
        errors?.push(pos)
      }
      chars[pos++] = code
    }
    this.#lead = lead
    this.#plane = plane
    return replaceDecodeErrors(this.#backend.rawCharsToResult(chars, pos), errors, this.#replacement)
  }

  end () {
    try {
      const result = this.#pending ? this.write(new Uint8Array(0)) : ""
      if (!this.#lead) return result
      if (this.#fatal) throw new TypeError("Invalid multibyte sequence")
      return result + this.#replacement
    } finally {
      this.#lead = 0
      this.#plane = false
      this.#pending = undefined
    }
  }
}

export const eucjp = EucJpCodec
