import { strict as assert } from "assert"
import iconv, { encodeWebStream, decodeWebStream } from "iconv-lite"

describe("iconv-lite with Web Streams", function () {
  it("exports the native Web Stream factories", function () {
    assert.equal(encodeWebStream, iconv.encodeWebStream)
    assert.equal(decodeWebStream, iconv.decodeWebStream)
    assert(iconv.supportsWebStreams)
  })

  it("encodes and decodes in a browser pipeline without setup", async function () {
    const input = new ReadableStream({
      start (controller) { controller.enqueue("Привет"); controller.close() }
    })
    const output = input.pipeThrough(encodeWebStream("win1251")).pipeThrough(decodeWebStream("win1251"))
    const reader = output.getReader()
    assert.equal((await reader.read()).value, "Привет")
    assert.equal((await reader.read()).done, true)
    reader.releaseLock()
  })
})
