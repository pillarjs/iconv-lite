import { strict as assert } from "assert"
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

    assert.equal(defaultEncode("hello", "utf8").constructor, utils.BytesType)
    assert.equal(webEncode("hello", "utf8").constructor, Uint8Array)
    assert.equal(defaultDecode(defaultEncode("hello", "utf8"), "utf8"), "hello")
    assert.equal(webDecode(webEncode("hello", "utf8"), "utf8"), "hello")
  })

  it("keeps encoder replacement characters separate", function () {
    webInstance.defaultCharSingleByte = "!"

    assert.deepEqual(webInstance.encode("\ufffd", "ascii"), Uint8Array.of(0x21))
    assert.deepEqual(defaultInstance.encode("\ufffd", "ascii"), utils.bytes([0x3f]))
  })

  it("keeps decoder replacement characters separate", function () {
    webInstance.defaultCharUnicode = "!"

    for (const [encoding, byte] of [["cesu8", 0xFF], ["iso88593", 0xA5], ["windows1253", 0xAA]]) {
      assert.equal(webInstance.decode(Uint8Array.of(byte), encoding), "!")
      assert.equal(defaultInstance.decode(Uint8Array.of(byte), encoding), "�")
    }
  })

  it("registers encoding aliases only on the selected instance", function () {
    webInstance.encodingExists("utf8")
    webInstance.encodings.customutf8 = "utf8"

    assert.equal(webInstance.encodingExists("customutf8"), true)
    assert.equal(defaultInstance.encodingExists("customutf8"), false)
  })

  it("changes the backend and resets codecs only on the selected instance", function () {
    const defaultCodec = defaultInstance.getCodec("windows1251")
    const webCodec = webInstance.getCodec("windows1251")

    webInstance.setBackend(defaultIconv.backend)

    assert.notEqual(webInstance.getCodec("windows1251"), webCodec)
    assert.equal(defaultInstance.getCodec("windows1251"), defaultCodec)
    assert.equal(webInstance.encode("hello", "windows1251").constructor, utils.BytesType)
  })
})
