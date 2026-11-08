import type { Backend, EncodeOptions, EncoderStream } from "./iconv.js"

type InvalidCharHandler = NonNullable<EncodeOptions["invalidCharHandler"]>

export const DEFAULT_CHAR_BYTE = 0x3F

// The fallback is internal; callers configure each encoder through options.
export function getDefaultCharByte (options: EncodeOptions | undefined) {
  const byte = options?.defaultCharByte
  if (byte === undefined) return DEFAULT_CHAR_BYTE
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xFF) {
    throw new TypeError("defaultCharByte must be an integer between 0 and 255")
  }
  return byte
}

// State belongs to an encoder, never to a cached codec or its mapping tables.
export class EncodingHandler {
  #callback: InvalidCharHandler
  #encoding: string
  #pending: { char: string, index: number } | null = null

  constructor (callback: InvalidCharHandler, encoding: string) {
    this.#callback = callback
    this.#encoding = encoding
  }

  get hasPending () { return this.#pending !== null }

  clear () { this.#pending = null }

  * read (str: string, final = false) {
    if (str.length === 0 && !final) return
    const pending = this.#pending
    this.#pending = null
    if (pending) str = pending.char + str

    let index = 0
    for (let offset = 0; offset < str.length;) {
      const previous = pending !== null && offset === 0
      const position = previous ? pending.index : index
      const code = str.codePointAt(offset)!
      const char = String.fromCodePoint(code)
      if (!final && code >= 0xD800 && code <= 0xDBFF && offset + 1 === str.length) {
        this.#pending = { char, index: position }
        return
      }
      yield { char, index: position }
      offset += char.length
      if (!previous || char.length === 2) index++
    }
  }

  resolve (char: string, index: number) {
    const result = this.#callback(char, index)
    if (result === true) return null
    if (result === undefined || result === false) return undefined
    if (typeof result === "string") return result
    throw new TypeError("invalidCharHandler must return a string, boolean, or undefined")
  }

  replacementError (char: string, index: number) {
    return new TypeError("Replacement " + JSON.stringify(char) + " cannot be encoded in " + this.#encoding + " at index " + index)
  }
}

// Only the opt-in handler path needs a growing output buffer.
export class EncodingBuffer<Bytes extends Uint8Array> {
  #backend: Backend<Bytes>
  #bytes: Uint8Array
  #length = 0

  constructor (backend: Backend<Bytes>, capacity = 32) {
    this.#backend = backend
    this.#bytes = backend.allocBytes(Math.max(32, capacity))
  }

  writeByte (byte: number) {
    if (this.#length === this.#bytes.length) {
      const grown = this.#backend.allocBytes(this.#bytes.length * 2)
      grown.set(this.#bytes)
      this.#bytes = grown
    }
    this.#bytes[this.#length++] = byte
  }

  writeCode (code: number) {
    if (code > 0xFFFFFF) this.writeByte(code >>> 24)
    if (code > 0xFFFF) this.writeByte(code >>> 16)
    if (code > 0xFF) this.writeByte(code >>> 8)
    this.writeByte(code)
  }

  finish () { return this.#backend.bytesToResult(this.#bytes, this.#length) }
}

// Validate before delegating a write, keeping the native encoder's state unchanged
// if the handler cancels. Original source positions never include replacement text.
export class TextEncoderWithHandler<Bytes extends Uint8Array> {
  #encoder: EncoderStream<Bytes, false>
  #backend: Backend<Bytes>
  #handler: EncodingHandler
  #representable: (char: string) => boolean
  #fallback: string | undefined

  constructor (encoder: EncoderStream<Bytes, false>, backend: Backend<Bytes>, callback: InvalidCharHandler, encoding: string, representable: (char: string) => boolean, fallback?: string) {
    this.#encoder = encoder
    this.#backend = backend
    this.#handler = new EncodingHandler(callback, encoding)
    this.#representable = representable
    this.#fallback = fallback
  }

  #prepare (str: string, final: boolean) {
    const pieces = []
    try {
      for (const { char, index } of this.#handler.read(str, final)) {
        if (this.#representable(char)) {
          pieces.push(char)
          continue
        }
        const replacement = this.#handler.resolve(char, index)
        if (replacement === null) {
          this.#handler.clear()
          return null
        }
        if (replacement === undefined) {
          // Finalize malformed Unicode here so the native encoder cannot buffer
          // another surrogate outside the handler's cancellation state.
          pieces.push(this.#fallback ?? char)
        } else {
          for (const replacementChar of replacement) {
            if (!this.#representable(replacementChar)) throw this.#handler.replacementError(replacementChar, index)
          }
          pieces.push(replacement)
        }
      }
      return pieces.join("")
    } catch (error) {
      this.#handler.clear()
      throw error
    }
  }

  write (str: string) {
    const prepared = this.#prepare(str, false)
    return prepared === null ? null : this.#encoder.write(prepared)
  }

  // Used by the BOM wrapper: validate only user input and commit the BOM together
  // with a successful write. Cancellation must not consume the pending BOM.
  writeWithBOM (str: string) {
    const prepared = this.#prepare(str, false)
    return prepared === null ? null : this.#encoder.write("\uFEFF" + prepared)
  }

  end () {
    const prepared = this.#prepare("", true)
    if (prepared === null) return null
    const head = prepared.length ? this.#encoder.write(prepared) : undefined
    const tail = this.#encoder.end()
    if (head?.length && tail?.length) return this.#backend.concatByteResults([head, tail])
    return head?.length ? head : tail
  }
}

export function isUnicodeScalar (char: string) {
  const code = char.codePointAt(0)!
  return code < 0xD800 || code > 0xDFFF
}

export function isBinaryCharacter (char: string) {
  return char.length === 1 && char.charCodeAt(0) <= 0xFF
}
