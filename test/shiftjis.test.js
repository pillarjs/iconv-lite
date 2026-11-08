import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("ShiftJIS tests", function () {
  it("ShiftJIS correctly encoded/decoded", function () {
    const testString = "中文abc" // unicode contains ShiftJIS-code and ascii
    const testStringBig5Buffer = utils.bytes([0x92, 0x86, 0x95, 0xb6, 0x61, 0x62, 0x63])
    const testString2 = "測試"
    const testStringBig5Buffer2 = utils.bytes([0x91, 0xaa, 0x8e, 0x8e])

    expect(iconv.encode(testString, "shiftjis")).toStrictEqual(testStringBig5Buffer)
    expect(iconv.decode(testStringBig5Buffer, "shiftjis")).toBe(testString)
    expect(iconv.encode(testString2, "shiftjis")).toStrictEqual(testStringBig5Buffer2)
    expect(iconv.decode(testStringBig5Buffer2, "shiftjis")).toBe(testString2)
  })

  it("ShiftJIS extended chars are decoded, but not encoded", function () {
    const buf = utils.bytes("ed40eefceeef"); const str = "纊＂ⅰ"; const res = "fa 5c fa 57 fa 40" // repeated block (these same chars are repeated in the different place)
    const buf2 = utils.bytes("f040f2fcf940"); const str2 = ""; const res2 = "3f 3f 3f"   // non-repeated, UA block.

    expect(iconv.decode(buf, "shiftjis")).toBe(str)
    expect(iconv.decode(buf2, "shiftjis")).toBe(str2)

    expect(utils.hex(iconv.encode(str, "shiftjis"))).toBe(res)
    expect(utils.hex(iconv.encode(str2, "shiftjis"))).toBe(res2)
  })

  it("ShiftJIS decodes the whole EUDC block, but does not encode it", function () {
    // https://encoding.spec.whatwg.org/#shift_jis-decoder: pointers 8836 to 10715 (0xF040 to 0xF9FC)
    // decode to U+E000 to U+E757.
    for (let pointer = 8836; pointer <= 10715; pointer++) {
      const lead = Math.floor(pointer / 188)
      const trail = pointer % 188
      const bytes = utils.bytes([lead + (lead < 0x1F ? 0x81 : 0xC1), trail + (trail < 0x3F ? 0x40 : 0x41)])
      const char = String.fromCharCode(0xE000 + pointer - 8836)

      expect(iconv.decode(bytes, "shiftjis"), utils.hex(bytes)).toBe(char)
      expect(utils.hex(iconv.encode(char, "shiftjis")), utils.hex(bytes)).toBe("3f")
    }
  })

  it("ShiftJIS reports EUDC characters to the handler and encodes or skips replacements", function () {
    const text = "A\uE000\uE69D\uE757B"
    for (const [replacement, expected] of [
      [undefined, "41 3f 3f 3f 42"],
      ["!", "41 21 21 21 42"],
      ["", "41 42"],
      ["①", "41 87 40 87 40 87 40 42"]
    ]) {
      const calls = []
      const encoded = iconv.encode(text, "shiftjis", {
        invalidCharHandler (char, index) { calls.push([char, index]); return replacement }
      })
      expect(utils.hex(encoded)).toBe(expected)
      expect(calls).toStrictEqual([["\uE000", 1], ["\uE69D", 2], ["\uE757", 3]])
    }
  })

  it("ShiftJIS uses the configured replacement byte for EUDC in both encoder paths", function () {
    const custom = new Iconv(iconv.backend)
    custom.defaultCharSingleByte = "!"
    for (const options of [undefined, { invalidCharHandler () {} }]) {
      expect(utils.hex(custom.encode("A\uE000\uE69D\uE757B", "shiftjis", options))).toBe("41 21 21 21 42")
    }
  })

  it("ShiftJIS includes extensions", function () {
    expect(iconv.decode(utils.bytes("8740"), "shiftjis")).toBe("①")
    expect(utils.hex(iconv.encode("①", "shiftjis"))).toBe("87 40")
  })
})
