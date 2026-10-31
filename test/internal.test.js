import assert from "assert"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()

const cases = [
  { encoding: "utf8", text: "A¢€😱", bytes: "41 c2 a2 e2 82 ac f0 9f 98 b1" },
  { encoding: "cesu8", text: "A¢€😱", bytes: "41 c2 a2 e2 82 ac ed a0 bd ed b8 b1" },
  { encoding: "binary", text: "\x00\x80\xff", bytes: "00 80 ff" },
  { encoding: "hex", text: "0080ff", bytes: "00 80 ff" },
  { encoding: "base64", text: "AID/", bytes: "00 80 ff" }
]

describe("Internal codecs #node-web", function () {
  for (const { encoding, text, bytes } of cases) {
    it(`encodes and decodes ${encoding} with the environment's byte type`, function () {
      const encoded = iconv.encode(text, encoding)
      assert.strictEqual(encoded.constructor, utils.BytesType)
      assert.strictEqual(utils.hex(encoded), bytes)
      assert.strictEqual(iconv.decode(encoded, encoding), text)
      assert.strictEqual(iconv.encode("", encoding).constructor, utils.BytesType)
      assert.strictEqual(iconv.encode("", encoding).length, 0)
      assert.strictEqual(iconv.decode(new Uint8Array(0), encoding), "")
    })

    it(`decodes ${encoding} from a Uint8Array view at every chunk boundary`, function () {
      const expected = utils.bytes(bytes)
      const padded = new Uint8Array(expected.length + 4).fill(0xff)
      padded.set(expected, 2)
      const input = padded.subarray(2, padded.length - 2)
      for (let split = 0; split <= input.length; split++) {
        const decoder = iconv.getDecoder(encoding)
        const result = decoder.write(input.subarray(0, split)) +
          decoder.write(new Uint8Array(0)) + decoder.write(input.subarray(split)) + (decoder.end() || "")
        assert.strictEqual(result, text, `split at ${split}`)
      }
    })
  }

  it("preserves UTF-8 surrogate pairs across writes and replaces lone surrogates", function () {
    const text = "a😱\uD800b\uDC00c\uD800"
    const expected = "61 f0 9f 98 b1 ef bf bd 62 ef bf bd 63 ef bf bd"
    for (let split = 0; split <= text.length; split++) {
      const encoder = iconv.getEncoder("utf8")
      const output = [encoder.write(text.slice(0, split)), encoder.write(""), encoder.write(text.slice(split))]
      const tail = encoder.end()
      if (tail) output.push(tail)
      assert.strictEqual(utils.hex(utils.concatBufs(output)), expected)
      assert.strictEqual(encoder.end(), undefined)
    }
  })

  it("honors UTF-8 BOM options and strips only one leading BOM", function () {
    const input = utils.bytes("ef bb bf ef bb bf 61")
    assert.strictEqual(iconv.decode(input, "utf8"), "\uFEFFa")
    assert.strictEqual(iconv.decode(input, "utf8", { stripBOM: false }), "\uFEFF\uFEFFa")
    let calls = 0
    const decoder = iconv.getDecoder("utf8", { stripBOM: () => { calls++ } })
    assert.strictEqual(decoder.write(input.subarray(0, 1)), "")
    assert.strictEqual(decoder.write(input.subarray(1)), "\uFEFFa")
    assert.strictEqual(decoder.end(), "")
    assert.strictEqual(calls, 1)
    assert.strictEqual(utils.hex(iconv.encode("a", "utf8", { addBOM: true })), "ef bb bf 61")
  })

  it("replaces invalid UTF-8 and throws in fatal mode, including final flush", function () {
    assert.strictEqual(iconv.decode(utils.bytes("ff e2 82"), "utf8"), "��")
    assert.throws(() => iconv.decode(utils.bytes("ff"), "utf8", { fatal: true }), TypeError)
    const decoder = iconv.getDecoder("utf8", { fatal: true })
    assert.strictEqual(decoder.write(utils.bytes("e2 82")), "")
    assert.throws(() => decoder.end(), TypeError)
  })

  it("preserves CESU-8 code units and flushes an incomplete sequence once", function () {
    const text = "\uD800a\uDC00😱"
    const bytes = "ed a0 80 61 ed b0 80 ed a0 bd ed b8 b1"
    assert.strictEqual(utils.hex(iconv.encode(text, "cesu8")), bytes)
    assert.strictEqual(iconv.decode(utils.bytes(bytes), "cesu8"), text)
    assert.strictEqual(iconv.decode(utils.bytes("c0 80"), "cesu8"), "\0")
    assert.strictEqual(iconv.decode(utils.bytes("e0 80 80"), "cesu8"), "�")
    assert.strictEqual(iconv.decode(utils.bytes("ed a0"), "cesu8"), "�")
    assert.strictEqual(iconv.decode(utils.bytes("e0 a0"), "cesu8"), "�")
    assert.strictEqual(iconv.decode(utils.bytes("c2"), "cesu8"), "�")
    assert.strictEqual(iconv.decode(utils.bytes("41 e0 a0"), "cesu8"), "A�")
    assert.strictEqual(iconv.decode(utils.bytes("58 e6 97"), "cesu8"), "X�")
    assert.strictEqual(iconv.decode(utils.bytes("58 c3"), "cesu8"), "X�")
    const decoder = iconv.getDecoder("cesu8")
    assert.strictEqual(decoder.write(utils.bytes("ed")), "")
    assert.strictEqual(decoder.end(), "�")
    assert.strictEqual(decoder.end(), undefined)
    assert.strictEqual(decoder.write(utils.bytes("61")), "a")
  })

  it("uses the low byte of each UTF-16 code unit for binary", function () {
    assert.strictEqual(utils.hex(iconv.encode("\u0100\u0180\u01FF😱", "binary")), "00 80 ff 3d 31")
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const text = Array.from(bytes, byte => String.fromCharCode(byte)).join("")
    assert.strictEqual(iconv.decode(bytes, "binary"), text)
    assert.strictEqual(utils.hex(iconv.encode(text, "binary")), utils.hex(utils.bytes(bytes)))
  })

  it("keeps forgiving hex parsing, including invalid pairs and odd tails", function () {
    for (const [input, expected] of [["00aAFF", "00 aa ff"], ["a", ""], ["ab1", "ab"], ["ab1gff", "ab"], ["\u0130a", "0a"]]) {
      assert.strictEqual(utils.hex(iconv.encode(input, "hex")), expected, input)
    }
  })

  it("keeps forgiving Base64 parsing and URL-safe characters", function () {
    for (const [input, expected] of [["Q", ""], ["QQ", "41"], ["QUJ", "41 42"], ["QUJDQ", "41 42 43"], ["QQ==QQ==", "41"], ["Q!Q", "41"], ["Q Q", "41"], ["Q_8-", "43 ff 3e"], ["\u0141Q==", "01"]]) {
      assert.strictEqual(utils.hex(iconv.encode(input, "base64")), expected, input)
    }
  })

  it("encodes Base64 across every chunk boundary, including missing padding", function () {
    for (const text of ["SGVsbG8=", "SGVsbG8"]) {
      for (let split = 0; split <= text.length; split++) {
        const encoder = iconv.getEncoder("base64")
        const result = utils.concatBufs([encoder.write(text.slice(0, split)), encoder.write(text.slice(split)), encoder.end()])
        assert.strictEqual(utils.hex(result), "48 65 6c 6c 6f")
      }
    }
  })

  it("preserves binary, hex and Base64 input after callers mutate it", function () {
    for (const [encoding, expected] of [["binary", "\x80\xff"], ["hex", "80ff"], ["base64", "gP8="]]) {
      const input = new Uint8Array([0x80, 0xff])
      const decoder = iconv.getDecoder(encoding)
      const output = decoder.write(input)
      input.fill(0)
      assert.strictEqual(output + decoder.end(), expected)
      assert.strictEqual(decoder.end(), "")
    }
  })

  it("decodes many binary, hex and Base64 chunks incrementally", function () {
    const input = new Uint8Array(257).fill(0x80)
    for (const [encoding, expected] of [["binary", "\x80".repeat(257)], ["hex", "80".repeat(257)], ["base64", "gICA".repeat(85) + "gIA="]]) {
      for (const size of [1, 2, 3, 7, 16, 32, 63, 64]) {
        const decoder = iconv.getDecoder(encoding)
        const chunk = new Uint8Array(size)
        let output = ""
        for (let offset = 0; offset < input.length; offset += size) {
          const length = Math.min(size, input.length - offset)
          chunk.fill(0x80)
          output += decoder.write(chunk.subarray(0, length))
          chunk.fill(0)
        }
        assert.strictEqual(output + decoder.end(), expected)
        assert.strictEqual(decoder.end(), "")
        assert.strictEqual(decoder.write(input) + decoder.end(), expected)
      }
    }
  })

  it("handles large binary, hex and Base64 buffers without argument limits", function () {
    const input = new Uint8Array(90000).fill(0x80)
    for (const [encoding, text] of [["binary", "\x80".repeat(90000)], ["hex", "80".repeat(90000)], ["base64", "gICA".repeat(30000)]]) {
      assert.strictEqual(iconv.decode(input, encoding), text)
      assert.deepStrictEqual(Array.from(iconv.encode(text, encoding)), Array.from(input))
    }
  })
})
