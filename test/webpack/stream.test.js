import { strict as assert } from "assert"
import iconv from "iconv-lite"
import * as stream from "stream"

describe("iconv-lite with streams", function () {
  it("supports streams when explicitly enabled", function () {
    iconv.enableStreamingAPI(stream)
    assert(iconv.supportsStreams)
  })

  it("can encode/decode in streaming mode", function (done) {
    var stream1 = iconv.encodeStream("win1251")
    var stream2 = iconv.decodeStream("win1251")
    stream1.pipe(stream2)

    stream1.end("abc")
    stream2.collect(function (err, str) {
      if (err) { return done(err) }

      assert.equal(str, "abc")
      done(null)
    })
  })
})
