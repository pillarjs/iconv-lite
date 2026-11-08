import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
const encoding = "x-user-defined"
const values = Array.from({ length: 256 }, (_, byte) => byte)
const text = String.fromCharCode(...values.map(byte => byte < 0x80 ? byte : 0xF700 + byte))

describe("x-user-defined", function () {
  it("accepts the WHATWG label with ASCII case and whitespace variations", function () {
    const instance = new Iconv(iconv.backend)
    const codec = instance.getCodec(encoding)
    for (const whitespace of ["", " ", "\t", "\n", "\r", "\f"]) {
      const label = whitespace + "X-USER-DEFINED" + whitespace
      expect(instance.encodingExists(label)).toBe(true)
      expect(instance.getCodec(label)).toBe(codec)
      expect(instance.decode(utils.bytes([0x7F, 0x80, 0xFF]), label)).toBe("\u007F\uF780\uF7FF")
    }
  })

  it("decodes and roundtrips all 256 bytes in replacement and fatal modes", function () {
    const bytes = utils.bytes(values)
    for (const fatal of [false, true]) {
      for (const defaultCharUnicode of [undefined, "", "<invalid>"]) {
        expect(iconv.decode(bytes, encoding, { fatal, defaultCharUnicode })).toBe(text)
        for (const byte of values) {
          expect(iconv.decode(utils.bytes([byte]), encoding, { fatal, defaultCharUnicode })).toBe(text[byte])
        }
      }
    }
    expect(iconv.encode(text, encoding)).toStrictEqual(bytes)
    expect(iconv.decode(utils.bytes([]), encoding, { fatal: true })).toBe("")
    expect(iconv.encode("", encoding)).toStrictEqual(utils.bytes([]))
  })

  it("preserves all mappings at every chunk boundary and in empty writes", function () {
    const bytes = utils.bytes(values)
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = iconv.getDecoder(encoding, { fatal: true })
      expect(decoder.write(bytes.subarray(0, split)) + decoder.write(utils.bytes([])) +
        decoder.write(bytes.subarray(split)) + (decoder.end() || "")).toBe(text)
      const encoder = iconv.getEncoder(encoding)
      expect(utils.concatBufs([encoder.write(text.slice(0, split)), encoder.write(""), encoder.write(text.slice(split))]))
        .toStrictEqual(bytes)
      expect(encoder.end()).toBeUndefined()
    }
  })

  it("treats BOM bytes as ordinary input and does not add a BOM", function () {
    const bytes = utils.bytes([0xEF, 0xBB, 0xBF])
    for (const stripBOM of [undefined, false, true]) {
      expect(iconv.decode(bytes, encoding, { stripBOM })).toBe("\uF7EF\uF7BB\uF7BF")
    }
    expect(iconv.encode("\uF780", encoding, { addBOM: true })).toStrictEqual(utils.bytes([0x80]))
  })

  it("replaces characters outside ASCII and the specified private-use range", function () {
    const input = "\u0080\u00FF\u0100\uF77F\uF800\uFEFF\uFFFD\uFFFE\uFFFF🙂\uD800A\uDC00"
    for (const defaultCharByte of [0, 0x3F, 0x80, 0xFF]) {
      expect(iconv.encode(input, encoding, { defaultCharByte }))
        .toStrictEqual(utils.bytes([...new Array<number>(11).fill(defaultCharByte), 0x41, defaultCharByte]))
    }
  })

  it("captures replacement bytes and handles split surrogate pairs", function () {
    for (const input of ["\uF780🙂\uF7FF", "\uF780\uD800", "\uDC00\uF7FF"]) {
      for (let split = 0; split <= input.length; split++) {
        const options = { defaultCharByte: 0x80 }
        const encoder = iconv.getEncoder(encoding, options)
        options.defaultCharByte = 0xFF
        const chunks = [encoder.write(input.slice(0, split)), encoder.write(""), encoder.write(input.slice(split))]
        const tail = encoder.end()
        if (tail) chunks.push(tail)
        expect(utils.concatBufs(chunks)).toStrictEqual(iconv.encode(input, encoding, { defaultCharByte: 0x80 }))
        expect(encoder.end()).toBeUndefined()
      }
    }
    expect(iconv.encode("🙂", encoding)).toStrictEqual(utils.bytes([0x3F]))
  })

  it("accepts private-use handler replacements and reports unsupported code points once", function () {
    const calls: [string, number][] = []
    expect(iconv.encode("\uF780🙂\uF7FF\u0080", encoding, {
      invalidCharHandler (char, index) {
        calls.push([char, index])
        return "\0\uF781"
      }
    })).toStrictEqual(utils.bytes([0x80, 0, 0x81, 0xFF, 0, 0x81]))
    expect(calls).toStrictEqual([["🙂", 1], ["\u0080", 3]])
    for (const replacement of ["\uF77F", "\uF800", "\u0080"]) {
      expect(() => iconv.encode("🙂", encoding, { invalidCharHandler () { return replacement } })).toThrowError(TypeError)
    }
  })
})
