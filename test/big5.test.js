import { expect } from "vitest"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

const testString = "中文abc" // unicode contains Big5-code and ascii
const testStringBig5Buffer = utils.bytes([0xa4, 0xa4, 0xa4, 0xe5, 0x61, 0x62, 0x63])
const testString2 = "測試"
const testStringBig5Buffer2 = utils.bytes([0xb4, 0xfa, 0xb8, 0xd5])

describe("Big5 tests", function () {
  it("Big5 correctly encoded/decoded", function () {
    expect(iconv.encode(testString, "big5")).toStrictEqual(testStringBig5Buffer)
    expect(iconv.decode(testStringBig5Buffer, "big5")).toBe(testString)
    expect(iconv.encode(testString2, "big5")).toStrictEqual(testStringBig5Buffer2)
    expect(iconv.decode(testStringBig5Buffer2, "big5")).toBe(testString2)
  })

  it("cp950 correctly encoded/decoded", function () {
    expect(iconv.encode(testString, "cp950")).toStrictEqual(testStringBig5Buffer)
    expect(iconv.decode(testStringBig5Buffer, "cp950")).toBe(testString)
  })

  it("Big5 correctly decodes and encodes characters · and ×", function () {
    // https://github.com/ashtuchkin/iconv-lite/issues/13
    // Reference: http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP950.TXT
    const chars = "·×"
    const big5Chars = utils.bytes([0xA1, 0x50, 0xA1, 0xD1])
    expect(iconv.encode(chars, "big5")).toStrictEqual(big5Chars)
    expect(iconv.decode(big5Chars, "big5")).toBe(chars)
  })

  it("Big5 correctly encodes & decodes sequences", function () {
    expect(utils.hex(iconv.encode("\u00CA\u0304", "big5"))).toBe("88 62")
    expect(utils.hex(iconv.encode("\u00EA\u030C", "big5"))).toBe("88 a5")
    expect(utils.hex(iconv.encode("\u00CA", "big5"))).toBe("88 66")
    expect(utils.hex(iconv.encode("\u00CA\u00CA", "big5"))).toBe("88 66 88 66")

    expect(utils.hex(iconv.encode("\u00CA\uD800", "big5"))).toBe("88 66 3f")         // Unfinished surrogate.
    expect(utils.hex(iconv.encode("\u00CA\uD841\uDD47", "big5"))).toBe("88 66 fa 40") // Finished surrogate ('𠕇').
    expect(utils.hex(iconv.encode("\u00CA𠕇", "big5"))).toBe("88 66 fa 40")            // Finished surrogate ('𠕇').

    expect(iconv.decode(utils.bytes("8862"), "big5")).toBe("\u00CA\u0304")
    expect(iconv.decode(utils.bytes("8866"), "big5")).toBe("\u00CA")
    expect(iconv.decode(utils.bytes("8866fa40"), "big5")).toBe("\u00CA𠕇")
  })

  it("Big5 correctly encodes 十", function () {
    expect(utils.hex(iconv.encode("十", "big5"))).toBe("a4 51")
  })

  it("Big5 correctly encodes 起 (issue #264)", function () {
    expect(utils.hex(iconv.encode("起", "big5"))).toBe("b0 5f")
  })
})
