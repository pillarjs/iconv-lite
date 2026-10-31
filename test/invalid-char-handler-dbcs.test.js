import assert from "node:assert/strict"
import Iconv from "../lib/iconv.js"
import defaultIconv from "../lib/index-node.js"

describe("invalidCharHandler (DBCS) #node-web", function () {
  let iconv
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  for (const encoding of ["shiftjis", "gbk", "big5", "eucjp", "euckr"]) {
    it(`${encoding} replaces, skips and reports original character positions`, function () {
      const calls = []
      const result = iconv.encode("A🙂B🙂C", encoding, {
        invalidCharHandler (char, index) {
          calls.push([char, index])
          return index === 1 ? ":)".repeat(100) : ""
        }
      })
      assert.deepEqual(result, iconv.encode("A" + ":)".repeat(100) + "BC", encoding))
      assert.deepEqual(calls, [["🙂", 1], ["🙂", 3]])
    })

    it(`${encoding} retains default bytes when the handler returns nothing`, function () {
      const input = "A🙂世\uD800B\uDC00"
      assert.deepEqual(iconv.encode(input, encoding, { invalidCharHandler () {} }), iconv.encode(input, encoding))
    })
  }

  it("does not report GB18030 characters that use the algorithmic mapping", function () {
    const input = "A🙂\uFFFD\u{10FFFF}"
    assert.deepEqual(iconv.encode(input, "gb18030", {
      invalidCharHandler () { assert.fail("representable character") }
    }), iconv.encode(input, "gb18030"))
  })

  it("preserves Big5 sequences split across writes", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler () { assert.fail("valid sequence") } })
    const chunks = [encoder.write("AÊ"), encoder.write(""), encoder.write("\u0304B")]
    assert.equal(encoder.end(), undefined)
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(iconv.encode("AÊ\u0304B", "big5")))
  })

  it("lets a replacement finish a pending Big5 sequence", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => "\u0304" })
    const chunks = [encoder.write("AÊ"), encoder.write("🙂B")]
    assert.equal(encoder.end(), undefined)
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(iconv.encode("AÊ\u0304B", "big5")))
    assert.deepEqual(iconv.encode("A🙂B", "big5", { invalidCharHandler: () => "Ê\u0304" }), iconv.encode("AÊ\u0304B", "big5"))
  })

  it("flushes pending sequences and replaces a final unpaired surrogate", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => "!" })
    const chunks = [encoder.write("AÊ\uD800"), encoder.end()]
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(iconv.encode("AÊ!", "big5")))
    assert.equal(encoder.end(), undefined)
  })

  it("rejects unencodable replacements without invoking the handler again", function () {
    let calls = 0
    assert.throws(() => iconv.encode("🙂", "shiftjis", {
      invalidCharHandler () { calls++; return "🙂" }
    }), /Replacement .* cannot be encoded/)
    assert.equal(calls, 1)
  })

  it("cancels a write and clears its pending sequence before reuse", function () {
    const encoder = iconv.getEncoder("big5", { invalidCharHandler: () => true })
    assert.equal(encoder.write("Ê").length, 0)
    assert.equal(encoder.write("🙂discarded"), null)
    assert.deepEqual(encoder.write("B"), iconv.encode("B", "big5"))
    assert.equal(encoder.end(), undefined)
    assert.equal(iconv.encode("A\uD800", "big5", { invalidCharHandler: () => true }), null)
  })

  it("reports a split supplementary character once at its original position", function () {
    const calls = []
    const encoder = iconv.getEncoder("shiftjis", {
      invalidCharHandler (char, index) { calls.push([char, index]); return "!" }
    })
    const chunks = [encoder.write("A\uD83D"), encoder.write("\uDE42B")]
    assert.deepEqual(Buffer.concat(chunks), Buffer.from("A!B"))
    assert.deepEqual(calls, [["🙂", 1]])
  })
})
