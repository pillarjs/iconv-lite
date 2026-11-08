import { expect } from "vitest"
import iconv, { encodeWebStream, decodeWebStream } from "iconv-lite"

describe("iconv-lite with Web Streams", function () {
  it("exports the native Web Stream factories", function () {
    expect(encodeWebStream).toBe(iconv.encodeWebStream)
    expect(decodeWebStream).toBe(iconv.decodeWebStream)
    expect(iconv.supportsWebStreams).toBeTruthy()
  })

  it("encodes and decodes in a browser pipeline without setup", async function () {
    const input = new ReadableStream({
      start (controller) { controller.enqueue("Привет"); controller.close() }
    })
    const output = input.pipeThrough(encodeWebStream("win1251")).pipeThrough(decodeWebStream("win1251"))
    const reader = output.getReader()
    expect((await reader.read()).value).toBe("Привет")
    expect((await reader.read()).done).toBe(true)
    reader.releaseLock()
  })
})
