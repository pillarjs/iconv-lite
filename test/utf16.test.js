"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()
const hex = utils.hex

// prettier-ignore
const testStr = "1aя中文☃💩"
const utf16leBuf = utils.bytes("31 00 61 00 4f 04 2d 4e 87 65 03 26 3d d8 a9 dc")
const utf16beBuf = utils.bytes("00 31 00 61 04 4f 4e 2d 65 87 26 03 d8 3d dc a9")
const utf16leBOM = utils.bytes("ff fe")
const utf16beBOM = utils.bytes("fe ff")
const sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<数据>נְתוּנִים</数据>"
const weirdBuf = utils.bytes("15 16 17 18") // Can't automatically detect whether it's LE or BE.

describe("UTF-16LE encoder #node-web", function () {
  const enc = "utf16-le"
  it("encodes basic strings correctly", function () {
    assert.equal(hex(iconv.encode("", enc)), "")
    assert.equal(hex(iconv.encode(testStr, enc)), hex(utf16leBuf))
  })

  it("adds BOM if asked", function () {
    assert.equal(
      hex(iconv.encode(testStr, enc, { addBOM: true })),
      hex(utf16leBOM) + " " + hex(utf16leBuf)
    )
  })

  // NOTE: I'm not sure what the right behavior is here. Node.js keeps all invalid surrogates as-is for
  // both utf-16le and ucs2 encodings. TextEncoder can't encode utf-16, but when using utf-8, replaces
  // these with '�'. Leaning towards Node side for now.
  it("keeps single and invalid surrogates as-is", function () {
    assert.equal(
      hex(iconv.encode(" \uD800 \uDE00 \uDE00\uD800 \uD800", enc)),
      hex(utils.bytes("2000 00d8 2000 00de 2000 00de 00d8 2000 00d8"))
    )
  })

  it("has full 16-bit transparency", function () {
    let s = ""
    const arr = []
    for (let i = 0; i < 65536; i++) {
      s += String.fromCharCode(i)
      arr.push(i & 0xff, i >> 8)
    }
    assert.equal(hex(iconv.encode(s, enc)), hex(utils.bytes(arr)))
  })

  it("keeps valid surrogate pairs split on a chunk boundary unchanged", function () {
    const encoder = iconv.getEncoder(enc)
    assert.equal(hex(encoder.write("\uD83D")), "3d d8")
    assert.equal(hex(encoder.write("\uDCA9")), "a9 dc")
    assert.strictEqual(encoder.end(), undefined)
  })
})

describe("UTF-16LE decoder #node-web", function () {
  const enc = "utf16-le"
  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf16leBuf, enc), testStr)
  })

  it("decodes uneven length buffers showing an error", function () {
    assert.equal(iconv.decode(utils.bytes("61 00 00"), enc), "a�")
  })

  it("decodes very short buffers correctly", function () {
    assert.equal(iconv.decode(utils.bytes([]), enc), "")
    assert.equal(iconv.decode(utils.bytes([0x61]), enc), "�")
  })

  // NOTE: Node and Web backends differ in handling invalid surrogates: node passes them through, web
  // replaces them with '�'. Don't know what to do with this, as I haven't found a performant way
  // to unify them while keeping compatibility with Node 4.5 where there's no TextDecoder.
  // Not too worried as it seems like an edge case, but something to be aware of.
  // When this is resolved, please add the same tests to utf16-be codec too.
  it.skip("passes through invalid surrogates as-is", function () {
    // prettier-ignore
    const buf = utils.bytes("2000 00d8 2000 00de 2000 00de 00d8 2000 00d8")
    assert.equal(iconv.decode(buf, enc), " \uD800 \uDE00 \uDE00\uD800 \uD800")
  })

  // See comment in the test above.
  it.skip("has full 16-bit transparency", function () {
    let s = ""
    const arr = []
    for (let i = 0; i < 65536; i++) {
      s += String.fromCharCode(i)
      arr.push(i & 0xff, i >> 8)
    }
    assert.equal(iconv.decode(utils.bytes(arr), enc), s)
  })

  it(
    "handles chunks with uneven lengths correctly",
    utils.checkDecoderChunks(enc, {
      inputs: [[], [0x61], [], [0x00], [0x61], [0x00, 0x61], [0x00, 0x00]],
      outputs: ["", "", "", "a", "", "a", "a", "�"]
    })
  )

  it(
    "doesn't split valid surrogate pairs between chunks",
    utils.checkDecoderChunks(enc, [
      {
        inputs: [[0x3d, 0xd8, 0x3b], [0xde]],
        outputs: ["", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3d, 0xd8], [0x3b], [0xde]],
        outputs: ["", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3d], [0xd8, 0x3b], [0xde]],
        outputs: ["", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3d], [0xd8], [0x3b], [0xde]],
        outputs: ["", "", "", "\uD83D\uDE3B"]
      }
    ])
  )

  it(
    "handles complex surrogate pairs cases",
    utils.checkDecoderChunks(enc, [
      {
        inputs: [[0x3e], [0xd9], [0x3d], [0xd8], [0x3b], [0xde]],
        outputs: ["", "", "", "\uD93E", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3e, 0xd9, 0x3d], [0xd8], [0x3b, 0xde]],
        outputs: ["", "\uD93E", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3e, 0xd9, 0x3d]],
        outputs: ["", "\uD93E�"]
      },
      {
        inputs: [[0x3e, 0xd9], [0x3d]],
        outputs: ["", "", "\uD93E�"]
      },
      {
        inputs: [[0x3e, 0xd9]],
        outputs: ["", "\uD93E"]
      }
    ])
  )
})

