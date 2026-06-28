"use strict"

var mocha = require("mocha")
var describeMocha = mocha.describe
var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

var describe = describeMocha

if (!iconv.supportsStreams) {
  describe = describe.skip
};

var Readable = require("stream").Readable

// Create a source stream that feeds given array of chunks.
function feeder (chunks) {
  if (!Array.isArray(chunks)) {
    chunks = [chunks]
  }
  var opts = {}
  if (chunks.every(function (chunk) { return typeof chunk == "string" })) {
    opts.encoding = "utf8"
  }

  var stream = new Readable(opts)
  function writeChunk () {
    try {
      if (chunks.length > 0) {
        var chunk = chunks.shift()
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

function checkStreamOutput (options) {
  return function (done) {
    try {
      var stream = options.createStream()
    }
    catch (e) {
      check(e)
      return
    }
    var res = []
    stream.on("readable", function () {
      var chunk
      try {
        while ((chunk = stream.read()) != null) {
          if (options.outputType) {
            if (/^buffer/.test(options.outputType)) {
              assert(Buffer.isBuffer(chunk))
            } else {
              assert.strictEqual(typeof chunk, options.outputType)
            }
          }
          res.push(chunk)
        }
      }
      catch (e) {
        stream.emit("error", e)
      }
    })
    stream.on("error", check)
    stream.on("end", check)

    function check (err) {
      try {
        if (options.checkError) {
          assert(err, "Expected error, but got success")
          if (Object.prototype.toString.call(options.checkError) == "[object RegExp]") {
            assert(options.checkError.test(err.message), "Wrong error message: " + err.message)
          }
          else if (typeof options.checkError == "function") {
            options.checkError(err)
          }
          else {
            assert.fail(null, null, "Invalid type of options.checkError: " + typeof options.checkError)
          }
        }
        else {
          assert.ifError(err)

          if (options.checkOutput) {
            if (options.outputType) { var r }
            // Why is this variable assigned in a conditional, what side effects does it have?
            // eslint-disable-next-line no-cond-assign
            if (r = /^buffer-?(.*)/.exec(options.outputType)) {
              res = Buffer.concat(res)
              if (r[1]) {
                res = res.toString(r[1]) // Convert to string to make comparing buffers easier.
              }
            } else if (options.outputType == "string") {
              res = res.join("")
            }

            options.checkOutput(res)
          }
        }
        done()
      } catch (e) {
        done(e)
      }
    }
  }
}

function checkEncodeStream (opts) {
  opts.createStream = function () {
    return feeder(opts.input)
      .pipe(iconv.encodeStream(opts.encoding, opts.encodingOptions))
  }
  if (opts.outputType == null) opts.outputType = "buffer-hex"
  if (Buffer.isBuffer(opts.output) && opts.outputType == "buffer-hex") {
    opts.output = opts.output.toString("hex")
  }

  opts.checkOutput = opts.checkOutput || function (res) {
    assert.equal(res, opts.output)
  }

  return checkStreamOutput(opts)
}

function checkDecodeStream (opts) {
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
  it("Feeder outputs strings", checkStreamOutput({
    createStream: function () { return feeder(["abc", "def"]) },
    outputType: "string",
    checkOutput: function (res) { assert.equal(res, "abcdef") }
  }))

  it("Feeder outputs buffers", checkStreamOutput({
    createStream: function () { return feeder([[0x61], [0x62]]) },
    outputType: "buffer",
    checkOutput: function (res) { assert.equal(res.toString("hex"), "6162") }
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
  it("decodeStream.collect()", function (done) {
    feeder([[0x61, 0x81], [0x40, 0x61]])
      .pipe(iconv.decodeStream("gbk"))
      .collect(function (err, outp) {
        assert.ifError(err)
        assert.equal(outp, "a丂a")
        done()
      })
  })

  it("encodeStream.collect()", function (done) {
    feeder(["абв", "где"])
      .pipe(iconv.encodeStream("windows-1251"))
      .collect(function (err, outp) {
        assert.ifError(err)
        assert(Buffer.isBuffer(outp))
        assert.equal(outp.toString("hex"), "e0e1e2e3e4e5")
        done()
      })
  })
})

describe("Encoding using internal modules with surrogates in separate chunks:", function () {
  function checkUtf8EncodeStream (input) {
    return checkEncodeStream({
      encoding: "utf8",
      input: input,
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
