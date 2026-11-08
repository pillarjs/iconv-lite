import nativeIconv from "iconv"
import { Buffer } from "buffer"
import assert from "assert"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

// Cross-validate every valid code point against the reference C++ iconv when available.
describe("UTF-32 full code point round-trip", function () {
  const { Iconv } = nativeIconv

  let cache: { str: string, leBuf: Buffer, beBuf: Buffer } | undefined
  function buildAll () {
    if (cache) { return cache }
    let str = ""
    const leBuf = Buffer.alloc(0x10F800 * 4)
    const beBuf = Buffer.alloc(0x10F800 * 4)
    let skip = 0
    for (let i = 0; i <= 0x10F7FF; i++) {
      if (i === 0xD800) { skip = 0x800 } // Jump over the surrogate range (not valid scalar values).
      const cp = i + skip
      str += String.fromCodePoint(cp)
      leBuf.writeUInt32LE(cp, i * 4)
      beBuf.writeUInt32BE(cp, i * 4)
    }
    cache = { str, leBuf, beBuf }
    return cache
  }

  it("handles encoding all valid code points (LE)", function ({ skip }) {
    if (!Iconv) { skip() }
    const { str, leBuf } = buildAll()
    assert.deepStrictEqual(iconv.encode(str, "utf-32le"), utils.bytes(leBuf))
    assert.deepEqual(new Iconv("UTF-8", "UTF-32LE").convert(str), leBuf)
  })

  it("handles decoding all valid code points (LE)", function ({ skip }) {
    if (!Iconv) { skip() }
    const { str, leBuf } = buildAll()
    assert.equal(iconv.decode(leBuf, "utf-32le"), str)
    assert.equal(new Iconv("UTF-32LE", "UTF-8").convert(leBuf).toString("utf8"), str)
  })

  it("handles encoding all valid code points (BE)", function ({ skip }) {
    if (!Iconv) { skip() }
    const { str, beBuf } = buildAll()
    assert.deepStrictEqual(iconv.encode(str, "utf-32be"), utils.bytes(beBuf))
    assert.deepEqual(new Iconv("UTF-8", "UTF-32BE").convert(str), beBuf)
  })

  it("handles decoding all valid code points (BE)", function ({ skip }) {
    if (!Iconv) { skip() }
    const { str, beBuf } = buildAll()
    assert.equal(iconv.decode(beBuf, "utf-32be"), str)
    assert.equal(new Iconv("UTF-32BE", "UTF-8").convert(beBuf).toString("utf8"), str)
  })
})
