import assert from "node:assert/strict"
import * as stream from "node:stream"
import Iconv from "../lib/iconv.js"
import NodeIconv from "../lib/iconv-node.js"
import nodeBackend from "../backends/node.js"
import webBackend from "../backends/web.js"

describe("Iconv instances", function () {
  let nodeIconv
  let webIconv

  beforeEach(function () {
    nodeIconv = new NodeIconv(nodeBackend)
    webIconv = new Iconv(webBackend)
  })

  it("binds destructured methods to their instance", function () {
    const { encode: nodeEncode, decode: nodeDecode } = nodeIconv
    const { encode: webEncode, decode: webDecode } = webIconv

    assert(Buffer.isBuffer(nodeEncode("hello", "utf8")))
    assert.equal(webEncode("hello", "utf8").constructor, Uint8Array)
    assert.equal(nodeDecode(nodeEncode("hello", "utf8"), "utf8"), "hello")
    assert.equal(webDecode(webEncode("hello", "utf8"), "utf8"), "hello")
  })

  it("keeps encoder replacement characters separate", function () {
    webIconv.defaultCharSingleByte = "!"

    assert.deepEqual(webIconv.encode("\ufffd", "ascii"), Uint8Array.of(0x21))
    assert.deepEqual(nodeIconv.encode("\ufffd", "ascii"), Buffer.from([0x3f]))
  })

  it("keeps decoder replacement characters separate", function () {
    webIconv.defaultCharUnicode = "!"

    assert.equal(webIconv.decode(Uint8Array.of(0xff), "cesu8"), "!")
    assert.equal(nodeIconv.decode(Uint8Array.of(0xff), "cesu8"), "�")
  })

  it("registers encoding aliases only on the selected instance", function () {
    webIconv.encodingExists("utf8")
    webIconv.encodings.customutf8 = "utf8"

    assert.equal(webIconv.encodingExists("customutf8"), true)
    assert.equal(nodeIconv.encodingExists("customutf8"), false)
  })

  it("changes the backend and resets codecs only on the selected instance", function () {
    const nodeCodec = nodeIconv.getCodec("windows1251")
    const webCodec = webIconv.getCodec("windows1251")

    webIconv.setBackend(nodeBackend)

    assert.notEqual(webIconv.getCodec("windows1251"), webCodec)
    assert.equal(nodeIconv.getCodec("windows1251"), nodeCodec)
    assert(Buffer.isBuffer(webIconv.encode("hello", "windows1251")))
  })

  it("keeps Node stream support out of the Web instance", function () {
    nodeIconv.enableStreamingAPI(stream)

    assert.equal(nodeIconv.supportsStreams, true)
    for (const method of ["encodeStream", "decodeStream", "enableStreamingAPI", "supportsStreams"]) {
      assert.equal(method in webIconv, false)
    }
    assert.equal(webIconv.supportsWebStreams, true)
  })

  it("collects Node stream chunks using the configured Web backend", function (done) {
    nodeIconv.enableStreamingAPI(stream)
    const customIconv = new NodeIconv(webBackend)
    customIconv.enableStreamingAPI(stream)
    const encoder = customIconv.encodeStream("utf8")

    encoder.collect(function (error, bytes) {
      if (error) return done(error)
      try {
        assert.equal(bytes.constructor, Uint8Array)
        assert.equal(webIconv.decode(bytes, "utf8"), "hello")
        done()
      } catch (error) {
        done(error)
      }
    })
    encoder.write("hel")
    encoder.end("lo")
  })
})
