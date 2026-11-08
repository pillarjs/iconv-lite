import type { Backend, WebIconv, EncodeOptions, DecodeOptions } from "../lib/iconv.js"
import type { CodecOptions } from "../lib/encoding-registry.js"
import type { _dbcs as DBCSCodec } from "./dbcs-codec.js"
import { getDefaultCharByte, TextEncoderWithHandler } from "../lib/encoding-handler.js"
import { getDefaultCharUnicode, replaceDecodeErrors } from "../lib/decoding.js"

/**
 * ISO-2022-JP codec following the WHATWG Encoding Standard.
 *
 * A stateful 7-bit encoding: escape sequences switch between character sets.
 *  - ESC ( B  ASCII
 *  - ESC ( J  JIS X 0201 Roman (ASCII with 0x5C = U+00A5 and 0x7E = U+203E)
 *  - ESC ( I  JIS X 0201 Katakana (halfwidth; decoded only, as in WHATWG)
 *  - ESC $ @  JIS X 0208-1978 and ESC $ B  JIS X 0208-1983 (both decoded with the same table)
 *
 * JIS X 0208 is the 94x94 plane EUC-JP stores at (0xA1-0xFE)x2, so its tables are derived from the
 * EUC-JP codec instead of shipping new data.
 *
 * @see https://encoding.spec.whatwg.org/#iso-2022-jp
 */

const ESC = 0x1b

// Decoder states (WHATWG "ISO-2022-JP decoder state"). Encoder states reuse ASCII, ROMAN and LEAD
// (the latter standing for the WHATWG "jis0208" encoder state).
const ASCII = 0
const ROMAN = 1
const KATAKANA = 2
const LEAD = 3
const TRAIL = 4
const ESCAPE_START = 5
const ESCAPE = 6

const JIS0208_SIZE = 94 * 94

// The DBCS codec's trie stores a reference to node `i` as NODE_START - i (see dbcs-codec.js).
const DBCS_NODE_START = -1000

// WHATWG index ISO-2022-JP katakana, including the spacing voiced sound marks.
const KATAKANA_INDEX = "。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜"

function remapCodePoint (code: number) {
  if (code === 0x2212) return 0xff0d
  return code >= 0xff61 && code <= 0xff9f ? KATAKANA_INDEX.charCodeAt(code - 0xff61) : code
}

/** ISO-2022-JP codec. Built once per iconv instance (getCodec caches it). */
class Iso2022JpCodec {
  declare decodeTable: Uint16Array
  declare encodeTable: Uint16Array

  constructor (codecOptions: CodecOptions, iconv: WebIconv) {
    // pointer -> code point (0 = unassigned). Pointer is (row * 94 + cell), both 0-based.
    this.decodeTable = new Uint16Array(JIS0208_SIZE)
    // code point -> pointer + 1 (0 = not in JIS X 0208). The first pointer wins, as in WHATWG.
    this.encodeTable = new Uint16Array(0x10000)

    const eucjp = iconv.getCodec("eucjp") as InstanceType<typeof DBCSCodec>
    const root = eucjp.decodeTables[0]
    for (let row = 0; row < 94; row++) {
      const ref = root[0xa1 + row]
      if (ref > DBCS_NODE_START) { continue } // Not a lead byte in EUC-JP.
      const node = eucjp.decodeTables[DBCS_NODE_START - ref]
      for (let cell = 0; cell < 94; cell++) {
        const codePoint = node[0xa1 + cell]
        if (codePoint <= 0 || codePoint > 0xffff) { continue }
        const pointer = row * 94 + cell
        this.decodeTable[pointer] = codePoint
        if (this.encodeTable[codePoint] === 0) { this.encodeTable[codePoint] = pointer + 1 }
      }
    }
  }

  createEncoder<Bytes extends Uint8Array> (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    const encoder = new Iso2022JpEncoder(this, iconv.backend, options)
    return options?.invalidCharHandler
      ? new TextEncoderWithHandler(encoder, iconv.backend, options.invalidCharHandler, "iso-2022-jp", char => {
        const code = remapCodePoint(char.codePointAt(0)!)
        return (code < 0x80 && code !== 0x0e && code !== 0x0f && code !== ESC) ||
          code === 0xa5 || code === 0x203e || (code <= 0xffff && this.encodeTable[code] !== 0)
      }, "\uFFFD")
      : encoder
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) {
    return new Iso2022JpDecoder(this, iconv.backend, options)
  }

  get bomAware () { return false }
}

/**
 * ISO-2022-JP encoder: the WHATWG algorithm, stateful across writes. Characters that can't be
 * encoded (and ESC, SO, SI, which would change the decoder's state) become
 * the configured ASCII replacement character, using the same state transitions as other input.
 */
class Iso2022JpEncoder<Bytes extends Uint8Array> {
  declare encodeTable: Uint16Array
  declare backend: Backend<Bytes>
  declare state: number
  declare leadSurrogate: number
  #defaultByte: number

