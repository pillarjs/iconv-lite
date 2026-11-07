import { expect } from "vitest"
import utils from "./helpers/utils.js"

describe("Test utils RLE Encoding", function () {
  function assertRountrip (input) {
    expect(utils.rleDecode(utils.rleEncode(input))).toStrictEqual(input)
  }

  it("should pass basic test", function () {
    const input = ["", "a", "b", "c", "d", "123", "", "a", "b", ""]
    const str = utils.rleEncode(input)
    expect(str).toBe("##$&a)#123##%$ab##")
    expect(utils.rleDecode(str)).toStrictEqual(input)
  })

  it("should work fine with empty inputs", function () {
    assertRountrip([])
    assertRountrip([""])
    assertRountrip(["", "", ""])
  })

  it("should encode incremental strings very efficiently", function () {
    const arr = []
    for (var i = 0; i < 256; i++) arr.push(String.fromCharCode(i))

    const str = utils.rleEncode(arr)
    expect(str).toBe("$Ģ\u0000")
  })

  it("should encode lots of empty strings very efficiently", function () {
    const arr = []
    for (var i = 0; i < 25600; i++) arr.push("")

    const str = utils.rleEncode(arr)
    expect(str).toBe("#搢")
  })
})
