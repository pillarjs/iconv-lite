import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import webBackend from "../backends/web.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

describe("Iconv instances", function () {
  let defaultInstance
  let webInstance

  beforeEach(function () {
    defaultInstance = new Iconv(defaultIconv.backend)
    webInstance = new Iconv(webBackend)
  })

  it("binds destructured methods to their instance", function () {
    const { encode: defaultEncode, decode: defaultDecode } = defaultInstance
    const { encode: webEncode, decode: webDecode } = webInstance

    expect(defaultEncode("hello", "utf8").constructor).toBe(utils.BytesType)
    expect(webEncode("hello", "utf8").constructor).toBe(Uint8Array)
    expect(defaultDecode(defaultEncode("hello", "utf8"), "utf8")).toBe("hello")
    expect(webDecode(webEncode("hello", "utf8"), "utf8")).toBe("hello")
  })

  it("keeps encoder replacement characters separate", function () {
    webInstance.defaultCharSingleByte = "!"

    expect(webInstance.encode("\ufffd", "ascii")).toStrictEqual(Uint8Array.of(0x21))
    expect(defaultInstance.encode("\ufffd", "ascii")).toStrictEqual(utils.bytes([0x3f]))
  })

  it("keeps decoder replacement characters separate", function () {
    webInstance.defaultCharUnicode = "!"

    for (const [encoding, byte] of [["cesu8", 0xFF], ["iso88593", 0xA5], ["windows1253", 0xAA]]) {
      expect(webInstance.decode(Uint8Array.of(byte), encoding)).toBe("!")
      expect(defaultInstance.decode(Uint8Array.of(byte), encoding)).toBe("�")
    }
  })

  it("registers encoding aliases only on the selected instance", function () {
    webInstance.encodingExists("utf8")
    webInstance.encodings.customutf8 = "utf8"

    expect(webInstance.encodingExists("customutf8")).toBe(true)
    expect(defaultInstance.encodingExists("customutf8")).toBe(false)
  })

  it("changes the backend and resets codecs only on the selected instance", function () {
    const defaultCodec = defaultInstance.getCodec("windows1251")
    const webCodec = webInstance.getCodec("windows1251")

    webInstance.setBackend(defaultIconv.backend)

    expect(webInstance.getCodec("windows1251")).not.toBe(webCodec)
    expect(defaultInstance.getCodec("windows1251")).toBe(defaultCodec)
    expect(webInstance.encode("hello", "windows1251").constructor).toBe(utils.BytesType)
  })
})
