import { expect } from "vitest"
import utils from "./helpers/utils.js"
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

describe("ucs2 alias", function () {
  it("decodes identically to utf-16le", function () {
    expect(iconv.decode(utf16leBuf, "ucs2")).toBe(iconv.decode(utf16leBuf, "utf-16le"))
  })

  it("encodes identically to utf-16le", function () {
    expect(hex(iconv.encode(testStr, "ucs2"))).toBe(hex(iconv.encode(testStr, "utf-16le")))
  })

  it("resolves the 'ucs-2' label too", function () {
    expect(iconv.decode(utf16leBuf, "ucs-2")).toBe(iconv.decode(utf16leBuf, "utf-16le"))
  })
})

describe("WHATWG utf-16 label aliases", function () {
  for (const label of ["unicode", "csunicode", "iso-10646-ucs-2", "unicodefeff"]) {
    it(`'${label}' decodes as UTF-16LE`, function () {
      expect(iconv.decode(utf16leBuf, label)).toBe(iconv.decode(utf16leBuf, "utf-16le"))
    })
  }

  it("'unicodefffe' decodes as UTF-16BE", function () {
    expect(iconv.decode(utf16beBuf, "unicodefffe")).toBe(iconv.decode(utf16beBuf, "utf-16be"))
  })
})

describe("UTF-16LE encoder", function () {
  const enc = "utf16-le"
  it("encodes basic strings correctly", function () {
    expect(hex(iconv.encode("", enc))).toBe("")
    expect(hex(iconv.encode(testStr, enc))).toBe(hex(utf16leBuf))
  })

  it("adds BOM if asked", function () {
    expect(hex(iconv.encode(testStr, enc, { addBOM: true }))).toBe(hex(utf16leBOM) + " " + hex(utf16leBuf))
  })

  // NOTE: I'm not sure what the right behavior is here. Node.js keeps all invalid surrogates as-is for
  // both utf-16le and ucs2 encodings. TextEncoder can't encode utf-16, but when using utf-8, replaces
  // these with '�'. Leaning towards Node side for now.
  it("keeps single and invalid surrogates as-is", function () {
    expect(hex(iconv.encode(" \uD800 \uDE00 \uDE00\uD800 \uD800", enc))).toBe(hex(utils.bytes("2000 00d8 2000 00de 2000 00de 00d8 2000 00d8")))
  })

  it("has full 16-bit transparency", function () {
    let s = ""
    const arr = []
    for (let i = 0; i < 65536; i++) {
      s += String.fromCharCode(i)
      arr.push(i & 0xff, i >> 8)
    }
    expect(hex(iconv.encode(s, enc))).toBe(hex(utils.bytes(arr)))
  })

  it("keeps valid surrogate pairs split on a chunk boundary unchanged", function () {
    const encoder = iconv.getEncoder(enc)
    expect(hex(encoder.write("\uD83D"))).toBe("3d d8")
    expect(hex(encoder.write("\uDCA9"))).toBe("a9 dc")
    expect(encoder.end()).toBe(undefined)
  })
})

describe("UTF-16LE decoder", function () {
  const enc = "utf16-le"
  it("decodes basic buffers correctly", function () {
    expect(iconv.decode(utf16leBuf, enc)).toBe(testStr)
  })

  it("decodes uneven length buffers showing an error", function () {
    expect(iconv.decode(utils.bytes("61 00 00"), enc)).toBe("a�")
  })

  it("decodes very short buffers correctly", function () {
    expect(iconv.decode(utils.bytes([]), enc)).toBe("")
    expect(iconv.decode(utils.bytes([0x61]), enc)).toBe("�")
  })

  // Per the WHATWG Encoding Standard, the UTF-16 decoder replaces unpaired/invalid surrogates with
  // U+FFFD. (This behaves identically across the Node and Web backends.)
  it("replaces unpaired surrogates with U+FFFD (per WHATWG)", function () {
    // prettier-ignore
    const buf = utils.bytes("2000 00d8 2000 00de 2000 00de 00d8 2000 00d8")
    expect(iconv.decode(buf, enc)).toBe(" � � �� �")
  })

  it("round-trips all non-surrogate BMP code points", function () {
    let s = ""
    for (let i = 0; i < 0x10000; i++) {
      if (i >= 0xD800 && i <= 0xDFFF) continue // Surrogates aren't round-trippable per WHATWG.
      s += String.fromCharCode(i)
    }
    expect(iconv.decode(iconv.encode(s, enc), enc)).toBe(s)
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
        outputs: ["", "", "", "\uFFFD", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3e, 0xd9, 0x3d], [0xd8], [0x3b, 0xde]],
        outputs: ["", "\uFFFD", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0x3e, 0xd9, 0x3d]],
        outputs: ["", "�"]
      },
      {
        inputs: [[0x3e, 0xd9], [0x3d]],
        outputs: ["", "", "�"]
      },
      {
        inputs: [[0x3e, 0xd9]],
        outputs: ["", "�"]
      }
    ])
  )
})

