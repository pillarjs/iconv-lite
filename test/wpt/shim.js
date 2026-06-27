"use strict"

// Installs iconv-lite-backed TextDecoder / TextEncoder globals so that the
// upstream Web Platform Tests (encoding/*.any.js) run unmodified against
// iconv-lite instead of the engine's native implementation.

const fs = require("fs")
const path = require("path")
const vm = require("vm")
const iconv = require("../..")

// Build the WHATWG label -> canonical-name map from the same encodings table the
// tests use, so `decoder.encoding` reports the spec's canonical name. The map is
// only consulted for naming; whether a label is *accepted* is decided by iconv.
function loadWhatwgLabels () {
  const src = fs.readFileSync(path.join(__dirname, "upstream", "encoding", "resources", "encodings.js"), "utf8")
  const ctx = { location: { search: "" } }
  vm.createContext(ctx)
  vm.runInContext(src, ctx)
  const table = vm.runInContext("encodings_table", ctx)
  const map = new Map()
  for (const section of table) {
    for (const encoding of section.encodings) {
      for (const label of encoding.labels) map.set(label.toLowerCase(), encoding.name.toLowerCase())
    }
  }
  return map
}

const whatwgLabels = loadWhatwgLabels()

// https://encoding.spec.whatwg.org/#concept-encoding-get — strip leading/trailing
// ASCII whitespace, then lowercase.
function normalizeLabel (label) {
  return String(label).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "").toLowerCase()
}

// The thrown error must be an instance of the *test realm's* RangeError for
// assert_throws_js to accept it, so we use the jsdom window's constructor
// (captured in setup) rather than this module's.
let RealmRangeError = RangeError

function toUint8Array (input) {
  if (input == null) return new Uint8Array()
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  return new Uint8Array(input) // ArrayBuffer
}

class IconvTextDecoder {
  constructor (label = "utf-8", options = {}) {
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
    // iconv-lite has no streaming/fatal modes — expose the flags WPT reads, but
    // { fatal: true } cannot throw (iconv always replaces), which is the real gap.
    this.fatal = Boolean(options.fatal)
    this.ignoreBOM = Boolean(options.ignoreBOM)
  }

  decode (input, options = {}) {
    const buf = Buffer.from(toUint8Array(input))
    return iconv.decode(buf, this._name, { stripBOM: !this.ignoreBOM })
  }
}

class IconvTextEncoder {
  constructor () { this.encoding = "utf-8" }

  encode (str = "") { return new Uint8Array(iconv.encode(String(str), "utf-8")) }
}

module.exports = function setup (window) {
  RealmRangeError = window.RangeError || RangeError
  window.TextDecoder = IconvTextDecoder
  window.TextEncoder = IconvTextEncoder
}
