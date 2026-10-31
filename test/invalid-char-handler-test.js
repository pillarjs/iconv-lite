import assert from "assert"
import * as stream from "node:stream"
import defaultIconv from "../lib/index-node.js"
import Iconv from "../lib/iconv-node.js"

describe("invalidCharHandler (SBCS) #node-web", function () {
  let iconv

  beforeEach(function () {
    iconv = new Iconv(defaultIconv.backend)
    iconv.enableStreamingAPI(stream)
  })
  it("calls handler for unencodable chars", function () {
    var calls = []
    var res = iconv.encode("A世B", "latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
      }
    })

    assert.strictEqual(Buffer.from(res).toString("binary"), "A?B")
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].char, "世")
    assert.strictEqual(calls[0].index, 1)
  })

  it("does not call handler for encodable chars including '?'", function () {
    var called = false
    var res = iconv.encode("?A", "latin1", {
      invalidCharHandler: function () {
        called = true
      }
    })

    assert.strictEqual(called, false)
    assert.strictEqual(Buffer.from(res).toString("binary"), "?A")
  })

  it("reports U+FFFD when the replacement byte is unassigned", function () {
    iconv.defaultCharSingleByte = "\x81"
    const calls = []
    const result = iconv.encode("�A?", "windows1252", {
      invalidCharHandler (char, index) {
        calls.push({ char, index })
      }
    })

    assert.deepStrictEqual(Array.from(result), [0x81, 0x41, 0x3F])
    assert.deepStrictEqual(calls, [{ char: "�", index: 0 }])
    assert.strictEqual(iconv.encode("�", "windows1252", {
      invalidCharHandler () { return true }
    }), null)
  })

  it("allows the valid character at the configured replacement byte", function () {
    iconv.defaultCharSingleByte = "\x80"
    const calls = []
    const result = iconv.encode("€世", "windows1252", {
      invalidCharHandler (char, index) {
        calls.push({ char, index })
      }
    })

    assert.deepStrictEqual(Array.from(result), [0x80, 0x80])
    assert.deepStrictEqual(calls, [{ char: "世", index: 1 }])
  })

  it("rejects a non-single-byte defaultCharSingleByte for SBCS", function () {
    iconv.defaultCharSingleByte = "�"
    assert.throws(function () {
      iconv.getCodec("iso88591")
    }, { name: "TypeError", message: "defaultCharSingleByte must be a single-byte character" })
  })

  it("propagates thrown errors", function () {
    assert.throws(function () {
      iconv.encode("世", "latin1", {
        invalidCharHandler: function () {
          throw new Error("boom")
        }
      })
    }, /boom/)
  })

  it("supports error message with full character details", function () {
    var encoding = "latin1"

    assert.throws(function () {
      iconv.encode("Hello 世", encoding, {
        invalidCharHandler: function (char, index) {
          throw new Error("Cannot encode character " + char + " at index " + index + " to " + encoding)
        }
      })
    }, function (err) {
      assert.strictEqual(err.message, "Cannot encode character 世 at index 6 to latin1")
      return true
    })
  })

  it("supports error message with full character details (even for surrogate pairs)", function () {
    var encoding = "latin1"

    assert.throws(function () {
      iconv.encode("Hello 🙂", encoding, {
        invalidCharHandler: function (char, index) {
          throw new Error("Cannot encode character " + char + " at index " + index + " to " + encoding)
        }
      })
    }, function (err) {
      assert.strictEqual(err.message, "Cannot encode character 🙂 at index 6 to latin1")
      return true
    })
  })

  it("reports index as Unicode code-point position", function () {
    var calls = []
    var res = iconv.encode("A🙂世B", "latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
      }
    })

    assert.strictEqual(Buffer.from(res).toString("binary"), "A???B")
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(calls[0].char, "🙂")
    assert.strictEqual(calls[0].index, 1)
    assert.strictEqual(calls[1].char, "世")
    assert.strictEqual(calls[1].index, 2)
  })

  it("reports a split surrogate pair once, keeping the index where it starts", function () {
    const calls = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char, index) { calls.push({ char, index }) }
    })

    assert.deepStrictEqual(Array.from(encoder.write("A\uD83D")), [0x41])
    assert.deepStrictEqual(Array.from(encoder.write("")), [])
    assert.deepStrictEqual(calls, [])
    assert.deepStrictEqual(Array.from(encoder.write("\uDE42世B")), [0x3F, 0x3F, 0x3F, 0x42])
    assert.deepStrictEqual(calls, [{ char: "🙂", index: 1 }, { char: "世", index: 1 }])
    assert.strictEqual(encoder.end(), undefined)
  })

  it("preserves output and callback characters across every split position", function () {
    const input = "A🙂世B\uD800"
    for (let split = 1; split < input.length; split++) {
      const calls = []
      const encoder = iconv.getEncoder("latin1", {
        invalidCharHandler (char) { calls.push(char) }
      })
      const chunks = [encoder.write(input.slice(0, split)), encoder.write(""), encoder.write(input.slice(split))]
      const tail = encoder.end()
      if (tail) chunks.push(tail)

      assert.deepStrictEqual(Buffer.concat(chunks), Buffer.from([0x41, 0x3F, 0x3F, 0x3F, 0x42, 0x3F]))
      assert.deepStrictEqual(calls, ["🙂", "世", "\uD800"])
      assert.strictEqual(encoder.end(), undefined)
    }
  })

  it("reports a buffered high surrogate separately when no low surrogate follows", function () {
    const calls = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char, index) { calls.push({ char, index }) }
    })

    assert.deepStrictEqual(Array.from(encoder.write("A\uD800")), [0x41])
    assert.deepStrictEqual(Array.from(encoder.write("世")), [0x3F, 0x3F])
    assert.deepStrictEqual(calls, [{ char: "\uD800", index: 1 }, { char: "世", index: 0 }])
    assert.strictEqual(encoder.end(), undefined)
  })

  it("discards the current write when a buffered character cancels it", function () {
    const calls = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char, index) {
        calls.push({ char, index })
        return true
      }
    })

    assert.deepStrictEqual(Array.from(encoder.write("A\uD83D")), [0x41])
    assert.strictEqual(encoder.write("\uDE42discarded\uD800"), null)
    assert.deepStrictEqual(Array.from(encoder.write("B")), [0x42])
    assert.strictEqual(encoder.end(), undefined)
    assert.deepStrictEqual(calls, [{ char: "🙂", index: 1 }])
  })

  it("clears a buffered character when its handler throws", function () {
    const error = new Error("Unencodable character")
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler () { throw error }
    })

    encoder.write("\uD83D")
    assert.throws(() => encoder.write("\uDE42"), actual => actual === error)
    assert.deepStrictEqual(Array.from(encoder.write("A")), [0x41])
    assert.strictEqual(encoder.end(), undefined)
  })

  it("lets the handler cancel a trailing high surrogate at end", function () {
    const calls = []
    const options = {
      invalidCharHandler (char, index) {
        calls.push({ char, index })
        return true
      }
    }
    const encoder = iconv.getEncoder("latin1", options)
    assert.deepStrictEqual(Array.from(encoder.write("A\uD800")), [0x41])
    assert.strictEqual(encoder.end(), null)
    assert.strictEqual(encoder.end(), undefined)
    assert.deepStrictEqual(calls, [{ char: "\uD800", index: 1 }])
    assert.strictEqual(iconv.encode("A\uD800", "latin1", options), null)
  })

  it("propagates errors from a trailing high surrogate at end", function () {
    const error = new Error("Incomplete character")
    const options = { invalidCharHandler () { throw error } }
    const encoder = iconv.getEncoder("latin1", options)

    encoder.write("\uD800")
    assert.throws(() => encoder.end(), actual => actual === error)
    assert.strictEqual(encoder.end(), undefined)
    assert.throws(() => iconv.encode("A\uD800", "latin1", options), actual => actual === error)
  })

  it("preserves immediate surrogate replacement without a handler", function () {
    const encoder = iconv.getEncoder("latin1")
    assert.deepStrictEqual(Array.from(encoder.write("\uD83D")), [0x3F])
    assert.deepStrictEqual(Array.from(encoder.write("\uDE42")), [0x3F])
    assert.strictEqual(encoder.end(), undefined)
  })

  it("handles split surrogate pairs through encodeStream", async function () {
    const calls = []
    const encoder = iconv.encodeStream("latin1", {
      invalidCharHandler (char, index) { calls.push({ char, index }) }
    })
    const collected = new Promise((resolve, reject) => {
      encoder.collect((error, bytes) => error ? reject(error) : resolve(bytes))
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

  it("supports stopping SBCS encoding via handler return value", function () {
    var calls = []
    var res = iconv.encode("A世界B", "latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
        return true
      }
    })

    assert.strictEqual(res, null)
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].char, "世")
    assert.strictEqual(calls[0].index, 1)
    // We don't call the handler for "界" because we stopped encoding after "世".
  })

  it("allows a handler to append a fallback before continuing", function () {
    var calls = []
    var output = []
    var replacements = {
      "🙂": ":)"
    }
    var encoder = iconv.getEncoder("latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
        var replacement = replacements[char]
        assert.notStrictEqual(replacement, undefined)
        output.push(iconv.encode(replacement, "latin1"))
        return true
      }
    })

    output.push(encoder.write("Hello "))
    assert.strictEqual(encoder.write("🙂"), null)
    output.push(encoder.write(" world"))

    assert.strictEqual(Buffer.concat(output).toString("binary"), "Hello :) world")
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].char, "🙂")
    assert.strictEqual(calls[0].index, 0)
    assert.strictEqual(encoder.end(), undefined)
  })

  it("continues encoding after handler stops a stream chunk", function (done) {
    var calls = []
    var chunks = []
    var stream = iconv.encodeStream("latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
        return true
      }
    })

    stream.on("data", function (chunk) { chunks.push(chunk) })
    stream.on("end", function () {
      try {
        assert.strictEqual(Buffer.concat(chunks).toString("binary"), "B")
        assert.strictEqual(calls.length, 1)
        done()
      } catch (e) {
        done(e)
      }
    })
    stream.write("A世")
    stream.end("B")
  })

  it("encodes the replacement returned by the handler", function () {
    var res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
        return "!"
      }
    })

    assert.strictEqual(Buffer.from(res).toString("binary"), "!")
  })

  it("supports expanding and empty replacements without changing source indices", function () {
    const calls = []
    const result = iconv.encode("A🙂世B界", "latin1", {
      invalidCharHandler (char, index) {
        calls.push([char, index])
        return char === "🙂" ? ":)".repeat(100) : ""
      }
    })
    assert.strictEqual(Buffer.from(result).toString("latin1"), "A" + ":)".repeat(100) + "B")
    assert.deepStrictEqual(calls, [["🙂", 1], ["世", 2], ["界", 4]])
  })

  it("rejects unencodable replacements without recursive callbacks", function () {
    let calls = 0
    assert.throws(() => iconv.encode("世", "latin1", {
      invalidCharHandler () { calls++; return "🙂" }
    }), /Replacement .* cannot be encoded/)
    assert.strictEqual(calls, 1)
  })

  it("replaces split pairs and pending characters at end", function () {
    const encoder = iconv.getEncoder("latin1", { invalidCharHandler: () => ":)" })
    assert.strictEqual(Buffer.from(encoder.write("A\uD83D")).toString(), "A")
    assert.strictEqual(Buffer.from(encoder.write("\uDE42\uD800")).toString(), ":)")
    assert.strictEqual(Buffer.from(encoder.end()).toString(), ":)")
    assert.strictEqual(encoder.end(), undefined)
  })

  it("rejects invalid callback return types", function () {
    assert.throws(() => iconv.encode("世", "latin1", { invalidCharHandler: () => 42 }), /must return/)
  })

  it("keeps default replacement when handler returns nothing", function () {
    var res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
      }
    })

    assert.strictEqual(Buffer.from(res).toString("binary"), "?")
  })
})
