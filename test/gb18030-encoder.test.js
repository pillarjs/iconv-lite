import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

// The Encoding Standard preserves these GB18030-2005 encodings even though
// the GB18030-2022 index assigns their bytes to different code points.
// https://encoding.spec.whatwg.org/#gb18030-encoder
const encoderTable = [
  ["\uE78D", "a6 d9"],
  ["\uE78E", "a6 da"],
  ["\uE78F", "a6 db"],
  ["\uE790", "a6 dc"],
  ["\uE791", "a6 dd"],
  ["\uE792", "a6 de"],
  ["\uE793", "a6 df"],
  ["\uE794", "a6 ec"],
  ["\uE795", "a6 ed"],
  ["\uE796", "a6 f3"],
  ["\uE81E", "fe 59"],
  ["\uE826", "fe 61"],
  ["\uE82B", "fe 66"],
  ["\uE82C", "fe 67"],
  ["\uE832", "fe 6d"],
  ["\uE843", "fe 7e"],
  ["\uE854", "fe 90"],
  ["\uE864", "fe a0"]
]

describe("GB18030 encoder", function () {
  for (const useHandler of [false, true]) {
    it(`applies all 18 asymmetric mappings ${useHandler ? "with" : "without"} a handler`, function () {
      const options = useHandler
        ? { invalidCharHandler () { throw new Error("representable character") } }
        : undefined
      for (const [char, expected] of encoderTable) {
        expect(utils.hex(iconv.encode(char, "gb18030", options)), utils.strToHex(char)).toBe(expected)
      }
    })
  }

  it("keeps the encoder mappings asymmetric with the 2022 decoder index", function () {
    expect(iconv.decode(utils.bytes("a6 d9"), "gb18030")).toBe("\uFE10")
    expect(iconv.decode(utils.bytes("fe 67"), "gb18030")).toBe("\u9FB7")
  })

  it("no longer collapses U+E78D and U+E82C into identical bytes", function () {
    // Both characters previously encoded to 83 36 cb 32.
    expect(utils.hex(iconv.encode("\uE78D\uE82C", "gb18030"))).toBe("a6 d9 fe 67")
  })

  it("treats U+E5E5 as an encoder error in both encoder paths", function () {
    expect(utils.hex(iconv.encode("A\uE5E5B", "gb18030"))).toBe("41 3f 42")
    const calls = []
    const encoded = iconv.encode("A\uE5E5B", "gb18030", {
      invalidCharHandler (char, index) { calls.push([char, index]) }
    })
    expect(utils.hex(encoded)).toBe("41 3f 42")
    expect(calls).toStrictEqual([["\uE5E5", 1]])
  })

  it("uses a configured replacement byte for U+E5E5 in both encoder paths", function () {
    const custom = new Iconv(iconv.backend)
    custom.defaultCharSingleByte = "!"
    for (const options of [undefined, { invalidCharHandler () {} }]) {
      expect(utils.hex(custom.encode("A\uE5E5B", "gb18030", options))).toBe("41 21 42")
    }
  })

  for (const useHandler of [false, true]) {
    it(`preserves mappings and errors across every split ${useHandler ? "with" : "without"} a handler`, function () {
      const text = "A😱" + encoderTable.map(([char]) => char).join("") + "\uE5E5\uD800B\uDC00"
      const expected = "41 95 30 83 35 " + encoderTable.map(([, hex]) => hex).join(" ") + " 3f 3f 42 3f"
      const options = useHandler ? { invalidCharHandler () {} } : undefined

      function encodeChunks (chunks) {
        const encoder = iconv.getEncoder("gb18030", options)
        const output = []
        for (const chunk of chunks) output.push(encoder.write(chunk))
        const tail = encoder.end()
        if (tail) output.push(tail)
        expect(encoder.end()).toBe(undefined)
        return utils.hex(utils.concatBufs(output))
      }

      for (let split = 0; split <= text.length; split++) {
        expect(encodeChunks([text.slice(0, split), "", text.slice(split)]), `split ${split}`).toBe(expected)
      }
      // Split supplementary characters into their individual UTF-16 code units.
      expect(encodeChunks(text.split(""))).toBe(expected)
    })
  }

  it("replaces or skips U+E5E5 while reporting its original character position", function () {
    for (const [replacement, expected] of [["!", "21"], ["", ""], ["\uE78D", "a6 d9"], ["😱", "95 30 83 35"]]) {
      const calls = []
      const encoded = iconv.encode("A😱\uE5E5B", "gb18030", {
        invalidCharHandler (char, index) { calls.push([char, index]); return replacement }
      })
      expect(utils.hex(encoded)).toBe(["41 95 30 83 35", expected, "42"].filter(Boolean).join(" "))
      expect(calls).toStrictEqual([["\uE5E5", 2]])
    }
  })

  it("rejects U+E5E5 in replacement text without calling the handler recursively", function () {
    const calls = []
    const encoder = iconv.getEncoder("gb18030", {
      invalidCharHandler (char, index) { calls.push([char, index]); return "\uE5E5" }
    })
    expect(() => encoder.write("A\uE5E5B")).toThrowError(/Replacement .* cannot be encoded in gb18030 at index 1/)
    expect(calls).toStrictEqual([["\uE5E5", 1]])
    expect(utils.hex(encoder.write("B\uE78D"))).toBe("42 a6 d9")
    expect(encoder.end()).toBe(undefined)
  })

  it("cancels a write on U+E5E5 and allows reuse after a split surrogate pair", function () {
    const calls = []
    const encoder = iconv.getEncoder("gb18030", {
      invalidCharHandler (char, index) { calls.push([char, index]); return true }
    })
    expect(utils.hex(encoder.write("A\uD83D"))).toBe("41")
    expect(encoder.write("\uDE31\uE5E5discarded")).toBe(null)
    expect(calls).toStrictEqual([["\uE5E5", 1]])
    expect(utils.hex(encoder.write("\uE78D"))).toBe("a6 d9")
    expect(encoder.end()).toBe(undefined)
  })
})
