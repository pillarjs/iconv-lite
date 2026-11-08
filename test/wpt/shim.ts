import type { DecoderStream } from "iconv-lite"
// Installs iconv-lite-backed TextDecoder / TextEncoder globals so that the
// upstream Web Platform Tests (encoding/*.any.js) run unmodified against
// iconv-lite instead of the engine's native implementation.

import fs from "fs"
import path from "path"
import vm from "vm"
import iconv from "iconv-lite"

// Build the WHATWG label -> canonical-name map from the same encodings table the
// tests use, so `decoder.encoding` reports the spec's canonical name. The map is
// only consulted for naming; whether a label is *accepted* is decided by iconv.
function loadWhatwgLabels () {
  const src = fs.readFileSync(path.join(import.meta.dirname, "upstream", "encoding", "resources", "encodings.js"), "utf8")
  const ctx = { location: { search: "" } }
  vm.createContext(ctx)
  vm.runInContext(src, ctx)
  const table = vm.runInContext("encodings_table", ctx) as { encodings: { name: string, labels: string[] }[] }[]
  const map = new Map<string, string>()
  for (const section of table) {
    for (const encoding of section.encodings) {
      for (const label of encoding.labels) map.set(label.toLowerCase(), encoding.name.toLowerCase())
    }
  }
  return map
}

const whatwgLabels = loadWhatwgLabels()

// https://encoding.spec.whatwg.org/#concept-encoding-get — strip leading/trailing
// ASCII whitespace, then lowercase ASCII letters only.
function normalizeLabel (label: unknown) {
  return String(label).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "").replace(/[A-Z]/g, c => c.toLowerCase())
}

// The thrown error must be an instance of the *test realm's* RangeError/TypeError for
// assert_throws_js to accept it, so we use the jsdom window's constructors
// (captured in setup) rather than this module's.
let RealmRangeError = RangeError
let RealmTypeError = TypeError

function toUint8Array (input?: AllowSharedBufferSource | null) {
  if (input == null) return new Uint8Array()
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  return new Uint8Array(input) // ArrayBuffer
}

class IconvTextDecoder {
  declare _name: string
  declare encoding: string
  declare fatal: boolean
  declare ignoreBOM: boolean
  declare _decoder: DecoderStream | null
  constructor (label: unknown = "utf-8", options: TextDecoderOptions = {}) {
    const normalized = normalizeLabel(label)
    // Reflect iconv-lite's real support: an unrecognized label is a RangeError,
    // exactly as WHATWG requires (and as the labels test expects to pass only for
    // encodings the implementation actually supports).
    if (!iconv.encodingExists(normalized)) {
      throw new RealmRangeError(`The encoding label "${label}" is not supported by iconv-lite.`)
    }
    this._name = normalized
    // Report the WHATWG canonical name when known, else iconv's own label.
    this.encoding = whatwgLabels.get(normalized) || normalized
    this.fatal = Boolean(options.fatal)
    this.ignoreBOM = Boolean(options.ignoreBOM)
    this._decoder = null
  }

  decode (input?: AllowSharedBufferSource | null, options: TextDecodeOptions = {}) {
    const buf = Buffer.from(toUint8Array(input))
    const stream = Boolean(options.stream)
    try {
      if (!this._decoder) {
        this._decoder = iconv.getDecoder(this._name, { stripBOM: !this.ignoreBOM, fatal: this.fatal })
      }
      const result = this._decoder.write(buf)
      return stream ? result : result + (this._decoder.end() || "")
    } catch (e) {
      // In fatal mode iconv throws a TypeError; rethrow it as the test realm's TypeError so
      // assert_throws_js (which checks cross-realm instanceof) accepts it.
      if (e instanceof TypeError) throw new RealmTypeError(e.message)
      throw e
    } finally {
      // Final calls reset the decoder and BOM state, even when decoding throws.
      if (!stream) this._decoder = null
    }
  }
}

class IconvTextEncoder {
  declare encoding: string
  constructor () { this.encoding = "utf-8" }

  encode (str: unknown = "") { return new Uint8Array(iconv.encode(String(str), "utf-8")) }
}

interface ShimWindow {
  RangeError?: RangeErrorConstructor
  TypeError?: TypeErrorConstructor
  TextDecoder?: unknown
  TextEncoder?: unknown
}

export default function setup (window: ShimWindow): asserts window is ShimWindow & { TextDecoder: typeof IconvTextDecoder, TextEncoder: typeof IconvTextEncoder } {
  RealmRangeError = window.RangeError || RangeError
  RealmTypeError = window.TypeError || TypeError
  window.TextDecoder = IconvTextDecoder
  window.TextEncoder = IconvTextEncoder
}
