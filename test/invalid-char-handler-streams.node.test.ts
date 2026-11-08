import assert from "node:assert/strict"
import Iconv from "../lib/iconv-node.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

describe("invalidCharHandler (Node streams)", function () {
  let iconv: Iconv<Uint8Array<ArrayBufferLike>>
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  for (const withHandler of [false, true]) {
    it(`captures the SBCS replacement option in Node streams (handler: ${withHandler})`, async function () {
      const options = { defaultCharByte: 0x21, ...(withHandler ? { invalidCharHandler () {} } : {}) }
      const encoder = iconv.encodeStream("cp1252", options)
      options.defaultCharByte = 0x23
      assert.deepEqual(iconv.encode("\uFFFD", "windows1252", options), utils.bytes([0x23]))
      const collected = new Promise<Uint8Array>((resolve, reject) => {
        encoder.collect((error, bytes) => error ? reject(error) : resolve(bytes!))
      })
      encoder.write("A\uFFFD\uD83D")
      encoder.write("")
      encoder.end("\uDE42\uD800")
      assert.deepEqual(await collected, utils.bytes([0x41, 0x21, 0x21, 0x21, 0x21]))
    })
  }

  it("continues encoding after handler stops a stream chunk", async function () {
    const calls = []
    const stream = iconv.encodeStream("latin1", {
      invalidCharHandler: function (char: string, index: number) {
        calls.push({ char, index })
        return true
      }
    })

    const collected = new Promise<Uint8Array>((resolve, reject) => {
      stream.collect((error, bytes) => error ? reject(error) : resolve(bytes!))
    })
    stream.write("A世")
    stream.end("B")
    assert.strictEqual(Buffer.from(await collected as Uint8Array).toString("binary"), "B")
    assert.strictEqual(calls.length, 1)
  })

  it("replaces malformed UTF-8 input in streams without changing BOM or source positions", async function () {
    const calls: unknown[] = []
    const encoder = iconv.encodeStream("utf8", {
      addBOM: true,
      invalidCharHandler (char: string, index: number) { calls.push([char, index]); return "!" }
    })
    const collected = new Promise<Uint8Array>((resolve, reject) => {
      encoder.collect((error, bytes) => error ? reject(error) : resolve(bytes!))
    })
    encoder.write("A\uD800")
    encoder.end("B")
    assert.deepEqual(await collected, iconv.encode("A!B", "utf8", { addBOM: true }))
    assert.deepEqual(calls, [["\uD800", 1]])
  })

  it("handles split surrogate pairs through encodeStream", async function () {
    const calls: unknown[] = []
    const encoder = iconv.encodeStream("latin1", {
      invalidCharHandler (char: string, index: number) { calls.push({ char, index }) }
    })
    const collected = new Promise<Uint8Array>((resolve, reject) => {
      encoder.collect((error, bytes) => error ? reject(error) : resolve(bytes!))
    })

    encoder.write("A\uD83D")
    encoder.end("\uDE42B")
    assert.deepStrictEqual(Array.from(await collected), [0x41, 0x3F, 0x3F, 0x42])
    assert.deepStrictEqual(calls, [{ char: "🙂", index: 1 }])
  })

  it("emits stream errors when a handler rejects a trailing high surrogate", async function () {
    const error = new Error("Incomplete character")
    const encoder = iconv.encodeStream("latin1", {
      invalidCharHandler () { throw error }
    })
    const errored = new Promise(resolve => encoder.once("error", resolve))
    encoder.end("\uD800")
    assert.strictEqual(await errored, error)
  })
})
