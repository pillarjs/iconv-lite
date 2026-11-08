import { expect } from "vitest"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

// From the vendored WPT gb18030-decoder.any.js, including the edges of both gaps.
const pointerBoundaries: [number, string, string][] = [
  [0, "81 30 81 30", "\u0080"],
  [7457, "81 35 f4 37", "\uE7C7"], // GB18030-2005 exception to the ranges table.
  [39419, "84 31 a4 39", "\uFFFF"],
  [39420, "84 31 a5 30", "�"],
  [188999, "8f 39 fe 39", "�"],
  [189000, "90 30 81 30", "\u{10000}"],
  [1237575, "e3 32 9a 35", "\u{10FFFF}"],
  [1237576, "e3 32 9a 36", "�"],
  [1587599, "fe 39 fe 39", "�"]
]

function pointerBytes (pointer: number, bytes: Uint8Array) {
  bytes[0] = Math.floor(pointer / 12600) + 0x81
  bytes[1] = Math.floor((pointer % 12600) / 1260) + 0x30
  bytes[2] = Math.floor((pointer % 1260) / 10) + 0x81
  bytes[3] = (pointer % 10) + 0x30
  return bytes
}

function decodeSplit (bytes: Uint8Array, at: number, encoding = "gb18030") {
  const decoder = iconv.getDecoder(encoding)
  return decoder.write(bytes.subarray(0, at)) + decoder.write(new Uint8Array(0)) +
    decoder.write(bytes.subarray(at)) + decoder.end()
}

function forEachFourByteSequence (check: (bytes: Uint8Array, pointer: number) => void) {
  const bytes = utils.bytes([0, 0, 0, 0])
  let pointer = 0
  for (let b1 = 0x81; b1 <= 0xFE; b1++) {
    bytes[0] = b1
    for (let b2 = 0x30; b2 <= 0x39; b2++) {
      bytes[1] = b2
      for (let b3 = 0x81; b3 <= 0xFE; b3++) {
        bytes[2] = b3
        for (let b4 = 0x30; b4 <= 0x39; b4++) {
          bytes[3] = b4
          check(bytes, pointer++)
        }
      }
    }
  }
  expect(pointer).toBe(1587600)
}

describe("GB18030 pointer ranges", { timeout: 30000 }, function () {
  for (const encoding of ["gb18030", "gbk"]) {
    it(`decodes assigned and unassigned ${encoding} boundaries at every chunk split`, function () {
      for (const [pointer, hex, expected] of pointerBoundaries) {
        const bytes = utils.bytes(hex)
        expect(iconv.decode(bytes, encoding), `pointer ${pointer}`).toBe(expected)
        for (let split = 0; split <= bytes.length; split++) {
          expect(decodeSplit(bytes, split, encoding), `pointer ${pointer}, split ${split}`).toBe(expected)
        }
      }
    })
  }

  it("consumes an invalid pointer once and continues decoding subsequent characters", function () {
    const bytes = utils.bytes("41 84 31 a5 30 e3 32 9a 36 fe 39 fe 39 90 30 81 30 42")
    const expected = "A���\u{10000}B"
    for (let split = 0; split <= bytes.length; split++) {
      expect(decodeSplit(bytes, split), `split ${split}`).toBe(expected)
    }
    const decoder = iconv.getDecoder("gb18030")
    let actual = ""
    for (let i = 0; i < bytes.length; i++) actual += decoder.write(bytes.subarray(i, i + 1))
    expect(actual + decoder.end()).toBe(expected)
    expect(decoder.end()).toBe("")
  })

  it("respects the offset and length of an input view", function () {
    const bytes = utils.bytes("ff 84 31 a5 30 90 30 81 30 ff")
    expect(iconv.decode(bytes.subarray(1, -1), "gb18030")).toBe("�\u{10000}")
  })

  it("uses the configured replacement character for unassigned pointers", function () {
    const savedDefault = iconv.defaultCharUnicode
    const savedCache = iconv._codecDataCache
    try {
      iconv.defaultCharUnicode = "!"
      iconv._codecDataCache = Object.create(null)
      expect(iconv.decode(utils.bytes("84 31 a5 30 e3 32 9a 36"), "gb18030")).toBe("!!")
    } finally {
      iconv.defaultCharUnicode = savedDefault
      iconv._codecDataCache = savedCache
    }
  })

  it("emits well-formed UTF-16 for every four-byte sequence and replaces all unassigned pointers", function () {
    let unassigned = 0
    forEachFourByteSequence((bytes, pointer: number) => {
      const decoded = iconv.decode(bytes, "gb18030")
      if (!decoded.isWellFormed()) throw new Error(`${utils.hex(bytes)} decoded to ill-formed UTF-16`)
      if ((pointer >= 39420 && pointer < 189000) || pointer > 1237575) {
        if (decoded !== "�") throw new Error(`${utils.hex(bytes)} should be unassigned`)
        unassigned++
      }
    })
    expect(unassigned).toBe(499604)
  })

  it("decodes every four-byte sequence like the platform decoder", function ({ skip }) {
    let native
    try { native = new TextDecoder("gb18030") } catch { return skip() }
    // Some small-ICU builds accept the label without providing the right decoder.
    for (const [, hex, expected] of pointerBoundaries) {
      if (native.decode(utils.bytes(hex)) !== expected) return skip()
    }
    forEachFourByteSequence(bytes => {
      const actual = iconv.decode(bytes, "gb18030")
      const expected = native.decode(bytes)
      if (actual !== expected) throw new Error(`${utils.hex(bytes)}: got ${utils.strToHex(actual)}, expected ${utils.strToHex(expected)}`)
    })
  })

  it("decodes supplementary characters correctly at every split across the range", function () {
    const pointers = [189000, 189001, 1237574, 1237575]
    for (let pointer = 189000; pointer <= 1237575; pointer += 97) pointers.push(pointer)
    const bytes = utils.bytes([0, 0, 0, 0])
    for (const pointer of pointers) {
      pointerBytes(pointer, bytes)
      const expected = String.fromCodePoint(0x10000 + pointer - 189000)
      for (let split = 1; split <= 3; split++) {
        expect(decodeSplit(bytes, split), `pointer ${pointer}, split ${split}`).toBe(expected)
      }
    }
  })
})
