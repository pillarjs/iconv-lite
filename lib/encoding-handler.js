// State belongs to an encoder, never to a cached codec or its mapping tables.
export class EncodingHandler {
  #callback
  #encoding
  #pending = null

  constructor (callback, encoding) {
    this.#callback = callback
    this.#encoding = encoding
  }

  get hasPending () { return this.#pending !== null }

  clear () { this.#pending = null }

  * read (str, final = false) {
    if (str.length === 0 && !final) return
    const pending = this.#pending
    this.#pending = null
    if (pending) str = pending.char + str

    let index = 0
    for (let offset = 0; offset < str.length;) {
      const previous = pending !== null && offset === 0
      const position = previous ? pending.index : index
      const code = str.codePointAt(offset)
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

  resolve (char, index) {
    const result = this.#callback(char, index)
    if (result === true) return null
    if (result === undefined || result === false) return undefined
    if (typeof result === "string") return result
    throw new TypeError("invalidCharHandler must return a string, boolean, or undefined")
  }

  replacementError (char, index) {
    return new TypeError("Replacement " + JSON.stringify(char) + " cannot be encoded in " + this.#encoding + " at index " + index)
  }
}

// Only the opt-in handler path needs a growing output buffer.
export class EncodingBuffer {
  #backend
  #bytes
  #length = 0

  constructor (backend, capacity = 32) {
    this.#backend = backend
    this.#bytes = backend.allocBytes(Math.max(32, capacity))
  }

  writeByte (byte) {
    if (this.#length === this.#bytes.length) {
      const grown = this.#backend.allocBytes(this.#bytes.length * 2)
      grown.set(this.#bytes)
      this.#bytes = grown
    }
    this.#bytes[this.#length++] = byte
  }

  writeCode (code) {
    if (code > 0xFFFFFF) this.writeByte(code >>> 24)
    if (code > 0xFFFF) this.writeByte(code >>> 16)
    if (code > 0xFF) this.writeByte(code >>> 8)
    this.writeByte(code)
  }

  finish () { return this.#backend.bytesToResult(this.#bytes, this.#length) }
}

// Validate before delegating a write, keeping the native encoder's state unchanged
// if the handler cancels. Original source positions never include replacement text.
export class TextEncoderWithHandler {
  #encoder
  #backend
  #handler
  #representable
  #fallback

  constructor (encoder, backend, callback, encoding, representable, fallback) {
    this.#encoder = encoder
    this.#backend = backend
    this.#handler = new EncodingHandler(callback, encoding)
    this.#representable = representable
    this.#fallback = fallback
  }

  #prepare (str, final) {
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

  write (str) {
    const prepared = this.#prepare(str, false)
    return prepared === null ? null : this.#encoder.write(prepared)
  }

  // Used by the BOM wrapper: validate only user input and commit the BOM together
  // with a successful write. Cancellation must not consume the pending BOM.
  writeWithBOM (str) {
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

export function isUnicodeScalar (char) {
  const code = char.codePointAt(0)
  return code < 0xD800 || code > 0xDFFF
}

export function isBinaryCharacter (char) {
  return char.length === 1 && char.charCodeAt(0) <= 0xFF
}
