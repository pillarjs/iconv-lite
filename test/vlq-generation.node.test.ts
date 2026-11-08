import assert from "assert"
import { generateVlqTable } from "../generation/utils.js"
import { forEachVlqRun } from "../encodings/vlq-runs.js"

function expand (payload: string) {
  const result: Record<number, number> = {}
  forEachVlqRun(payload, (dbcs, unicode, length) => {
    for (let i = 0; i < length; i++) result[dbcs + i] = unicode + i
  })
  return result
}

describe("VLQ table generation", function () {
  for (const address of [0x8fa1a1, 0x7fffffff, 0x80000000, 0x8135f437, 0xffffffff]) {
    it(`preserves the initial address 0x${address.toString(16)}`, function () {
      const mappings = { [address]: 0xe7c7 }
      assert.deepStrictEqual(expand(generateVlqTable(mappings)), mappings)
    })
  }

  it("preserves large address gaps and negative Unicode gaps", function () {
    const mappings = { 0: 0x10ffff, 0x8135f437: 0, 0xffffffff: 0xe7c7 }
    assert.deepStrictEqual(expand(generateVlqTable(mappings)), mappings)
  })

  it("preserves runs across the signed 32-bit boundary", function () {
    const mappings = { 0x7ffffffe: 0x20000, 0x7fffffff: 0x20001, 0x80000000: 0x20002, 0x80000001: 0x20003 }
    assert.deepStrictEqual(expand(generateVlqTable(mappings)), mappings)
  })

  it("keeps the existing representation for small values", function () {
    const ascii = Object.fromEntries(Array.from({ length: 128 }, (_, code) => [code, code]))
    assert.equal(generateVlqTable(ascii), "A.A.A.gI.A")
  })
})