describe("UTF-16BE encoder #node-web", function () {
  const enc = "utf16-be"
  it("encodes basic strings correctly", function () {
    assert.equal(hex(iconv.encode("", enc)), "")
    assert.equal(hex(iconv.encode(testStr, enc)), hex(utf16beBuf))
  })

  it("adds BOM if asked", function () {
    assert.equal(
      hex(iconv.encode(testStr, enc, { addBOM: true })),
      hex(utf16beBOM) + " " + hex(utf16beBuf)
    )
  })

  // See note in UTF-16LE encoder above; we need to keep them consistent.
  it("keeps single and invalid surrogates as-is", function () {
    assert.equal(
      hex(iconv.encode(" \uD800 \uDE00 \uDE00\uD800 \uD800", enc)),
      hex(utils.bytes("0020 d800 0020 de00 0020 de00 d800 0020 d800"))
    )
  })

  it("handles valid surrogate pairs on chunk boundary correctly", function () {
    const encoder = iconv.getEncoder(enc)
    assert.equal(hex(encoder.write("\uD83D")), "d8 3d")
    assert.equal(hex(encoder.write("\uDCA9")), "dc a9")
    assert.strictEqual(encoder.end(), undefined)
  })
})

describe("UTF-16BE decoder #node-web", function () {
  const enc = "utf16-be"
  it("decodes basic buffers correctly", function () {
    assert.equal(iconv.decode(utf16beBuf, enc), testStr)
  })

  it("decodes uneven length buffers showing an error", function () {
    assert.equal(iconv.decode(utils.bytes([0, 0x61, 0]), enc), "a�")
  })

  it("decodes very short buffers correctly", function () {
    assert.equal(iconv.decode(utils.bytes([]), enc), "")
    assert.equal(iconv.decode(utils.bytes([0x61]), enc), "�")
  })

  it(
    "handles chunks with uneven lengths correctly",
    utils.checkDecoderChunks(enc, {
      inputs: [[], [0x00], [], [0x61], [0x00], [0x61, 0x00], [0x61, 0x00]],
      outputs: ["", "", "", "a", "", "a", "a", "�"]
    })
  )

  it(
    "doesn't split valid surrogate pairs between chunks",
    utils.checkDecoderChunks(enc, [
      {
        inputs: [[0xd8, 0x3d, 0xde], [0x3b]],
        outputs: ["", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd8, 0x3d], [0xde], [0x3b]],
        outputs: ["", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd8], [0x3d, 0xde], [0x3b]],
        outputs: ["", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd8], [0x3d], [0xde], [0x3b]],
        outputs: ["", "", "", "\uD83D\uDE3B"]
      }
    ])
  )

  it(
    "handles complex surrogate pairs cases",
    utils.checkDecoderChunks(enc, [
      {
        inputs: [[0xd9], [0x3e], [0xd8], [0x3d], [0xde], [0x3b]],
        outputs: ["", "", "", "\uD93E", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd9, 0x3e, 0xd8], [0x3d], [0xde, 0x3b]],
        outputs: ["", "\uD93E", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd9, 0x3e, 0xd8]],
        outputs: ["", "\uD93E�"]
      },
      {
        inputs: [[0xd9, 0x3e], [0xd8]],
        outputs: ["", "", "\uD93E�"]
      },
      {
        inputs: [[0xd9, 0x3e]],
        outputs: ["", "\uD93E"]
      }
    ])
  )
})

describe("UTF-16 encoder #node-web", function () {
  const enc = "utf-16"
  it("uses UTF-16LE and adds BOM when encoding", function () {
    assert.equal(hex(iconv.encode(testStr, enc)), hex(utf16leBOM) + " " + hex(utf16leBuf))
  })

  it("can skip BOM", function () {
    assert.equal(hex(iconv.encode(testStr, enc, { addBOM: false })), hex(utf16leBuf))
  })
})

describe("UTF-16 decoder #node-web", function () {
  const enc = "utf-16"
  const encLE = "utf-16le"
  const encBE = "utf-16be"

  it("uses BOM to determine encoding", function () {
    assert.equal(iconv.decode(utils.concatBufs([utf16leBOM, utf16leBuf]), enc), testStr)
    assert.equal(iconv.decode(utils.concatBufs([utf16beBOM, utf16beBuf]), enc), testStr)
  })

  it("handles very short buffers", function () {
    assert.equal(iconv.decode(utils.bytes([]), enc), "")
    assert.equal(iconv.decode(utils.bytes([0x61]), enc), "�")
  })

  it("uses spaces when there is no BOM to determine encoding", function () {
    assert.equal(iconv.decode(iconv.encode(sampleStr, encLE), enc), sampleStr)
    assert.equal(iconv.decode(iconv.encode(sampleStr, encBE), enc), sampleStr)
  })

  it("uses UTF-16LE if no BOM and heuristics failed", function () {
    assert.equal(iconv.decode(weirdBuf, enc), iconv.decode(weirdBuf, encLE))
  })

  it("can be given a different default encoding", function () {
    assert.equal(
      iconv.decode(weirdBuf, enc, { defaultEncoding: encBE }),
      iconv.decode(weirdBuf, encBE)
    )
  })
})