  constructor (codec: Iso2022JpCodec, backend: Backend<Bytes>, options: EncodeOptions | undefined) {
    this.encodeTable = codec.encodeTable
    this.backend = backend
    const defaultByte = getDefaultCharByte(options)
    if (defaultByte >= 0x80 || defaultByte === 0x0e || defaultByte === 0x0f || defaultByte === ESC) {
      throw new TypeError("ISO-2022-JP defaultCharByte must be an ASCII byte other than ESC, SO or SI")
    }
    this.#defaultByte = defaultByte
    this.state = ASCII
    this.leadSurrogate = -1
  }

  /**
   * Writes the escape sequence that switches to `state`.
   */
  _shift (out: Uint8Array, pos: number, state: number) {
    out[pos++] = ESC
    if (state === LEAD) {
      out[pos++] = 0x24 // $
      out[pos++] = 0x42 // B
    } else {
      out[pos++] = 0x28 // (
      out[pos++] = state === ROMAN ? 0x4a /* J */ : 0x42 /* B */
    }
    this.state = state
    return pos
  }

  _unmappable (out: Uint8Array, pos: number): number {
    return this._encodeChar(this.#defaultByte, out, pos)
  }

  /**
   * Encodes one UTF-16 code unit (surrogates are handled by the caller).
   */
  _encodeChar (code: number, out: Uint8Array, pos: number): number {
    if (code < 0x80) {
      if (code === 0x0e || code === 0x0f || code === ESC) { return this._unmappable(out, pos) }
      // Roman shares ASCII except "\" and "~", including CR and LF.
      if (this.state !== ASCII &&
          !(this.state === ROMAN && code !== 0x5c && code !== 0x7e)) {
        pos = this._shift(out, pos, ASCII)
      }
      out[pos++] = code
      return pos
    }

    if (code === 0xa5 || code === 0x203e) {
      if (this.state !== ROMAN) { pos = this._shift(out, pos, ROMAN) }
      out[pos++] = code === 0xa5 ? 0x5c : 0x7e
      return pos
    }

    code = remapCodePoint(code)

    const pointer = this.encodeTable[code] - 1
    if (pointer < 0) { return this._unmappable(out, pos) }
    if (this.state !== LEAD) { pos = this._shift(out, pos, LEAD) }
    out[pos++] = 0x21 + ((pointer / 94) | 0)
    out[pos++] = 0x21 + (pointer % 94)
    return pos
  }

  write (str: string) {
    // Worst case per char: a 3-byte escape + 2 bytes; plus a pending surrogate from the last write.
    const out = new Uint8Array(str.length * 5 + 4)
    let pos = 0

    for (let index = 0; index < str.length; index++) {
      const code = str.charCodeAt(index)

      if (this.leadSurrogate !== -1) {
        this.leadSurrogate = -1
        pos = this._unmappable(out, pos) // Nothing outside the BMP is in JIS X 0208.
        if (code >= 0xdc00 && code <= 0xdfff) { continue } // The pair is a single character.
      }
      if (code >= 0xd800 && code <= 0xdbff) {
        this.leadSurrogate = code
        continue
      }

      pos = this._encodeChar(code, out, pos)
    }

    return this.backend.bytesToResult(out, pos)
  }

  end () {
    const out = new Uint8Array(4)
    let pos = 0
    if (this.leadSurrogate !== -1) {
      this.leadSurrogate = -1
      pos = this._unmappable(out, pos)
    }
    if (this.state !== ASCII) { pos = this._shift(out, pos, ASCII) }
    return pos > 0 ? this.backend.bytesToResult(out, pos) : undefined
  }
}

/**
 * ISO-2022-JP decoder: the WHATWG algorithm, one byte at a time. All state lives on the instance,
 * so escape sequences and double-byte characters may be split across chunks. Errors are replaced
 * with the configured replacement text (U+FFFD by default). In particular, two escape sequences with no
 * character between them are an error (a WHATWG rule against hiding content).
 */
class Iso2022JpDecoder {
  declare decodeTable: Uint16Array
  declare backend: Backend
  declare state: number
  declare outputState: number
  declare lead: number
  declare output: boolean
  declare reprocess: boolean
  #replacement: string
  #fatal: boolean
  #errors: number[] | undefined

  constructor (codec: Iso2022JpCodec, backend: Backend, options: DecodeOptions | undefined) {
    this.decodeTable = codec.decodeTable
    this.backend = backend
    this.#replacement = getDefaultCharUnicode(options)
    this.#fatal = !!options?.fatal
    this._reset()
  }

  _error (out: Uint16Array, pos: number) {
    if (this.#fatal) {
      // Keep the character set selected by earlier bytes when a streaming write throws.
      this.reprocess = false
      throw new TypeError("Invalid ISO-2022-JP sequence")
    }
    this.#errors?.push(pos)
    out[pos] = 0xfffd
    return pos + 1
  }

