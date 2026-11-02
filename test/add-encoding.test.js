import assert from "assert"
import Iconv from "../lib/iconv.js"
import defaultIconv from "../lib/index-node.js"
import * as utf7 from "../encodings/utf7.js"

class DelegatingCodec {
  #encoding

  constructor (options) { this.#encoding = options.encoding || "utf8" }
  createEncoder (options, iconv) { return iconv.getEncoder(this.#encoding, options) }
  createDecoder (options, iconv) { return iconv.getDecoder(this.#encoding, options) }
}

async function collect (stream) {
  const chunks = []
  await stream.pipeTo(new WritableStream({ write (chunk) { chunks.push(chunk) } }))
  return chunks
}

describe("External encodings #node-web", function () {
  let iconv
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  it("registers codecs and normalizes aliases on an unused instance", function () {
    const { addEncoding } = iconv
    addEncoding({ "X-Alias": "X-Codec", "X-Codec": DelegatingCodec })
    assert(iconv.encodingExists(" x-alias "))
    assert.equal(iconv.decode(iconv.encode("A🙂", "X-Codec"), "x-alias"), "A🙂")
  })

  it("keeps registration local to the instance and preserves UTF-7", function () {
    iconv.addEncoding({ custom: DelegatingCodec })
    assert.equal(new Iconv(iconv.backend).encodingExists("custom"), false)
    for (const name of ["utf7", "unicode11utf7", "utf7imap"]) {
      assert.equal(iconv.decode(iconv.encode("£中", name), name), "£中")
    }
    iconv.addEncoding(utf7)
    assert.equal(iconv.decode(iconv.encode("£中", "utf7"), "utf7"), "£中")
  })

  it("repeats equivalent registrations without discarding cached codecs", function () {
    const definitions = Object.freeze({ custom: DelegatingCodec, alias: "custom", variant: Object.freeze({ type: "custom", encoding: "utf16be" }) })
    iconv.addEncoding(definitions)
    const codec = iconv.getCodec("variant")
    const cache = iconv._codecDataCache
    iconv.addEncoding(definitions)
    iconv.addEncoding({ variant: { type: "CUSTOM", encoding: "utf16be" } }, { replace: true })
    assert.strictEqual(iconv._codecDataCache, cache)
    assert.strictEqual(iconv.getCodec("variant"), codec)
  })

  it("rejects conflicts atomically, including normalized built-in labels", function () {
    const codec = iconv.getCodec("utf8")
    const registry = iconv.encodings
    assert.throws(() => iconv.addEncoding({ fresh: DelegatingCodec, "UTF-8": "utf16be" }), /already registered/)
    assert.strictEqual(iconv.encodings, registry)
    assert.strictEqual(iconv.getCodec("utf8"), codec)
    assert.equal(iconv.encodingExists("fresh"), false)
    assert.throws(() => iconv.addEncoding({ "X-New": "utf8", xnew: "utf16be" }), /Duplicate/)
  })

  it("replaces codecs and aliases and invalidates their dependent caches", function () {
    iconv.addEncoding({ custom: DelegatingCodec, alias: "custom", variant: { type: "custom" } })
    const encoder = iconv.getEncoder("custom")
    iconv.getCodec("alias")
    iconv.getCodec("variant")
    iconv.addEncoding({ custom: "utf16be" }, { replace: true })
    for (const name of ["custom", "alias", "variant"]) {
      assert.deepStrictEqual(Array.from(iconv.encode("A", name)), [0, 65])
    }
    assert.deepStrictEqual(Array.from(encoder.write("A")), [65])
    iconv.addEncoding({ alias: "utf8" }, { replace: true })
    assert.deepStrictEqual(Array.from(iconv.encode("A", "alias")), [65])
  })

  it("keeps variant options when the base codec is already cached", function () {
    iconv.addEncoding({ custom: DelegatingCodec, variant: { type: "custom", encoding: "utf16be" }, override: { type: "variant", encoding: "utf8" } })
    const base = iconv.getCodec("custom")
    assert.deepStrictEqual(Array.from(iconv.encode("A", "variant")), [0, 65])
    assert.strictEqual(iconv.getCodec("custom"), base)
    assert.notStrictEqual(iconv.getCodec("variant"), base)
    assert.deepStrictEqual(Array.from(iconv.encode("A", "override")), [65])
  })

  it("copies definition objects and ignores inherited registry entries", function () {
    const variant = { type: "custom", encoding: "utf16be" }
    const definitions = Object.assign(Object.create({ inherited: "utf8" }), { custom: DelegatingCodec, variant })
    iconv.addEncoding(definitions)
    variant.type = "missing"
    definitions.custom = null
    assert.equal(iconv.encodingExists("inherited"), false)
    assert.deepStrictEqual(Array.from(iconv.encode("A", "variant")), [0, 65])
    iconv.addEncoding({ constructor: "utf8", ["__proto__"]: "utf8" })
    assert.deepStrictEqual(Array.from(iconv.encode("A", "__proto__")), [65])
    assert.strictEqual(Object.getPrototypeOf(iconv.encodings), null)
  })

  it("rejects malformed definitions without invoking constructors", function () {
    for (const definitions of [null, [], "package-name", { custom: null }, { custom: 1 }, { custom: {} }, { custom: [] }, { custom: () => ({}) }, { "---": "utf8" }]) {
      assert.throws(() => iconv.addEncoding(definitions), TypeError)
      assert.equal(iconv.encodings, null)
    }
    for (const options of [null, [], true, { replace: "true" }]) {
      assert.throws(() => iconv.addEncoding({ custom: DelegatingCodec }, options), TypeError)
    }
    iconv.addEncoding({ custom: class { constructor () { throw new Error("lazy") } } })
    assert.throws(() => iconv.getCodec("custom"), /lazy/)
    iconv.addEncoding({ incomplete: class {} })
    assert.throws(() => iconv.getCodec("incomplete"), /must provide encoder and decoder/)
    assert.equal(iconv.encodingExists("incomplete"), false)
  })

  it("rejects missing targets and cycles, including replacements of existing aliases", function () {
    for (const definitions of [{ a: "missing" }, { a: "a" }, { a: "b", b: { type: "a" } }]) {
      assert.throws(() => iconv.addEncoding(definitions), /target not found|alias cycle/)
      assert.equal(iconv.encodings, null)
    }
    iconv.addEncoding({ a: "utf8", b: "a" })
    assert.throws(() => iconv.addEncoding({ a: "b" }, { replace: true }), /alias cycle/)
    assert.deepStrictEqual(Array.from(iconv.encode("A", "a")), [65])
  })

  it("detects cycles introduced through the legacy mutable registry", function () {
    iconv.addEncoding({ a: "utf8" })
    iconv.encodings.a = "a"
    assert.throws(() => iconv.getCodec("a"), /alias cycle/)
    assert.equal(iconv.encodingExists("a"), false)
  })

  it("supports constructor-based codecs with the current backend", function () {
    class Encoder {
      #backend
      constructor (options, codec, backend) { this.#backend = backend }
      write (text) { return this.#backend.encodeString(text, "utf8") }
      end () {}
    }
    class Decoder {
      #decoder = new TextDecoder()
      write (bytes) { return this.#decoder.decode(bytes, { stream: true }) }
      end () { return this.#decoder.decode() }
    }
    class Codec {
      encoder = Encoder
      decoder = Decoder
      bomAware = true
    }
    iconv.addEncoding({ custom: Codec })
    const encoded = iconv.encode("A🙂", "custom", { addBOM: true })
    assert.equal(encoded.constructor, iconv.encode("", "utf8").constructor)
    assert.equal(iconv.decode(encoded, "custom"), "A🙂")
  })

  it("handles external codec state across every Web Stream chunk boundary", async function () {
    iconv.addEncoding({ custom: DelegatingCodec })
    const text = "A🙂£"
    const bytes = iconv.encode(text, "custom")
    for (let split = 0; split <= text.length; split++) {
      const transform = iconv.encodeWebStream("custom")
      const output = collect(transform.readable)
      const writer = transform.writable.getWriter()
      await writer.write(text.slice(0, split))
      await writer.write(text.slice(split))
      await writer.close()
      assert.deepStrictEqual(iconv.backend.concatByteResults(await output), bytes)
    }
    for (let split = 0; split <= bytes.length; split++) {
      const transform = iconv.decodeWebStream("custom")
      const output = collect(transform.readable)
      const writer = transform.writable.getWriter()
      await writer.write(bytes.subarray(0, split))
      await writer.write(bytes.subarray(split))
      await writer.close()
      assert.equal((await output).join(""), text)
    }
  })
})
