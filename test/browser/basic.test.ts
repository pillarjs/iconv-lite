import { expect, vi } from "vitest"
import iconv from "iconv-lite"

describe("iconv-lite", function () {
  it("uses native Uint8Array without Node globals", function () {
    expect(typeof globalThis.Buffer).toBe("undefined")
    expect(typeof globalThis.process).toBe("undefined")
    const bytes = iconv.encode("abc", "utf8")
    expect(Object.getPrototypeOf(bytes)).toBe(Uint8Array.prototype)
    expect(bytes).toStrictEqual(Uint8Array.of(0x61, 0x62, 0x63))
  })

  it("can be imported when Node globals are present", async function () {
    // Emulate more complex environments that are both web- and node.js-compatible (e.g. Electron renderer process).
    // See https://github.com/ashtuchkin/iconv-lite/issues/204 for details.
    vi.stubGlobal("process", { versions: { node: "22.0.0" } })
    try {
      vi.resetModules()
      const { default: browserIconv } = await import("iconv-lite")
      expect(typeof browserIconv.encode).toBe("function")
      expect(browserIconv.encode("abc", "utf8").constructor).toBe(Uint8Array)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("supports Web Streams automatically and exposes no Node stream methods", function () {
    expect(iconv.supportsWebStreams).toBeTruthy()
    expect(iconv.encodeWebStream("utf8") instanceof TransformStream).toBeTruthy()
    expect(iconv.decodeWebStream("utf8") instanceof TransformStream).toBeTruthy()
    for (const name of ["encodeStream", "decodeStream", "enableStreamingAPI", "supportsStreams"]) {
      expect(!(name in iconv)).toBeTruthy()
    }
  })

  it("can encode/decode sbcs encodings", function () {
    const buf = iconv.encode("abc", "win1251")
    const str = iconv.decode(buf, "win1251")
    expect(str).toBe("abc")
  })

  it("can encode/decode dbcs encodings", function () {
    const buf = iconv.encode("abc", "shiftjis")
    const str = iconv.decode(buf, "shiftjis")
    expect(str).toBe("abc")
  })

  it("can encode/decode internal encodings", function () {
    const buf = iconv.encode("💩", "utf8")
    const str = iconv.decode(buf, "utf8")
    expect(str).toBe("💩")
  })

  it("supports passing Uint8Array to decode for all encodings", function () {
    iconv.encode("", "utf8") // Load all encodings.

    const encodings = Object.keys(iconv.encodings!)
    encodings
      .filter(encoding =>
        !encoding.startsWith("_") &&
                    // https://github.com/ashtuchkin/iconv-lite/issues/231
                    encoding !== "base64" && encoding !== "hex"
      )
      .forEach(function (encoding) {
        const expected = "Lorem ipsum"

        const encoded = iconv.encode(expected, encoding)
        expect(encoded.constructor, encoding).toBe(Uint8Array)
        const uint8Array = Uint8Array.from(encoded)
        const actual = iconv.decode(uint8Array, encoding)
        expect(actual, encoding).toBe(expected)
      })
  })
})
