"use strict"

const assert = require("assert")
const fs = require("fs")
const vm = require("vm")

describe("Internal codecs without Node globals", function () {
  for (const nativeByteMethods of [true, false]) {
    it(`loads the codecs and web backend without Node globals (native byte methods: ${nativeByteMethods})`, function () {
      const context = { module: { exports: {} }, TextEncoder, TextDecoder, btoa }
      vm.runInNewContext(fs.readFileSync(require.resolve("../encodings/internal"), "utf8"), context)
      const encodings = context.module.exports
      const backendContext = { module: { exports: {} }, TextEncoder, TextDecoder, btoa }
      if (!nativeByteMethods) {
        vm.runInNewContext("Uint8Array.prototype.toHex = undefined; Uint8Array.prototype.toBase64 = undefined", backendContext)
      }
      vm.runInNewContext(fs.readFileSync(require.resolve("../backends/web"), "utf8"), backendContext)
      const backend = backendContext.module.exports
      for (const [encoding, text, bytes] of [
        ["utf8", "😱", [0xf0, 0x9f, 0x98, 0xb1]],
        ["cesu8", "😱", [0xed, 0xa0, 0xbd, 0xed, 0xb8, 0xb1]],
        ["binary", "\x80\xff", [0x80, 0xff]],
        ["hex", "80ff", [0x80, 0xff]],
        ["base64", "gP8=", [0x80, 0xff]]
      ]) {
        const codec = new encodings._internal({ encodingName: encoding })
        const encoder = codec.createEncoder({}, { backend })
        const output = [...encoder.write(text), ...(encoder.end() || [])]
        assert.deepStrictEqual(output, bytes)
        const decoder = codec.createDecoder({}, { backend, defaultCharUnicode: "�" })
        assert.strictEqual(decoder.write(new Uint8Array(bytes)) + (decoder.end() || ""), text)
      }
    })
  }
})
