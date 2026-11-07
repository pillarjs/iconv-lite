import assert from "assert"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("Windows code pages and WHATWG label overrides", function () {
  for (const [codePage, webLabel, strictText] of [
    [20127, "ascii", "\uFFFD"],
    [28591, "iso-8859-1", "\u0080"],
    [28599, "iso-8859-9", "\u0080"],
    [28601, "iso-8859-11", "\u0080"]
  ]) {
    const aliases = [codePage, String(codePage), "cp" + codePage, " \tCP-" + codePage + "\r\n"]
    if (codePage === 20127) aliases.push("cp367", "ibm367")

    it(codePage + " keeps its original table regardless of alias spelling or lookup order", function () {
      for (const alias of aliases) {
        for (const first of [alias, webLabel]) {
          const instance = new Iconv(iconv.backend)
          instance.getCodec(first)
          assert.strictEqual(instance.getCodec(alias), instance.getCodec("cp" + codePage))
          assert.notStrictEqual(instance.getCodec(alias), instance.getCodec(webLabel))
          assert.strictEqual(instance.decode(utils.bytes([0x80]), alias), strictText)
          assert.strictEqual(instance.decode(utils.bytes([0x80]), webLabel), "€")
          assert.deepStrictEqual(instance.encode("€", alias), utils.bytes([0x3F]))
          assert.deepStrictEqual(instance.encode("€", webLabel), utils.bytes([0x80]))
        }
      }
    })

    it(codePage + " keeps handler and replacement settings independent from the web label", function () {
      const instance = new Iconv(iconv.backend)
      instance.encodingExists(webLabel)
      instance.encodingExists(codePage)
      instance.defaultCharSingleByte = "!"
      for (const alias of aliases) {
        const calls = []
        const options = { invalidCharHandler (char, index) { calls.push([char, index]) } }
        assert.deepStrictEqual(instance.encode("A€", alias, options), utils.bytes([0x41, 0x21]))
        assert.deepStrictEqual(calls, [["€", 1]])
        calls.length = 0
        assert.deepStrictEqual(instance.encode("A€", webLabel, options), utils.bytes([0x41, 0x80]))
        assert.deepStrictEqual(calls, [])
      }
    })

    it(codePage + " preserves incremental decoding and fatal behavior", function () {
      for (const alias of aliases) {
        const loose = iconv.getDecoder(alias)
        assert.strictEqual(loose.write(utils.bytes([0x41])) + loose.write(utils.bytes([0x80])) + (loose.end() || ""), "A" + strictText)
        if (codePage === 20127) {
          assert.throws(() => iconv.decode(utils.bytes([0x80]), alias, { fatal: true }), TypeError)
        } else {
          assert.strictEqual(iconv.decode(utils.bytes([0x80]), alias, { fatal: true }), "\u0080")
          assert.deepStrictEqual(iconv.encode("\u0080", alias), utils.bytes([0x80]))
        }
        assert.strictEqual(iconv.decode(utils.bytes([0x80]), webLabel, { fatal: true }), "€")
      }
    })
  }
})
