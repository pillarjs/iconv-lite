import type { ReadableOptions, TransformOptions } from "node:stream"
import type { EncodeOptions, DecodeOptions, Encoding } from "iconv-lite"
import { describe as describeVitest } from "vitest"
import assert from "assert"
import { Buffer } from "buffer"
import utils from "./helpers/utils.js"
import NodeIconv from "../lib/iconv-node.js"
import { Readable } from "stream"

const iconv = utils.requireIconv()
const describe = describeVitest.skipIf(!iconv.supportsStreams)

interface StreamCheckOptions {
  createStream?: () => Readable
  outputType?: string | false
  output?: unknown
  checkOutput?: (result: unknown) => void
  checkError?: RegExp | ((error: Error) => void)
}
type ConversionCheckOptions = StreamCheckOptions & {
  encoding: Encoding
  input: unknown
  encodingOptions?: EncodeOptions & DecodeOptions & Omit<TransformOptions, "defaultEncoding">
}

// Create a source stream that feeds given array of chunks.
function feeder (input: unknown) {
  const chunks: unknown[] = Array.isArray(input) ? input : [input]
  const opts: ReadableOptions = {}
  if (chunks.every(function (chunk) { return typeof chunk === "string" })) {
    opts.encoding = "utf8"
  }

  const stream = new Readable(opts)
  function writeChunk () {
    try {
      if (chunks.length > 0) {
        let chunk = chunks.shift()
        if (Array.isArray(chunk)) { chunk = Buffer.from(chunk) }
        stream.push(chunk, opts.encoding)
      } else {
        stream.push(null)
        return
      }
    } catch (e) {
      stream.emit("error", e)
    }
    process.nextTick(writeChunk)
  }
  stream._read = function () {
    writeChunk()
  }

  return stream
}

function checkStreamOutput (options: StreamCheckOptions) {
  return function () {
    return new Promise<void>((resolve, reject) => {
      let stream
      try {
        stream = options.createStream!()
      } catch (e) {
        check(e)
        return
      }
      const chunks: unknown[] = []
      stream.on("readable", function () {
        let chunk
        try {
          while ((chunk = stream.read()) != null) {
            if (options.outputType) {
              if (/^buffer/.test(options.outputType)) {
                assert(Buffer.isBuffer(chunk))
              } else {
                assert.strictEqual(typeof chunk, options.outputType)
              }
            }
            chunks.push(chunk)
          }
        } catch (e) {
          stream.emit("error", e)
        }
      })
      stream.on("error", check)
      stream.on("end", check)

      function check (err?: unknown) {
        try {
          if (options.checkError) {
            assert(err, "Expected error, but got success")
            if (options.checkError instanceof RegExp) {
              assert(options.checkError.test((err as Error).message), "Wrong error message: " + (err as Error).message)
            } else if (typeof options.checkError === "function") {
              options.checkError(err as Error)
            } else {
              assert.fail(null, null, "Invalid type of options.checkError: " + typeof options.checkError)
            }
          } else {
            assert.ifError(err)

            if (options.checkOutput) {
              let res: unknown = chunks
              const bufferType = typeof options.outputType === "string" && /^buffer-?(.*)/.exec(options.outputType)
              if (bufferType) {
                res = Buffer.concat(chunks as Uint8Array[])
                if (bufferType[1]) {
                  res = (res as Buffer).toString(bufferType[1] as BufferEncoding) // Convert to string to make comparing buffers easier.
                }
              } else if (options.outputType === "string") {
                res = chunks.join("")
              }

              options.checkOutput(res)
            }
          }
          resolve()
        } catch (e) {
          reject(e)
        }
      }
    })
  }
}

function checkEncodeStream (opts: ConversionCheckOptions) {
  opts.createStream = function () {
    return feeder(opts.input)
      .pipe(iconv.encodeStream(opts.encoding, opts.encodingOptions))
  }
  if (opts.outputType == null) opts.outputType = "buffer-hex"
  if (Buffer.isBuffer(opts.output) && opts.outputType === "buffer-hex") {
    opts.output = opts.output.toString("hex")
  }

  opts.checkOutput = opts.checkOutput || function (res) {
    assert.equal(res, opts.output)
  }

  return checkStreamOutput(opts)
}