  _reset () {
    this.state = ASCII
    this.outputState = ASCII // The state to return to after an escape sequence.
    this.lead = 0 // Lead byte of a JIS X 0208 pair, or the byte after ESC.
    this.output = false // Whether an escape sequence was the last thing seen (WHATWG "output").
    this.reprocess = false // Set when the current byte must be read again in the new state.
  }

  /**
   * Runs the WHATWG decoder handler for one byte.
   */
  _decodeByte (byte: number, out: Uint16Array, pos: number): number {
    switch (this.state) {
      case ASCII:
      case ROMAN:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        if (byte >= 0x80 || byte === 0x0e || byte === 0x0f) {
          pos = this._error(out, pos)
        } else if (this.state === ROMAN && byte === 0x5c) {
          out[pos++] = 0xa5
        } else if (this.state === ROMAN && byte === 0x7e) {
          out[pos++] = 0x203e
        } else {
          out[pos++] = byte
        }
        return pos

      case KATAKANA:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        if (byte >= 0x21 && byte <= 0x5f) {
          out[pos++] = 0xff61 - 0x21 + byte
        } else {
          pos = this._error(out, pos)
        }
        return pos

      case LEAD:
        if (byte === ESC) {
          this.state = ESCAPE_START
          return pos
        }
        this.output = false
        if (byte >= 0x21 && byte <= 0x7e) {
          this.lead = byte
          this.state = TRAIL
        } else {
          pos = this._error(out, pos)
        }
        return pos

      case TRAIL:
        if (byte === ESC) { // The output state stays LEAD.
          this.state = ESCAPE_START
          pos = this._error(out, pos)
          return pos
        }
        this.state = LEAD
        if (byte >= 0x21 && byte <= 0x7e) {
          const codePoint = this.decodeTable[(this.lead - 0x21) * 94 + byte - 0x21]
          if (codePoint !== 0) {
            out[pos++] = codePoint
          } else {
            pos = this._error(out, pos)
          }
        } else {
          pos = this._error(out, pos)
        }
        return pos

      case ESCAPE_START:
        if (byte === 0x24 || byte === 0x28) { // $ or (
          this.lead = byte
          this.state = ESCAPE
          return pos
        }
        this.reprocess = true
        this.output = false
        this.state = this.outputState
        pos = this._error(out, pos)
        return pos

      default: { // ESCAPE
        const lead = this.lead
        this.lead = 0
        let state = -1
        if (lead === 0x28 && byte === 0x42) { // ( B
          state = ASCII
        } else if (lead === 0x28 && byte === 0x4a) { // ( J
          state = ROMAN
        } else if (lead === 0x28 && byte === 0x49) { // ( I
          state = KATAKANA
        } else if (lead === 0x24 && (byte === 0x40 || byte === 0x42)) { // $ @ or $ B
          state = LEAD
        }

        if (state !== -1) {
          this.state = this.outputState = state
          const output = this.output
          this.output = true
          if (output) { pos = this._error(out, pos) }
          return pos
        }

        // Unknown sequence: an error, then both bytes after ESC are read again in the current set.
        this.output = false
        this.state = this.outputState
        pos = this._error(out, pos)
        pos = this._decodeByte(lead, out, pos) // Never needs reprocessing: lead is "$" or "(".
        this.reprocess = true
        return pos
      }
    }
  }

  write (buf: Uint8Array) {
    this.#errors = this.#replacement === "\uFFFD" ? undefined : []
    // Each byte yields at most one code unit, plus up to two for an escape sequence that turns out
    // to be invalid (U+FFFD and its re-read lead byte).
    const out = new Uint16Array(buf.length + 2)
    let pos = 0
    for (let index = 0; index < buf.length; index++) {
      pos = this._decodeByte(buf[index], out, pos)
      if (this.reprocess) {
        this.reprocess = false
        index--
      }
    }
    return replaceDecodeErrors(this.backend.rawCharsToResult(out, pos), this.#errors, this.#replacement)
  }

  end () {
    this.#errors = this.#replacement === "\uFFFD" ? undefined : []
    const out = new Uint16Array(4)
    let pos = 0
    try {
      for (;;) { // The WHATWG handler for end-of-queue, until it returns "finished".
        if (this.state === TRAIL) {
          this.state = LEAD
          pos = this._error(out, pos)
        } else if (this.state === ESCAPE_START) {
          this.output = false
          this.state = this.outputState
          pos = this._error(out, pos)
        } else if (this.state === ESCAPE) {
          const lead = this.lead
          this.lead = 0
          this.output = false
          this.state = this.outputState
          pos = this._error(out, pos)
          pos = this._decodeByte(lead, out, pos) // In the LEAD state this moves to TRAIL.
        } else {
          break
        }
      }
      return pos > 0 ? replaceDecodeErrors(this.backend.rawCharsToResult(out, pos), this.#errors, this.#replacement) : undefined
    } finally {
      this._reset()
    }
  }
}

export const iso2022jp = Iso2022JpCodec
export const csiso2022jp = "iso2022jp"
