import type { Backend, WebIconv, EncodeOptions, DecodeOptions, ConstructorCodec, CodecOptions } from "../lib/types.js"
import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
import * as utf7 from "../encodings/utf7.js"

const defaultIconv = utils.requireIconv()

class DelegatingCodec {
  #encoding

  constructor (options: CodecOptions) { this.#encoding = options.encoding as string || "utf8" }
  createEncoder (options: EncodeOptions | undefined, iconv: WebIconv) { return iconv.getEncoder(this.#encoding, options) }
  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) { return iconv.getDecoder(this.#encoding, options) }
}

async function collect<T> (stream: ReadableStream<T>) {
  const chunks: T[] = []
  await stream.pipeTo(new WritableStream({ write (chunk) { chunks.push(chunk) } }))
  return chunks
}

describe("External encodings", function () {
  let iconv: Iconv<Uint8Array<ArrayBufferLike>>
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  it("registers codecs and normalizes aliases on an unused instance", function () {
    const { addEncoding } = iconv
    addEncoding({ "X-Alias": "X-Codec", "X-Codec": DelegatingCodec })
    expect(iconv.encodingExists(" x-alias ")).toBeTruthy()
    expect(iconv.decode(iconv.encode("A🙂", "X-Codec"), "x-alias")).toBe("A🙂")
  })

  it("keeps registration local to the instance and preserves UTF-7", function () {
    iconv.addEncoding({ custom: DelegatingCodec })
    expect(new Iconv(iconv.backend).encodingExists("custom")).toBe(false)
    for (const name of ["utf7", "unicode11utf7", "utf7imap"]) {
      expect(iconv.decode(iconv.encode("£中", name), name)).toBe("£中")
    }
    iconv.addEncoding(utf7)
    expect(iconv.decode(iconv.encode("£中", "utf7"), "utf7")).toBe("£中")
  })

  it("repeats equivalent registrations without discarding cached codecs", function () {
    const definitions = Object.freeze({ custom: DelegatingCodec, alias: "custom", variant: Object.freeze({ type: "custom", encoding: "utf16be" }) })
    iconv.addEncoding(definitions as Parameters<Iconv["addEncoding"]>[0])
    const codec = iconv.getCodec("variant")
    const cache = iconv._codecDataCache
    iconv.addEncoding(definitions as Parameters<Iconv["addEncoding"]>[0])
    iconv.addEncoding({ variant: { type: "CUSTOM", encoding: "utf16be" } }, { replace: true })
    expect(iconv._codecDataCache).toBe(cache)
    expect(iconv.getCodec("variant")).toBe(codec)
  })

  it("rejects conflicts atomically, including normalized built-in labels", function () {
    const codec = iconv.getCodec("utf8")
    const registry = iconv.encodings
    expect(() => iconv.addEncoding({ fresh: DelegatingCodec, "UTF-8": "utf16be" })).toThrowError(/already registered/)
    expect(iconv.encodings).toBe(registry)
    expect(iconv.getCodec("utf8")).toBe(codec)
    expect(iconv.encodingExists("fresh")).toBe(false)
    expect(() => iconv.addEncoding({ "X-New": "utf8", xnew: "utf16be" })).toThrowError(/Duplicate/)
  })

  it("replaces codecs and aliases and invalidates their dependent caches", function () {
    iconv.addEncoding({ custom: DelegatingCodec, alias: "custom", variant: { type: "custom" } })
    const encoder = iconv.getEncoder("custom")
    iconv.getCodec("alias")
    iconv.getCodec("variant")
    iconv.addEncoding({ custom: "utf16be" }, { replace: true })
    for (const name of ["custom", "alias", "variant"]) {
      expect(Array.from(iconv.encode("A", name))).toStrictEqual([0, 65])
    }
    expect(Array.from(encoder.write("A"))).toStrictEqual([65])
    iconv.addEncoding({ alias: "utf8" }, { replace: true })
    expect(Array.from(iconv.encode("A", "alias"))).toStrictEqual([65])
  })

  it("keeps variant options when the base codec is already cached", function () {
    iconv.addEncoding({ custom: DelegatingCodec, variant: { type: "custom", encoding: "utf16be" }, override: { type: "variant", encoding: "utf8" } })
    const base = iconv.getCodec("custom")
    expect(Array.from(iconv.encode("A", "variant"))).toStrictEqual([0, 65])
    expect(iconv.getCodec("custom")).toBe(base)
    expect(iconv.getCodec("variant")).not.toBe(base)
    expect(Array.from(iconv.encode("A", "override"))).toStrictEqual([65])
  })

  it("copies definition objects and ignores inherited registry entries", function () {
    const variant = { type: "custom", encoding: "utf16be" }
    const definitions = Object.assign(Object.create({ inherited: "utf8" }), { custom: DelegatingCodec, variant })
    iconv.addEncoding(definitions as Parameters<Iconv["addEncoding"]>[0])
    variant.type = "missing"
    definitions.custom = null
    expect(iconv.encodingExists("inherited")).toBe(false)
    expect(Array.from(iconv.encode("A", "variant"))).toStrictEqual([0, 65])
    iconv.addEncoding({ constructor: "utf8", ["__proto__"]: "utf8" })
    expect(Array.from(iconv.encode("A", "__proto__"))).toStrictEqual([65])
    expect(Object.getPrototypeOf(iconv.encodings)).toBe(null)
  })

  it("rejects malformed definitions without invoking constructors", function () {
    for (const definitions of [null, [], "package-name", { custom: null }, { custom: 1 }, { custom: {} }, { custom: [] }, { custom: () => ({}) }, { "---": "utf8" }]) {
      expect(() => iconv.addEncoding(definitions as never)).toThrowError(TypeError)
      expect(iconv.encodings).toBe(null)
    }
    for (const options of [null, [], true, { replace: "true" }]) {
      expect(() => iconv.addEncoding({ custom: DelegatingCodec }, options as never)).toThrowError(TypeError)
    }
    iconv.addEncoding({ custom: class { constructor () { throw new Error("lazy") } } } as never)
    expect(() => iconv.getCodec("custom")).toThrowError(/lazy/)
    iconv.addEncoding({ incomplete: class {} } as never)
    expect(() => iconv.getCodec("incomplete")).toThrowError(/must provide encoder and decoder/)
    expect(iconv.encodingExists("incomplete")).toBe(false)
  })

  it("rejects missing targets and cycles, including replacements of existing aliases", function () {
    for (const definitions of [{ a: "missing" }, { a: "a" }, { a: "b", b: { type: "a" } }]) {
      expect(() => iconv.addEncoding(definitions as Parameters<Iconv["addEncoding"]>[0])).toThrowError(/target not found|alias cycle/)
      expect(iconv.encodings).toBe(null)
    }
    iconv.addEncoding({ a: "utf8", b: "a" })
    expect(() => iconv.addEncoding({ a: "b" }, { replace: true })).toThrowError(/alias cycle/)
    expect(Array.from(iconv.encode("A", "a"))).toStrictEqual([65])
  })

  it("detects cycles introduced through the legacy mutable registry", function () {
    iconv.addEncoding({ a: "utf8" })
    iconv.encodings!.a = "a"
    expect(() => iconv.getCodec("a")).toThrowError(/alias cycle/)
    expect(iconv.encodingExists("a")).toBe(false)
  })

  it("supports constructor-based codecs with the current backend", function () {
    class Encoder {
      #backend: Backend
      constructor (options: EncodeOptions | undefined, codec: ConstructorCodec, backend: Backend) { this.#backend = backend }
      write (text: string) { return this.#backend.encodeString(text, "utf8") }
      end (): undefined {}
    }
    class Decoder {
      #decoder = new TextDecoder()
      write (bytes: Uint8Array) { return this.#decoder.decode(bytes, { stream: true }) }
      end () { return this.#decoder.decode() }
    }
    class Codec {
      encoder = Encoder
      decoder = Decoder
      bomAware = true
    }
    iconv.addEncoding({ custom: Codec })
    const encoded = iconv.encode("A🙂", "custom", { addBOM: true })
    expect(encoded.constructor).toBe(iconv.encode("", "utf8").constructor)
    expect(iconv.decode(encoded, "custom")).toBe("A🙂")
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
      expect(iconv.backend.concatByteResults(await output)).toStrictEqual(bytes)
    }
    for (let split = 0; split <= bytes.length; split++) {
      const transform = iconv.decodeWebStream("custom")
      const output = collect(transform.readable)
      const writer = transform.writable.getWriter()
      await writer.write(bytes.subarray(0, split))
      await writer.write(bytes.subarray(split))
      await writer.close()
      expect((await output).join("")).toBe(text)
    }
  })
})