function checkDecodeStream (opts: ConversionCheckOptions) {
  opts.createStream = function () {
    return feeder(opts.input)
      .pipe(iconv.decodeStream(opts.encoding, opts.encodingOptions))
  }
  if (opts.outputType == null) opts.outputType = "string"
  opts.checkOutput = opts.checkOutput || function (res) {
    assert.equal(res, opts.output)
  }

  return checkStreamOutput(opts)
}

describe("Streaming mode", function () {
  for (const frozen of [false, true]) {
    it(`preserves caller options in Node streams (frozen: ${frozen})`, async function () {
      const options = {
        defaultCharByte: 0x21,
        defaultCharUnicode: "<invalid>",
        decodeStrings: true,
        encoding: "hex" as const,
        highWaterMark: 1024
      }
      const original = { ...options }
      if (frozen) Object.freeze(options)
      const encoder = iconv.encodeStream("cp1253", options)
      const decoder = iconv.decodeStream("cp1253", options)
      assert.deepStrictEqual(options, original)
      assert.strictEqual(encoder.writableHighWaterMark, 1024)
      assert.strictEqual(decoder.readableHighWaterMark, 1024)
      encoder.end("A世")
      decoder.end(utils.bytes([0x41, 0xAA]))
      let encoded = ""
      let decoded = ""
      for await (const chunk of encoder) encoded += chunk
      for await (const chunk of decoder) decoded += chunk
      assert.strictEqual(encoded, "4121")
      assert.strictEqual(decoded, "A<invalid>")
      assert.deepStrictEqual(options, original)
    })
  }

  for (const withHandler of [false, true]) {
    it(`captures the DBCS replacement option in Node streams (handler: ${withHandler})`, async function () {
      const instance = new NodeIconv(iconv.backend)
      instance.encodingExists("gbk")
      const options = { defaultCharByte: 0x21, ...(withHandler ? { invalidCharHandler () {} } : {}) }
      const stream = instance.encodeStream("gbk", options)
      options.defaultCharByte = 0x23
      assert.deepStrictEqual(instance.encode("\uD800", "gbk", options), utils.bytes([0x23]))
      stream.write("A\uE7C7\uD83D")
      stream.end("\uDE42\uD800")
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      assert.deepStrictEqual(Array.from(Buffer.concat(chunks)), [0x41, 0x21, 0x21, 0x21])
    })
  }

  for (const [encoding, invalid] of [
    ["cesu8", "ff"], ["utf32le", "00 d8 00 00"],
    ["utf32be", "00 00 d8 00"], ["utf32", "00 d8 00 00"]
  ]) {
    it(encoding + " preserves literal replacement BOMs in Node streams", async function () {
      for (const replacement of ["\uFEFFx", ""]) {
        for (const addBOM of [false, true]) {
          let calls = 0
          const options = Object.freeze({ defaultCharUnicode: replacement, stripBOM () { calls++ } })
          const input = utils.concatBufs([
            iconv.encode("", encoding, { addBOM }), utils.bytes(invalid),
            iconv.encode("\uFEFFA", encoding, { addBOM: false })
          ])
          const stream = iconv.decodeStream(encoding, options)
          for (const byte of input) stream.write(utils.bytes([byte]))
          stream.end()
          let output = ""
          for await (const chunk of stream) output += chunk
          assert.strictEqual(output, replacement + "\uFEFFA")
          assert.strictEqual(calls, addBOM ? 1 : 0)
        }
      }
    })
  }

  for (const [encoding, input] of [
    ["gb18030", "41 84 31 a5 30 81"], ["cesu8", "41 ff e0"],
    ["utf32", "41 00 00 00 00 d8 00 00 00"]
  ]) {
    it(encoding + " captures replacement text through Node stream writes and finalization", async function () {
      for (const replacement of ["🙂", "<invalid>", "", "$&$`$'$$"]) {
        const options = { defaultCharUnicode: replacement }
        const stream = iconv.decodeStream(encoding, options)
        options.defaultCharUnicode = "!"
        stream.write(utils.bytes(input))
        stream.end(utils.bytes([]))
        let output = ""
        for await (const chunk of stream) output += chunk
        assert.strictEqual(output, "A" + replacement + replacement)
      }
    })
  }

  it("captures literal SBCS replacement options in Node streams", async function () {
    const instance = new NodeIconv(iconv.backend)
    for (const replacement of ["🙂", "<invalid>", "$&$`$'$$", "", "\0"]) {
      const options = { defaultCharUnicode: replacement }
      const stream = instance.decodeStream("cp1253", options)
      options.defaultCharUnicode = "?"
      stream.write(utils.bytes([0xAA]))
      stream.write(utils.bytes([]))
      stream.end(utils.bytes([0xAA]))
      let output = ""
      for await (const chunk of stream) output += chunk
      assert.strictEqual(output, replacement + replacement)
    }
  })

  it("keeps fatal decoding ahead of replacement options in Node streams", checkDecodeStream({
    encoding: "cp1253",
    encodingOptions: { defaultCharUnicode: "", fatal: true },
    input: [[0xAA]],
    checkError: error => assert(error instanceof TypeError)
  }))

  for (const encoding of ["utf32le", "utf32be", "utf32"]) {
    for (const truncated of [false, true]) {
      const invalid = truncated ? "00" : encoding === "utf32be" ? "00 00 d8 00" : "00 d8 00 00"
      it(`${encoding} propagates fatal TypeError during ${truncated ? "flush" : "write"}`, checkDecodeStream({
        encoding,
        encodingOptions: { fatal: true, defaultCharUnicode: "" },
        input: [iconv.encode("A".repeat(8), encoding), utils.bytes(invalid)],
        checkError: error => assert(error instanceof TypeError)
      }))
    }
  }

  for (const [encoding, lead] of [
    ["big5", 0xA1], ["shift_jis", 0x81], ["euc-jp", 0xA1],
    ["euc-kr", 0xB0], ["gbk", 0x81], ["gb18030", 0x81]
  ] as const) {
    for (const truncated of [false, true]) {
      it(`${encoding} propagates fatal TypeError during ${truncated ? "flush" : "write"}`, checkDecodeStream({
        encoding,
        encodingOptions: { fatal: true, defaultCharUnicode: "" },
        input: truncated ? [[0x41], [lead]] : [[0x41], [lead], [0x20]],
        checkError: error => assert(error instanceof TypeError)
      }))
    }
  }

  const userDefinedBytes = Array.from({ length: 256 }, (_, byte) => byte)
  const userDefinedText = String.fromCharCode(...userDefinedBytes.map(byte => byte < 0x80 ? byte : 0xF700 + byte))

  it("decodes every x-user-defined byte through a fatal Node stream", checkDecodeStream({
    encoding: "x-user-defined",
    encodingOptions: { fatal: true },
    input: userDefinedBytes.map(byte => [byte]),
    output: userDefinedText
  }))

  it("encodes every x-user-defined character through a Node stream", checkEncodeStream({
    encoding: "x-user-defined",
    input: Array.from(userDefinedText),
    output: Buffer.from(userDefinedBytes)
  }))

  it("preserves Windows C1 controls in fatal mode", checkDecodeStream({
    encoding: "windows-1252",
    encodingOptions: { fatal: true },
    input: [[0x81], [0x80, 0x41]],
    output: "\u0081€A"
  }))

  for (const [alias, text, bytes] of [
    ["ascii", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["latin1", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["iso-8859-9", "€Ğİş", [0x80, 0xD0, 0xDD, 0xFE]],
    ["tis-620", "€\u0081ก", [0x80, 0x81, 0xA1]]
  ] as const) {
    it(alias + " uses Windows mappings in Node encoder streams", checkEncodeStream({
      encoding: alias,
      input: Array.from(text),
      output: Buffer.from(bytes)
    }))
    it(alias + " uses Windows mappings in Node decoder streams", checkDecodeStream({
      encoding: alias,
      encodingOptions: { fatal: true },
      input: bytes.map((byte: number) => [byte]),
      output: text
    }))
  }

  it("propagates fatal errors through a Windows-874 alias in Node streams", checkDecodeStream({
    encoding: "tis-620",
    encodingOptions: { fatal: true },
    input: [[0x80], [0xDB]],
    checkError: error => assert(error instanceof TypeError)
  }))

  for (const [encoding, byte] of [
    ["windows-874", 0xDB], ["windows-1253", 0xAA],
    ["windows-1255", 0xD9], ["windows-1257", 0xA1]
  ] as const) {
    it(encoding + " propagates fatal decoder errors", checkDecodeStream({
      encoding,
      encodingOptions: { fatal: true },
      input: [[0x81], [0x41, byte, 0x42]],
      checkError: error => assert(error instanceof TypeError)
    }))
  }

  it("Feeder outputs strings", checkStreamOutput({
    createStream: function () { return feeder(["abc", "def"]) },
    outputType: "string",
    checkOutput: function (res) { assert.equal(res, "abcdef") }
  }))

  it("Feeder outputs buffers", checkStreamOutput({
    createStream: function () { return feeder([[0x61], [0x62]]) },
    outputType: "buffer",
    checkOutput: function (res) { assert(Buffer.isBuffer(res)); assert.equal(res.toString("hex"), "6162") }
  }))

  it("Feeder outputs buffers with encoding", checkStreamOutput({
    createStream: function () { return feeder([[0x61], [0x62, 0x63]]) },
    outputType: "buffer-hex",
    checkOutput: function (res) { assert.equal(res, "616263") }
  }))

  it("Simple stream encoding", checkEncodeStream({
    encoding: "us-ascii",
    input: ["hello ", "world!"],
    output: Buffer.from("hello world!")
  }))

  it("Simple stream decoding", checkDecodeStream({
    encoding: "us-ascii",
    input: [Buffer.from("hello "), Buffer.from("world!")],
    output: "hello world!"
  }))

  for (const [encoding, text, bytes] of [
    ["1200", "A🙂", [0x41, 0, 0x3D, 0xD8, 0x42, 0xDE]],
    ["cp1201", "A🙂", [0, 0x41, 0xD8, 0x3D, 0xDE, 0x42]],
    ["12000", "A🙂", [0x41, 0, 0, 0, 0x42, 0xF6, 1, 0]],
    ["cp12001", "A🙂", [0, 0, 0, 0x41, 0, 1, 0xF6, 0x42]],
    ["cp20127", "AB", [0x41, 0x42]],
    ["28591", "A\u0080", [0x41, 0x80]],
    ["cp28599", "A\u0080", [0x41, 0x80]],
    ["cp28601", "A\u0080", [0x41, 0x80]],
    ["65000", "A\u2262\u0391.", [0x41, 0x2B, 0x49, 0x6D, 0x49, 0x44, 0x6B, 0x51, 0x2D, 0x2E]],
    ["cp65001", "A\u2262\u0391.", [0x41, 0xE2, 0x89, 0xA2, 0xCE, 0x91, 0x2E]]
  ] as const) {
    it(encoding + " encodes Unicode in Node streams", checkEncodeStream({
      encoding,
      input: [text],
      output: Buffer.from(bytes)
    }))
    it(encoding + " decodes Unicode one byte at a time in Node streams", checkDecodeStream({
      encoding,
      input: bytes.map((byte: number) => [byte]),
      output: text
    }))
  }

  it("preserves strict ASCII fatal decoding through a Windows code page Node stream", checkDecodeStream({
    encoding: "20127",
    encodingOptions: { fatal: true },
    input: [[0x41], [0x80]],
    checkError: error => assert(error instanceof TypeError)
  }))

  it("Stream encoder should error when fed with buffers", checkEncodeStream({
    encoding: "us-ascii",
    input: [Buffer.from("hello "), Buffer.from("world!")],
    checkError: /Iconv encoding stream needs strings as its input/
  }))

  it("Stream decoder should be ok when fed with strings", checkDecodeStream({
    encoding: "us-ascii",
    input: ["hello ", "world!"],
    output: Buffer.from("hello world!")
  }))

  it("Stream decoder should be error when fed with strings and 'decodeStrings: false' option is given", checkDecodeStream({
    encoding: "us-ascii",
    encodingOptions: { decodeStrings: false },
    input: ["hello ", "world!"],
    checkError: /Iconv decoding stream needs Uint8Array-s or Buffers as its input/
  }))

  it("Round-trip encoding and decoding", checkStreamOutput({
    createStream: function () {
      return feeder(["абв", "где"])
        .pipe(iconv.encodeStream("windows-1251"))
        .pipe(iconv.decodeStream("windows-1251"))
        .pipe(iconv.encodeStream("windows-1251"))
        .pipe(iconv.decodeStream("windows-1251"))
    },
    outputType: "string",
    checkOutput: function (res) { assert.equal(res, "абвгде") }
  }))

  it("Decoding of incomplete chars using internal modules: utf8", checkDecodeStream({
    encoding: "utf8",
    input: [[0xE4], [0xB8, 0x82]],
    output: "丂"
  }))

  it("Decoding of incomplete chars using internal modules: utf8 / surrogates", checkDecodeStream({
    encoding: "utf8",
    input: [[0xF0], [0x9F, 0x98], [0xBB]], // U+1F63B, 😻, SMILING CAT FACE WITH HEART-SHAPED EYES
    outputType: false, // Don't concat
    checkOutput: function (res) { assert.deepEqual(res, ["\uD83D\uDE3B"]) } // We should have only 1 chunk.
  }))

  it("Decoding of incomplete chars using internal modules: ucs2 / surrogates", checkDecodeStream({
    encoding: "ucs2",
    input: [[0x3D], [0xD8, 0x3B], [0xDE]], // U+1F63B, 😻, SMILING CAT FACE WITH HEART-SHAPED EYES
    outputType: false, // Don't concat
    checkOutput: function (res) { assert.deepEqual(res, ["\uD83D\uDE3B"]) } // We should have only 1 chunk.
  }))

  it("Encoding using internal modules: utf8", checkEncodeStream({
    encoding: "utf8",
    input: "丂",
    output: "e4b882"
  }))

  it("Decoding of incomplete chars in DBCS (gbk)", checkDecodeStream({
    encoding: "gbk",
    input: [[0x61, 0x81], [0x40, 0x61]],
    output: "a丂a"
  }))

  it("Decoding of incomplete chars at the end of the stream in DBCS (gbk)", checkDecodeStream({
    encoding: "gbk",
    input: [[0x61, 0x81]],
    output: "a�"
  }))

  it("Decoding of uneven length buffers from UTF-16LE", checkDecodeStream({
    encoding: "UTF-16LE",
    input: [[0x61], [0x0]],
    output: "a"
  }))

  it("Decoding of uneven length buffers from UTF-16BE", checkDecodeStream({
    encoding: "UTF-16BE",
    input: [[0x0], [0x61]],
    output: "a"
  }))

  it("Decoding of uneven length buffers from UTF-16BE - 2", checkDecodeStream({
    encoding: "UTF-16BE",
    input: [[0x00, 0x61, 0x00], [0x62, 0x00], [0x63]],
    output: "abc"
  }))

  it("Decoding of uneven length buffers from UTF-16", checkDecodeStream({
    encoding: "UTF-16",
    input: [[0x61], [0x0, 0x20], [0x0]],
    output: "a "
  }))

  it("Encoding base64 between chunks", checkEncodeStream({
    encoding: "base64",
    input: ["aGV", "sbG8gd2", "9ybGQ="],
    output: Buffer.from("hello world").toString("hex")
  }))

  it("Decoding of UTF-7 with base64 between chunks", checkDecodeStream({
    encoding: "UTF-7",
    input: [Buffer.from("+T2"), Buffer.from("BZf"), Buffer.from("Q hei+AN8-t")],
    output: "\u4F60\u597D heißt"
  }))

  it("Encoding of UTF-7-IMAP with base64 between chunks", checkEncodeStream({
    encoding: "UTF-7-IMAP",
    input: ["\uffff", "\uedca", "\u9876", "\u5432", "\u1fed"],
    output: Buffer.from("&,,,typh2VDIf7Q-").toString("hex")
  }))

  it("Decoding of UTF-7-IMAP with base64 between chunks", checkDecodeStream({
    encoding: "UTF-7-IMAP",
    input: [Buffer.from("&T2"), Buffer.from("BZf"), Buffer.from("Q hei&AN8-t")],
    output: "\u4F60\u597D heißt"
  }))

  it("Decoding of chunks in UTF-32 auto mode does not lose chunks", checkDecodeStream({
    encoding: "UTF-32",
    input: [
      [0x00, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00, 0x62, 0x00, 0x00, 0x00, 0x63, 0x00, 0x00, 0x00, 0x64],
      [0x00, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00, 0x62, 0x00, 0x00, 0x00, 0x63, 0x00, 0x00, 0x00, 0x64]
    ],
    output: "abcdabcd"
  }))
})

describe("Streaming sugar", function () {
  it("decodeStream.collect()", async function () {
    const output = await new Promise<Uint8Array | string>((resolve, reject) => {
      feeder([[0x61, 0x81], [0x40, 0x61]])
        .pipe(iconv.decodeStream("gbk"))
        .collect((error, text) => error ? reject(error) : resolve(text!))
    })
    assert.equal(output, "a丂a")
  })

  it("encodeStream.collect()", async function () {
    const output = await new Promise<Uint8Array | string>((resolve, reject) => {
      feeder(["абв", "где"])
        .pipe(iconv.encodeStream("windows-1251"))
        .collect((error, bytes) => error ? reject(error) : resolve(bytes!))
    })
    assert.strictEqual(output.constructor, utils.BytesType)
    assert.equal(utils.hex(output as Uint8Array), "e0 e1 e2 e3 e4 e5")
  })
})

describe("Encoding using internal modules with surrogates in separate chunks:", function () {
  function checkUtf8EncodeStream (input: string[]) {
    return checkEncodeStream({
      encoding: "utf8",
      input,
      output: Buffer.from(input.join(""), "utf8").toString("hex")
    })
  }

  it("a single string", checkUtf8EncodeStream(["\uD83D\uDE3B"]))

  it("normal", checkUtf8EncodeStream(["\uD83D", "\uDE3B"]))

  it("reverse", checkUtf8EncodeStream(["\uDE3B", "\uD83D"]))

  it("multiple surrogates", checkUtf8EncodeStream(["\uD83D", "\uDE3B\uD83D", "\uDE3B"]))

  it("more than one character with left", checkUtf8EncodeStream(["abc\uD83D", "\uDE3B"]))

  it("more than one character with right", checkUtf8EncodeStream(["\uD83D", "\uDE3Befg"]))

  it("more than one character at both ends", checkUtf8EncodeStream(["abc\uD83D", "\uDE3Befg"]))

  it("surrogates pair be interrupted", checkUtf8EncodeStream(["abc\uD83D", "efg\uDE3B"]))

  it("a half of surrogates pair only left", checkUtf8EncodeStream(["abc\uD83D"]))

  it("a half of surrogates pair only right", checkUtf8EncodeStream(["\uDE3Befg"]))
})
