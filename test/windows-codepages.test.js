import { expect } from "vitest"
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
          expect(instance.getCodec(alias)).toBe(instance.getCodec("cp" + codePage))
          expect(instance.getCodec(alias)).not.toBe(instance.getCodec(webLabel))
          expect(instance.decode(utils.bytes([0x80]), alias)).toBe(strictText)
          expect(instance.decode(utils.bytes([0x80]), webLabel)).toBe("€")
          expect(instance.encode("€", alias)).toStrictEqual(utils.bytes([0x3F]))
          expect(instance.encode("€", webLabel)).toStrictEqual(utils.bytes([0x80]))
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
        expect(instance.encode("A€", alias, options)).toStrictEqual(utils.bytes([0x41, 0x21]))
        expect(calls).toStrictEqual([["€", 1]])
        calls.length = 0
        expect(instance.encode("A€", webLabel, options)).toStrictEqual(utils.bytes([0x41, 0x80]))
        expect(calls).toStrictEqual([])
      }
    })

    it(codePage + " preserves incremental decoding and fatal behavior", function () {
      for (const alias of aliases) {
        const loose = iconv.getDecoder(alias)
        expect(loose.write(utils.bytes([0x41])) + loose.write(utils.bytes([0x80])) + (loose.end() || "")).toBe("A" + strictText)
        if (codePage === 20127) {
          expect(() => iconv.decode(utils.bytes([0x80]), alias, { fatal: true })).toThrowError(TypeError)
        } else {
          expect(iconv.decode(utils.bytes([0x80]), alias, { fatal: true })).toBe("\u0080")
          expect(iconv.encode("\u0080", alias)).toStrictEqual(utils.bytes([0x80]))
        }
        expect(iconv.decode(utils.bytes([0x80]), webLabel, { fatal: true })).toBe("€")
      }
    })
  }
})
