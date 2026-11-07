import assert from "node:assert/strict"
import Iconv from "../lib/iconv.js"
import NodeIconv from "../lib/iconv-node.js"
import nodeBackend from "../backends/node.js"
import webBackend from "../backends/web.js"

describe("Node Iconv instances", function () {
  let nodeIconv
  let webIconv

  beforeEach(function () {
    nodeIconv = new NodeIconv(nodeBackend)
    webIconv = new Iconv(webBackend)
  })

  it("keeps external definitions through backend changes and supports Node streams", async function () {
    nodeIconv.addEncoding({ custom: "utf8" })
    assert.equal(webIconv.encodingExists("custom"), false)
    const encoder = nodeIconv.encodeStream("custom")
    const decoder = nodeIconv.decodeStream("custom")
    const output = new Promise((resolve, reject) => {
      encoder.on("error", reject)
      encoder.pipe(decoder).collect((error, text) => error ? reject(error) : resolve(text))
    })
    encoder.write("A\uD83D")
    encoder.end("\uDE42")
    assert.equal(await output, "A🙂")
    nodeIconv.setBackend(webBackend)
    assert.equal(nodeIconv.encode("A", "custom").constructor, Uint8Array)
  })

  it("keeps Node stream support out of the Web instance", function () {
    assert.equal(nodeIconv.supportsStreams, true)
    assert.equal("enableStreamingAPI" in nodeIconv, false)
    for (const method of ["encodeStream", "decodeStream", "enableStreamingAPI", "supportsStreams"]) {
      assert.equal(method in webIconv, false)
    }
    assert.equal(webIconv.supportsWebStreams, true)
  })

  it("collects Node stream chunks using the configured Web backend", function (done) {
    const customIconv = new NodeIconv(webBackend)
    const { encodeStream } = customIconv
    const encoder = encodeStream("utf8")

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