describe("UTF-16BE encoder", function () {
  const enc = "utf16-be"
  it("encodes basic strings correctly", function () {
    expect(hex(iconv.encode("", enc))).toBe("")
    expect(hex(iconv.encode(testStr, enc))).toBe(hex(utf16beBuf))
  })

  it("adds BOM if asked", function () {
    expect(hex(iconv.encode(testStr, enc, { addBOM: true }))).toBe(hex(utf16beBOM) + " " + hex(utf16beBuf))
  })

  // See note in UTF-16LE encoder above; we need to keep them consistent.
  it("keeps single and invalid surrogates as-is", function () {
    expect(hex(iconv.encode(" \uD800 \uDE00 \uDE00\uD800 \uD800", enc))).toBe(hex(utils.bytes("0020 d800 0020 de00 0020 de00 d800 0020 d800")))
  })

  it("handles valid surrogate pairs on chunk boundary correctly", function () {
    const encoder = iconv.getEncoder(enc)
    expect(hex(encoder.write("\uD83D"))).toBe("d8 3d")
    expect(hex(encoder.write("\uDCA9"))).toBe("dc a9")
    expect(encoder.end()).toBe(undefined)
  })
})

describe("UTF-16BE decoder", function () {
  const enc = "utf16-be"
  it("decodes basic buffers correctly", function () {
    expect(iconv.decode(utf16beBuf, enc)).toBe(testStr)
  })

  it("decodes uneven length buffers showing an error", function () {
    expect(iconv.decode(utils.bytes([0, 0x61, 0]), enc)).toBe("a�")
  })

  it("decodes very short buffers correctly", function () {
    expect(iconv.decode(utils.bytes([]), enc)).toBe("")
    expect(iconv.decode(utils.bytes([0x61]), enc)).toBe("�")
  })

  // See note in the UTF-16LE decoder above.
  it("replaces unpaired surrogates with U+FFFD (per WHATWG)", function () {
    // prettier-ignore
    const buf = utils.bytes("0020 d800 0020 de00 0020 de00 d800 0020 d800")
    expect(iconv.decode(buf, enc)).toBe(" � � �� �")
  })

  it("round-trips all non-surrogate BMP code points", function () {
    let s = ""
    for (let i = 0; i < 0x10000; i++) {
      if (i >= 0xD800 && i <= 0xDFFF) continue // Surrogates aren't round-trippable per WHATWG.
      s += String.fromCharCode(i)
    }
    expect(iconv.decode(iconv.encode(s, enc), enc)).toBe(s)
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
        outputs: ["", "", "", "\uFFFD", "", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd9, 0x3e, 0xd8], [0x3d], [0xde, 0x3b]],
        outputs: ["", "\uFFFD", "\uD83D\uDE3B"]
      },
      {
        inputs: [[0xd9, 0x3e, 0xd8]],
        outputs: ["", "�"]
      },
      {
        inputs: [[0xd9, 0x3e], [0xd8]],
        outputs: ["", "", "�"]
      },
      {
        inputs: [[0xd9, 0x3e]],
        outputs: ["", "�"]
      }
    ])
  )
})

describe("UTF-16 encoder", function () {
  const enc = "utf-16"
  it("uses UTF-16LE and adds BOM when encoding", function () {
    expect(hex(iconv.encode(testStr, enc))).toBe(hex(utf16leBOM) + " " + hex(utf16leBuf))
  })

  it("doesn't change encoding options reused for other encodings", function () {
    const options = {}
    expect(hex(iconv.encode(testStr, enc, options))).toBe(hex(utf16leBOM) + " " + hex(utf16leBuf))
    expect(hex(iconv.encode("A", "utf8", options))).toBe("41")
    expect(options).toStrictEqual({})
  })

  it("accepts frozen encoding options when adding the default BOM", function () {
    expect(hex(iconv.encode(testStr, enc, Object.freeze({})))).toBe(hex(utf16leBOM) + " " + hex(utf16leBuf))
  })

  it("honors BOM defaults and explicit settings in frozen encoding options", function () {
    for (const [addBOM, includeBOM] of [[undefined, true], [null, false], [false, false], [true, true]]) {
      const expected = (includeBOM ? hex(utf16leBOM) + " " : "") + hex(utf16leBuf)
      expect(hex(iconv.encode(testStr, enc, Object.freeze({ addBOM })))).toBe(expected)
    }
  })

  it("preserves inherited encoding options", function () {
    class Options {
      get addBOM () { return false }
    }
    for (const options of [Object.create({ addBOM: false }), new Options()]) {
      expect(hex(iconv.encode(testStr, enc, options))).toBe(hex(utf16leBuf))
      expect(Object.keys(options)).toStrictEqual([])
    }
  })

  it("can skip BOM", function () {
    expect(hex(iconv.encode(testStr, enc, { addBOM: false }))).toBe(hex(utf16leBuf))
  })
})

