import assert from "assert"
import { _dbcs as DBCSCodec } from "../encodings/dbcs-codec.js"
import { forEachVlqRun } from "../encodings/vlq-runs.js"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
const asciiRow = ["0", "\u0000", 127]
const asciiPayload = "A.A.A.gI.A"

function codecFor (table) {
  return new DBCSCodec({ encodingName: "test", table: () => table }, iconv)
}

describe("DBCS table formats #node-web", function () {
  for (const [name, table] of [
    ["traditional rows", [asciiRow, ["8140", "中"]]],
    ["nested row tables", [[asciiRow], [["8140", "中"]]]],
    ["VLQ with a row table", [asciiPayload, [["8140", "中"]]]],
    ["VLQ with a single row", [asciiPayload, ["8140", "中"]]]
  ]) {
    it(`encodes and decodes ${name}`, function () {
      const codec = codecFor(table)
      const encoder = codec.createEncoder({}, iconv)
      assert.deepStrictEqual(Array.from(encoder.write("A中")), [0x41, 0x81, 0x40])
      const decoder = codec.createDecoder({}, iconv)
      assert.equal(decoder.write(Uint8Array.of(0x41, 0x81, 0x40)), "A中")
    })
  }

  it("preserves character sequences and supplementary characters in rows", function () {
    const codec = codecFor([asciiRow, ["8140", "\u0FFFÊ\u0304𠀀"]])
    const encoder = codec.createEncoder({}, iconv)
    assert.deepStrictEqual(Array.from(encoder.write("AÊ\u0304𠀀")), [0x41, 0x81, 0x40, 0x81, 0x41])
    const decoder = codec.createDecoder({}, iconv)
    assert.equal(decoder.write(Uint8Array.of(0x41, 0x81, 0x40, 0x81, 0x41)), "AÊ\u0304𠀀")
  })

  it("reads a VLQ address with its high bit set", function () {
    // U+E7C7 at byte address 0x8135F437; the address's signed VLQ value is 0x1026BE86E.
    const payload = "u8zD.uj63mhE.A.C.A"
    const runs = []
    forEachVlqRun(payload, (...run) => runs.push(run))
    assert.deepStrictEqual(runs, [[0x8135f437, 0xe7c7, 1]])
    const codec = codecFor([asciiPayload, payload])
    const bytes = Uint8Array.of(0x81, 0x35, 0xf4, 0x37)
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = codec.createDecoder({}, iconv)
      const text = decoder.write(bytes.subarray(0, split)) +
        decoder.write(bytes.subarray(split)) + (decoder.end() || "")
      assert.equal(text, "\uE7C7")
    }
  })
})
