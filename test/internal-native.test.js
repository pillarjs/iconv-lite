import assert from "assert"
import fs from "fs"
import vm from "vm"
import encodings from "../encodings/internal.js"

// Keep byte-method overrides in a separate context; esm.test.js checks the
// native module graph without Node globals.
describe("Web backend byte-method fallbacks", function () {
  for (const nativeByteMethods of [true, false]) {
    it(`encodes and decodes with the web backend (native byte methods: ${nativeByteMethods})`, function () {
      const backendContext = { TextEncoder, TextDecoder, btoa }
      if (!nativeByteMethods) {
        vm.runInNewContext(`
          Uint8Array.fromHex = undefined;
          Uint8Array.fromBase64 = undefined;
          Uint8Array.prototype.toHex = undefined;
          Uint8Array.prototype.toBase64 = undefined;
        `, backendContext)
      }
      vm.runInNewContext(fs.readFileSync(new URL("../backends/web.js", import.meta.url), "utf8").replace("export default", "globalThis.exports ="), backendContext)
      const backend = backendContext.exports
      const Bytes = vm.runInNewContext("Uint8Array", backendContext)
      for (const [encoding, text, bytes] of [
        ["utf8", "😱", [0xf0, 0x9f, 0x98, 0xb1]],
        ["cesu8", "😱", [0xed, 0xa0, 0xbd, 0xed, 0xb8, 0xb1]],
        ["binary", "\x80\xff", [0x80, 0xff]],
        ["hex", "80ff", [0x80, 0xff]],
        ["base64", "gP8=", [0x80, 0xff]],
        ["hex", "80ff".repeat(128), Array.from({ length: 256 }, (_, i) => i % 2 ? 0xff : 0x80)],
        ["base64", "gICA".repeat(512), new Array(1536).fill(0x80)]
      ]) {
        const codec = new encodings._internal({ encodingName: encoding })
        const encoder = codec.createEncoder({}, { backend })
        const output = [...encoder.write(text), ...(encoder.end() || [])]
        assert.deepStrictEqual(output, bytes)
        const decoder = codec.createDecoder({}, { backend, defaultCharUnicode: "�" })
        assert.strictEqual(decoder.write(new Bytes(bytes)) + (decoder.end() || ""), text)
      }

      // Exercise the size boundaries and forgiving parsing with native methods
      // both present and absent, using Node's Buffer as an independent reference.
      for (const length of [0, 127, 128, 129, 1023, 1024, 1025]) {
        for (const encoding of ["hex", "base64"]) {
          for (const suffix of ["", "==", "a", "!a", "_-/+", "\u0141a", "\na", "=AAAA"]) {
            const text = "A".repeat(length) + suffix
            assert.deepStrictEqual(Array.from(backend.encodeString(text, encoding)), Array.from(Buffer.from(text, encoding)))
          }
        }
      }
    })
  }
})
