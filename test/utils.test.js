"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")

describe("Test utils RLE Encoding #node-web", function () {
  function assertRountrip (input) {
    assert.deepEqual(utils.rleDecode(utils.rleEncode(input)), input)
  }

  it("should pass basic test", function () {
    const input = ["", "a", "b", "c", "d", "123", "", "a", "b", ""]
    const str = utils.rleEncode(input)
    assert.equal(str, "##$&a)#123##%$ab##")
    assert.deepEqual(utils.rleDecode(str), input)
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
    assert.equal(str, "$Ģ\u0000")
  })

  it("should encode lots of empty strings very efficiently", function () {
    const arr = []
    for (var i = 0; i < 25600; i++) arr.push("")

    const str = utils.rleEncode(arr)
    assert.equal(str, "#搢")
  })
})
