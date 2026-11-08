import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("Node Buffer compatibility", function () {
  it("matches native Buffer encodings with either backend", function () {
    const text = "Hello123!£Å÷×çþÿ¿®"
    for (const encoding of ["utf8", "UTF-8", "UCS2", "binary"]) {
      const expected = Buffer.from(text, encoding as BufferEncoding)
      assert.deepEqual(iconv.encode(text, encoding), utils.bytes(expected))
      assert.equal(iconv.decode(expected, encoding), text)
    }
  })

  it("decodes Buffer views without reading outside their byte offsets", function () {
    for (const [encoding, text] of [["utf8", "A🙂B"], ["utf16le", "A🙂B"], ["binary", "A\x80\xffB"]] as const) {
      const bytes = Buffer.from(text, encoding as BufferEncoding)
      const padded = Buffer.concat([Buffer.of(0xff), bytes, Buffer.of(0xff)])
      assert.equal(iconv.decode(padded.subarray(1, -1), encoding), text)
    }
  })

  it("rejects Buffer input when encoding", function () {
    assert.throws(() => iconv.encode(Buffer.from("Hello £", "utf8") as never, "utf8"), TypeError)
  })
})
