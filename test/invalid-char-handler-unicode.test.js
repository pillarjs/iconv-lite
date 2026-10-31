import assert from "node:assert/strict"
import * as stream from "node:stream"
import Iconv from "../lib/iconv.js"
import defaultIconv from "../lib/index-node.js"

describe("invalidCharHandler (Unicode and binary) #node-web", function () {
  let iconv
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  for (const encoding of ["hex", "base64"]) {
    it(`${encoding} explicitly rejects the handler option`, function () {
      assert.throws(() => iconv.getEncoder(encoding, { invalidCharHandler: () => "" }), {
        name: "TypeError", message: "invalidCharHandler is not supported for " + encoding
      })
      const input = encoding === "hex" ? "4142" : "QUI="
      assert.deepEqual(iconv.encode(input, encoding, { invalidCharHandler: undefined }), iconv.encode(input, encoding))
    })
  }

  it("rejects non-function handlers instead of silently disabling validation", function () {
    for (const encoding of ["latin1", "shiftjis", "utf8", "utf16le", "utf32", "utf7", "cesu8", "binary"]) {
      assert.throws(() => iconv.encode("test", encoding, { invalidCharHandler: true }), {
        name: "TypeError", message: "invalidCharHandler must be a function"
      })
    }
  })

  for (const encoding of ["utf8", "utf32le", "utf32be", "utf32"]) {
    it(`${encoding} reports malformed input and replaces it at original positions`, function () {
      const calls = []
      const result = iconv.encode("A\uDC00🙂\uD800B\uD800", encoding, {
        invalidCharHandler (char, index) {
          calls.push([char, index])
          return index === 1 ? "replacement🙂" : ""
        }
      })
      assert.deepEqual(result, iconv.encode("Areplacement🙂🙂B", encoding))
      assert.deepEqual(calls, [["\uDC00", 1], ["\uD800", 3], ["\uD800", 5]])
    })

    it(`${encoding} retains native fallback output and all valid scalar values`, function () {
      const input = "A\uD800B\uDC00🙂\uFFFD\u{10FFFF}\uD800"
      assert.deepEqual(iconv.encode(input, encoding, { invalidCharHandler () {} }), iconv.encode(input, encoding))
      assert.deepEqual(iconv.encode("🙂\uFFFD\u{10FFFF}", encoding, {
        invalidCharHandler () { assert.fail("valid scalar") }
      }), iconv.encode("🙂\uFFFD\u{10FFFF}", encoding))
    })

    it(`${encoding} preserves split pairs without invoking the handler`, function () {
      const encoder = iconv.getEncoder(encoding, { invalidCharHandler () { assert.fail("split pair") } })
      const chunks = [encoder.write("A\uD83D"), encoder.write(""), encoder.write("\uDE42B")]
      const tail = encoder.end()
      if (tail) chunks.push(tail)
      assert.deepEqual(Buffer.concat(chunks), Buffer.from(iconv.encode("A🙂B", encoding)))
    })

    it(`${encoding} can cancel at write or end, and rejects malformed replacements`, function () {
      assert.equal(iconv.encode("A\uDC00B", encoding, { invalidCharHandler: () => true }), null)
      assert.equal(iconv.encode("A\uD800", encoding, { invalidCharHandler: () => true }), null)
      let calls = 0
      assert.throws(() => iconv.encode("\uD800", encoding, {
        invalidCharHandler () { calls++; return "\uD800" }
      }), /Replacement .* cannot be encoded/)
      assert.equal(calls, 1)
      const error = new Error("Invalid scalar")
      assert.throws(() => iconv.encode("\uD800", encoding, { invalidCharHandler () { throw error } }), actual => actual === error)
    })

    it(`${encoding} leaves no stale surrogate after cancelling a final character`, function () {
      let calls = 0
      const encoder = iconv.getEncoder(encoding, { invalidCharHandler () { return ++calls === 2 } })
      assert.deepEqual(encoder.write("\uD800\uD800"), iconv.encode("\uFFFD", encoding))
      assert.equal(encoder.end(), null)
      assert.deepEqual(encoder.write("A"), iconv.encode("A", encoding, { addBOM: false }))
      const tail = encoder.end()
      assert.ok(!tail || tail.length === 0)
      assert.equal(calls, 2)
    })

    it(`${encoding} excludes BOM from positions and preserves it after cancellation`, function () {
      const calls = []
      const options = Object.freeze({
        addBOM: true,
        invalidCharHandler (char, index) { calls.push([char, index]); return true }
      })
      const encoder = iconv.getEncoder(encoding, options)
      assert.equal(encoder.write("\uDC00"), null)
      assert.deepEqual(encoder.write("A"), iconv.encode("A", encoding, { addBOM: true }))
      const tail = encoder.end()
      assert.ok(!tail || tail.length === 0)
      assert.deepEqual(calls, [["\uDC00", 0]])
      assert.equal(iconv.encode("\uD800", encoding, options), null)
      assert.deepEqual(calls[1], ["\uD800", 0])
    })
  }

  it("applies replacements to binary instead of truncating unrepresentable characters", function () {
    const calls = []
    const result = iconv.encode("ÿ世🙂", "binary", {
      invalidCharHandler (char, index) { calls.push([char, index]); return index === 1 ? "!!" : "" }
    })
    assert.deepEqual(Array.from(result), [0xFF, 0x21, 0x21])
    assert.deepEqual(calls, [["世", 1], ["🙂", 2]])
    assert.deepEqual(iconv.encode("世🙂", "binary", { invalidCharHandler () {} }), iconv.encode("世🙂", "binary"))
    assert.throws(() => iconv.encode("世", "binary", { invalidCharHandler: () => "🙂" }), /Replacement .* cannot be encoded/)
  })

  for (const encoding of ["utf16le", "utf16be", "utf16", "cesu8", "utf7", "utf7imap"]) {
    it(`${encoding} retains its lossless UTF-16 code-unit behavior`, function () {
      const input = "A🙂\uD800B\uDC00"
      assert.deepEqual(iconv.encode(input, encoding, {
        invalidCharHandler () { assert.fail("These code units are preserved by this codec") }
      }), iconv.encode(input, encoding))
    })
  }

  it("replaces malformed UTF-8 input in streams without changing BOM or source positions", async function () {
    iconv.enableStreamingAPI(stream)
    const calls = []
    const encoder = iconv.encodeStream("utf8", {
      addBOM: true,
      invalidCharHandler (char, index) { calls.push([char, index]); return "!" }
    })
    const collected = new Promise((resolve, reject) => {
      encoder.collect((error, bytes) => error ? reject(error) : resolve(bytes))
    })
    encoder.write("A\uD800")
    encoder.end("B")
    assert.deepEqual(await collected, iconv.encode("A!B", "utf8", { addBOM: true }))
    assert.deepEqual(calls, [["\uD800", 1]])
  })
})
