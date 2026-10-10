var assert = require("assert")
var join = require("path").join
var iconv = require(join(__dirname, "/../"))

describe("invalidCharHandler (SBCS)", function () {
  it("calls handler for unencodable chars", function () {
    var calls = []
    var res = iconv.encode("A世B", "latin1", {
      invalidCharHandler: function (char, index) {
        calls.push({ char: char, index: index })
      }
    })

    assert.strictEqual(res.toString("binary"), "A?B")
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
    assert.strictEqual(res.toString("binary"), "?A")
  })

  it("rejects a non-single-byte defaultCharSingleByte for SBCS", function () {
    var encoding = "iso88591"
    var originalDefaultCharSingleByte = iconv.defaultCharSingleByte
    var codecKey = iconv._canonicalizeEncoding(encoding)
    var cachedCodec = iconv._codecDataCache[codecKey]
    delete iconv._codecDataCache[codecKey]

    try {
      iconv.defaultCharSingleByte = "�"
      assert.throws(function () {
        iconv.getCodec(encoding)
      }, function (err) {
        assert.strictEqual(err.name, "TypeError")
        assert.strictEqual(err.message, "defaultCharSingleByte must be a single-byte character")
        return true
      })
    } finally {
      iconv.defaultCharSingleByte = originalDefaultCharSingleByte
      if (cachedCodec) {
        iconv._codecDataCache[codecKey] = cachedCodec
      } else {
        delete iconv._codecDataCache[codecKey]
      }
    }
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

    assert.strictEqual(res.toString("binary"), "A???B")
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(calls[0].char, "🙂")
    assert.strictEqual(calls[0].index, 1)
    assert.strictEqual(calls[1].char, "世")
    assert.strictEqual(calls[1].index, 2)
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

  it("keeps default replacement when handler returns a value", function () {
    var res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
        return "!"
      }
    })

    assert.strictEqual(res.toString("binary"), "?")
  })

  it("keeps default replacement when handler returns nothing", function () {
    var res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
      }
    })

    assert.strictEqual(res.toString("binary"), "?")
  })
})