describe("UTF-16 decoder", function () {
  const enc = "utf-16"
  const encLE = "utf-16le"
  const encBE = "utf-16be"

  it("uses BOM to determine encoding", function () {
    expect(iconv.decode(utils.concatBufs([utf16leBOM, utf16leBuf]), enc)).toBe(testStr)
    expect(iconv.decode(utils.concatBufs([utf16beBOM, utf16beBuf]), enc)).toBe(testStr)
  })

  it("handles very short buffers", function () {
    expect(iconv.decode(utils.bytes([]), enc)).toBe("")
    expect(iconv.decode(utils.bytes([0x61]), enc)).toBe("�")
  })

  it("uses spaces when there is no BOM to determine encoding", function () {
    expect(iconv.decode(iconv.encode(sampleStr, encLE), enc)).toBe(sampleStr)
    expect(iconv.decode(iconv.encode(sampleStr, encBE), enc)).toBe(sampleStr)
  })

  it("uses UTF-16LE if no BOM and heuristics failed", function () {
    expect(iconv.decode(weirdBuf, enc)).toBe(iconv.decode(weirdBuf, encLE))
  })

  it("can be given a different default encoding", function () {
    expect(iconv.decode(weirdBuf, enc, { defaultEncoding: encBE })).toBe(iconv.decode(weirdBuf, encBE))
  })

  it("keeps decoding chunks fed after the endianness was detected", function () {
    const d = iconv.getDecoder(enc)
    let res = d.write(utf16leBuf) // 16 bytes -> triggers detection, sets the inner decoder.
    res += d.write(utf16leBuf) // Subsequent chunk: inner decoder already chosen.
    res += d.end() || ""
    expect(res).toBe(testStr + testStr)
  })

  it("uses only the first 100 code units for the space heuristic", function () {
    for (const [encoding, opposite] of [[encLE, encBE], [encBE, encLE]]) {
      const input = utils.concatBufs([
        iconv.encode("a".repeat(100), encoding),
        iconv.encode("b".repeat(150), opposite)
      ])
      const expected = iconv.decode(input, encoding)
      expect(iconv.decode(input, enc)).toBe(expected)
      for (const split of [1, 15]) {
        const decoder = iconv.getDecoder(enc)
        const result = decoder.write(input.subarray(0, split)) + decoder.write(input.subarray(split)) + (decoder.end() || "")
        expect(result).toBe(expected)
      }
    }
  })
})

// Adapted from @exodus/bytes' utf16 tests: unpaired/invalid surrogates must be replaced with
// U+FFFD regardless of where they sit in the input. We re-check each case at a range of offsets,
// which shifts the bad code unit around and guards against position/alignment-specific bugs.
describe("UTF-16 decoder robustness", function () {
  const orphans = [
    { invalid: [0x61, 0x62, 0xD800, 0x77, 0x78], replaced: [0x61, 0x62, 0xFFFD, 0x77, 0x78] },
    { invalid: [0xD800], replaced: [0xFFFD] },
    { invalid: [0xD800, 0xD800], replaced: [0xFFFD, 0xFFFD] },
    { invalid: [0x61, 0x62, 0xDFFF, 0x77, 0x78], replaced: [0x61, 0x62, 0xFFFD, 0x77, 0x78] },
    { invalid: [0xDFFF, 0xD800], replaced: [0xFFFD, 0xFFFD] }
  ]

  function unitsToBytes (units, littleEndian) {
    const bytes = []
    for (const u of units) {
      if (littleEndian) { bytes.push(u & 0xff, u >> 8) } else { bytes.push(u >> 8, u & 0xff) }
    }
    return utils.bytes(bytes)
  }

  for (const enc of ["utf-16le", "utf-16be"]) {
    const le = enc === "utf-16le"
    for (const { invalid, replaced } of orphans) {
      const label = invalid.map((u) => u.toString(16)).join(",")
      it(`replaces unpaired surrogates [${label}] at any offset (${enc})`, function () {
        const expectedTail = String.fromCharCode.apply(null, replaced)
        for (let p = 0; p <= 40; p++) {
          const prefix = new Array(p).fill(0x20) // p spaces, shifting the bad unit's position.
          const buf = unitsToBytes(prefix.concat(invalid), le)
          expect(iconv.decode(buf, enc)).toBe(" ".repeat(p) + expectedTail)
        }
      })
    }
  }
})

// Opt-in WHATWG "fatal" mode: { fatal: true } throws on invalid input instead of replacing with
// U+FFFD. The default stays lenient (replacement), matching TextDecoder's own default.
describe("UTF-16 decoder fatal mode (opt-in)", function () {
  for (const enc of ["utf-16le", "utf-16be"]) {
    const lone = enc === "utf-16le" ? utils.bytes("00d8") : utils.bytes("d800") // Lone high surrogate.
    const odd = enc === "utf-16le" ? utils.bytes("610000") : utils.bytes("006100") // Truncated code unit.

    it(`throws on invalid input when { fatal: true } (${enc})`, function () {
      expect(function () { iconv.decode(lone, enc, { fatal: true }) }).toThrowError()
      expect(function () { iconv.decode(odd, enc, { fatal: true }) }).toThrowError()
    })

    it(`still decodes valid input when { fatal: true } (${enc})`, function () {
      expect(iconv.decode(iconv.encode(testStr, enc), enc, { fatal: true })).toBe(testStr)
    })

    it(`replaces instead of throwing by default (${enc})`, function () {
      expect(iconv.decode(lone, enc)).toBe("�")
    })
  }
})
