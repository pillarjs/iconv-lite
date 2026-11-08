import { expect } from "vitest"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

describe("CESU-8 codec", function () {
  it("encodes correctly", function () {
    expect(utils.hex(iconv.encode("E", "cesu8"))).toBe("45")
    expect(utils.hex(iconv.encode("¢", "cesu8"))).toBe("c2 a2")
    expect(utils.hex(iconv.encode("ȅ", "cesu8"))).toBe("c8 85")
    expect(utils.hex(iconv.encode("€", "cesu8"))).toBe("e2 82 ac")
    expect(utils.hex(iconv.encode("𐐀", "cesu8"))).toBe("ed a0 81 ed b0 80")
    expect(utils.hex(iconv.encode("😱", "cesu8"))).toBe("ed a0 bd ed b8 b1")
    expect(utils.hex(iconv.encode("a😱a", "cesu8"))).toBe("61 ed a0 bd ed b8 b1 61")
    expect(utils.hex(iconv.encode("😱😱", "cesu8"))).toBe("ed a0 bd ed b8 b1 ed a0 bd ed b8 b1")
  })
  it("decodes correctly", function () {
    expect(iconv.decode(utils.bytes("45"), "cesu8")).toBe("E")
    expect(iconv.decode(utils.bytes("c2a2"), "cesu8")).toBe("¢")
    expect(iconv.decode(utils.bytes("c885"), "cesu8")).toBe("ȅ")
    expect(iconv.decode(utils.bytes("e282ac"), "cesu8")).toBe("€")
    expect(iconv.decode(utils.bytes("eda081edb080"), "cesu8")).toBe("𐐀")
    expect(iconv.decode(utils.bytes("eda0bdedb8b1"), "cesu8")).toBe("😱")
  })
})
