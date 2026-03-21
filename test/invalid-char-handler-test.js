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
