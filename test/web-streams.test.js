import assert from "assert"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

function source (chunks) {
  return new ReadableStream({
    start (controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  })
}

async function collect (readable) {
  const reader = readable.getReader()
  const chunks = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return chunks
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

describe("Web Streams", function () {
  let iconv
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  it("works without enabling Node streams and binds destructured methods", async function () {
    const { encodeWebStream, decodeWebStream } = iconv
    assert.equal(iconv.supportsWebStreams, true)
    assert.equal("encodeStream" in iconv, false)
    const encoder = encodeWebStream("gbk")
    const decoder = decodeWebStream("gbk")
    assert(encoder instanceof TransformStream)
    assert(decoder instanceof TransformStream)
    const output = source(["中文"]).pipeThrough(encoder).pipeThrough(decoder)
    assert.equal((await collect(output)).join(""), "中文")
  })

  for (const [encoding, input] of [
    ["utf8", "A🙂\uD800B\uDC00"],
    ["utf16le", "A🙂B"],
    ["utf16be", "A🙂B"],
    ["utf16", "A🙂B"],
    ["utf32le", "A🙂\uD800"],
    ["utf32be", "A🙂\uD800"],
    ["utf32", "A🙂\uD800"],
    ["cesu8", "A🙂B"],
    ["latin1", "Aé世"],
    ["shiftjis", "あ中文🙂"],
    ["gb18030", "中🙂"],
    ["big5", "AÊ\u0304🙂"],
    ["utf7", "A£中"],
    ["utf7imap", "A£中"],
    ["65000", "A+£🙂B"],
    ["cp65000", "A+£🙂B"],
    ["65001", "A🙂\uD800B"],
    ["cp65001", "A🙂\uD800B"],
    ["1200", "A🙂B"],
    ["cp1201", "A🙂B"],
    ["12000", "A🙂\uD800B"],
    ["cp12001", "A🙂\uD800B"],
    ["binary", "\x80\xff"],
    ["base64", "QUI="]
  ]) {
    it(`${encoding} preserves output across every character and byte split`, async function () {
      const encoded = iconv.encode(input, encoding)
      for (let split = 0; split <= input.length; split++) {
        const chunks = await collect(source([input.slice(0, split), "", input.slice(split)])
          .pipeThrough(iconv.encodeWebStream(encoding)))
        assert(chunks.every(chunk => chunk.constructor === encoded.constructor && chunk.length > 0))
        const bytes = iconv.backend.concatByteResults(chunks)
        if (iconv.getCodec(encoding) === iconv.getCodec("utf7")) {
          // UTF-7 may close and reopen shifted runs at chunk boundaries.
          assert.equal(iconv.decode(bytes, encoding), input)
        } else {
          assert.deepStrictEqual(bytes, encoded)
        }
      }
      for (let split = 0; split <= encoded.length; split++) {
        const chunks = await collect(source([encoded.subarray(0, split), new Uint8Array(), encoded.subarray(split)])
          .pipeThrough(iconv.decodeWebStream(encoding)))
        assert(chunks.every(chunk => typeof chunk === "string" && chunk.length > 0))
        assert.equal(chunks.join(""), iconv.decode(encoded, encoding))
      }
    })
  }

  for (const encoding of ["utf16", "utf32"]) {
    for (const transfer of [false, true]) {
      it(`${encoding} preserves input after buffers are ${transfer ? "transferred" : "reused"}`, async function () {
        // Cover detection during write() and during the final flush, with offset views.
        for (const text of ["A", "A".repeat(12)]) {
          const transform = iconv.decodeWebStream(encoding)
          const output = collect(transform.readable)
          const writer = transform.writable.getWriter()
          for (const byte of iconv.encode(text, encoding, { addBOM: false })) {
            const bytes = new Uint8Array([0xff, byte, 0xff])
            await writer.write(bytes.subarray(1, 2))
            if (transfer) structuredClone(bytes.buffer, { transfer: [bytes.buffer] })
            else bytes.fill(0x42)
          }
          await writer.close()
          writer.releaseLock()
          assert.equal((await output).join(""), text)
        }
      })
    }
  }

  it("preserves per-chunk hex parsing and flushes hexadecimal output", async function () {
    const encoded = await collect(source(["4", "142"]).pipeThrough(iconv.encodeWebStream("hex")))
    assert.deepStrictEqual(Array.from(iconv.backend.concatByteResults(encoded)), [0x14])
    const decoded = await collect(source([Uint8Array.of(0x41), Uint8Array.of(0x42)])
      .pipeThrough(iconv.decodeWebStream("hex")))
    assert.equal(decoded.join(""), "4142")
  })

  for (const [encoding, first, second] of [
    ["binary", "ABCD", "EF"],
    ["hex", "41424344", "4546"],
    ["base64", "QUJD", "REVG"]
  ]) {
    it(`${encoding} decodes before close and applies backpressure`, async function () {
      const transform = iconv.decodeWebStream(encoding)
      const writer = transform.writable.getWriter()
      const reader = transform.readable.getReader()
      const read = reader.read()
      await writer.write(Uint8Array.of(0x41, 0x42, 0x43, 0x44))
      assert.equal((await read).value, first)
      let written = false
      const pending = writer.write(Uint8Array.of(0x45, 0x46)).then(() => { written = true })
      await Promise.resolve()
      assert.equal(written, false)
      assert.equal((await reader.read()).value, second)
      await pending
      await writer.close()
      assert.equal((await reader.read()).done, true)
      writer.releaseLock()
      reader.releaseLock()
    })
  }

  it("preserves BOM options and flushes replacement text with original indices", async function () {
    const calls = []
    const options = Object.freeze({
      addBOM: true,
      invalidCharHandler (char, index) { calls.push([char, index]); return "!" }
    })
    const output = source(["A\uD800"])
      .pipeThrough(iconv.encodeWebStream("utf8", options))
      .pipeThrough(iconv.decodeWebStream("utf8", Object.freeze({ stripBOM: false })))
    assert.equal((await collect(output)).join(""), "\uFEFFA!")
    assert.deepStrictEqual(calls, [["\uD800", 1]])
  })

  it("drops cancelled writes and final output while allowing later chunks", async function () {
    const output = source(["A", "discarded世", "B", "\uD800"])
      .pipeThrough(iconv.encodeWebStream("latin1", { invalidCharHandler: () => true }))
      .pipeThrough(iconv.decodeWebStream("latin1"))
    assert.equal((await collect(output)).join(""), "AB")
  })

  for (const input of ["世", "\uD800"]) {
    it(`propagates handler errors during ${input === "世" ? "write" : "flush"}`, async function () {
      const error = new Error("Cannot encode input")
      const output = source([input]).pipeThrough(iconv.encodeWebStream("latin1", {
        invalidCharHandler () { throw error }
      }))
      await assert.rejects(collect(output), actual => actual === error)
    })
  }

  for (const byte of [0x80, 0xC3]) {
    it(`propagates fatal decoder errors during ${byte === 0x80 ? "write" : "flush"}`, async function () {
      const output = source([Uint8Array.of(byte)]).pipeThrough(iconv.decodeWebStream("utf8", { fatal: true }))
      await assert.rejects(collect(output), { name: "TypeError" })
    })
  }

  it("preserves Windows C1 controls in fatal mode", async function () {
    const output = source([Uint8Array.of(0x81), Uint8Array.of(0x80, 0x41)])
      .pipeThrough(iconv.decodeWebStream("windows-1252", { fatal: true }))
    assert.equal((await collect(output)).join(""), "\u0081€A")
  })

  for (const [alias, text, bytes] of [
    ["ascii", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["latin1", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["iso-8859-9", "€Ğİş", [0x80, 0xD0, 0xDD, 0xFE]],
    ["tis-620", "€\u0081ก", [0x80, 0x81, 0xA1]]
  ]) {
    it(alias + " uses Windows mappings in both Web Stream directions", async function () {
      const encoded = await collect(source(Array.from(text)).pipeThrough(iconv.encodeWebStream(alias)))
      assert.deepStrictEqual(Array.from(iconv.backend.concatByteResults(encoded)), bytes)
      const decoded = await collect(source(bytes.map(byte => Uint8Array.of(byte)))
        .pipeThrough(iconv.decodeWebStream(alias, { fatal: true })))
      assert.strictEqual(decoded.join(""), text)
    })
  }

  for (const [encoding, byte, expected] of [
    ["cp20127", 0x80, "\uFFFD"],
    ["28591", 0x80, "\u0080"],
    ["cp28599", 0x80, "\u0080"],
    ["cp28601", 0x80, "\u0080"]
  ]) {
    it(encoding + " preserves its original mapping in Web Streams", async function () {
      const decoded = await collect(source([Uint8Array.of(0x41), Uint8Array.of(byte)])
        .pipeThrough(iconv.decodeWebStream(encoding)))
      assert.strictEqual(decoded.join(""), "A" + expected)
      const encoded = await collect(source(["A", expected]).pipeThrough(iconv.encodeWebStream(encoding)))
      assert.deepStrictEqual(Array.from(iconv.backend.concatByteResults(encoded)), [0x41, encoding === "cp20127" ? 0x3F : byte])
    })
  }

  it("preserves strict ASCII fatal decoding through a Windows code page Web Stream", async function () {
    const output = source([Uint8Array.of(0x80)]).pipeThrough(iconv.decodeWebStream("20127", { fatal: true }))
    await assert.rejects(collect(output), TypeError)
  })

  it("propagates fatal errors through a Windows-874 alias in Web Streams", async function () {
    const output = source([Uint8Array.of(0x80), Uint8Array.of(0xDB)])
      .pipeThrough(iconv.decodeWebStream("tis-620", { fatal: true }))
    await assert.rejects(collect(output), TypeError)
  })

  it("captures the SBCS replacement when a Web Stream is created", async function () {
    iconv.getCodec("windows-1253")
    iconv.defaultCharUnicode = "🙂"
    const transform = iconv.decodeWebStream("windows-1253")
    iconv.defaultCharUnicode = "!"
    const output = source([Uint8Array.of(0x41, 0xAA), Uint8Array.of(0x81, 0xAA)])
      .pipeThrough(transform)
    assert.equal((await collect(output)).join(""), "A🙂\u0081🙂")
  })

  for (const withHandler of [false, true]) {
    it(`captures the SBCS encoder replacement in Web Streams (handler: ${withHandler})`, async function () {
      iconv.encodingExists("windows1252")
      iconv.defaultCharSingleByte = "!"
      const transform = iconv.encodeWebStream("cp1252", withHandler ? { invalidCharHandler () {} } : undefined)
      iconv.defaultCharSingleByte = "#"
      assert.deepStrictEqual(Array.from(iconv.encode("\uFFFD", "windows1252")), [0x23])
      const output = source(["A\uFFFD\uD83D", "", "\uDE42\uD800"]).pipeThrough(transform)
      const chunks = await collect(output)
      assert.deepStrictEqual(Array.from(iconv.backend.concatByteResults(chunks)), [0x41, 0x21, 0x21, 0x21, 0x21])
    })
  }

  for (const [encoding, byte] of [
    ["windows-874", 0xDB], ["windows-1253", 0xAA],
    ["windows-1255", 0xD9], ["windows-1257", 0xA1]
  ]) {
    it(encoding + " propagates fatal errors to both Web Stream sides", async function () {
      iconv.defaultCharUnicode = "!"
      const transform = iconv.decodeWebStream(encoding, { fatal: true })
      const writer = transform.writable.getWriter()
      const reader = transform.readable.getReader()
      try {
        const first = reader.read()
        await writer.write(Uint8Array.of(0x81))
        assert.equal((await first).value, "\u0081")
        const readError = assert.rejects(reader.read(), TypeError)
        await assert.rejects(writer.write(Uint8Array.of(0x41, byte, 0x42)), TypeError)
        await readError
        await assert.rejects(writer.closed, TypeError)
        await assert.rejects(reader.closed, TypeError)
      } finally {
        writer.releaseLock()
        reader.releaseLock()
      }
    })
  }

  it("rejects chunks of the wrong type", async function () {
    for (const input of [null, 42, new Uint8Array()]) {
      await assert.rejects(collect(source([input]).pipeThrough(iconv.encodeWebStream("utf8"))), /needs strings/)
    }
    for (const input of [null, 42, "text", [0x41], new ArrayBuffer(1)]) {
      await assert.rejects(collect(source([input]).pipeThrough(iconv.decodeWebStream("utf8"))), /needs Uint8Array/)
    }
  })

  it("flushes an empty stream without emitting empty chunks", async function () {
    assert.deepStrictEqual(await collect(source([]).pipeThrough(iconv.encodeWebStream("utf8"))), [])
    assert.deepStrictEqual(await collect(source([]).pipeThrough(iconv.decodeWebStream("utf8"))), [])
  })

  it("applies backpressure until the readable side consumes output", async function () {
    const transform = iconv.encodeWebStream("utf8")
    const writer = transform.writable.getWriter()
    let written = false
    const pending = writer.write("A").then(() => { written = true })
    await Promise.resolve()
    assert.equal(written, false)
    const reader = transform.readable.getReader()
    assert.deepStrictEqual(Array.from((await reader.read()).value), [0x41])
    await pending
    assert.equal(written, true)
    await writer.close()
    assert.equal((await reader.read()).done, true)
    writer.releaseLock()
    reader.releaseLock()
  })

  it("cancels pending input without flushing the codec", async function () {
    let called = false
    const transform = iconv.encodeWebStream("latin1", { invalidCharHandler () { called = true } })
    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()
    const read = reader.read()
    await writer.write("A\uD800")
    assert.deepStrictEqual(Array.from((await read).value), [0x41])
    const reason = new Error("Consumer stopped")
    const closed = assert.rejects(writer.closed, error => error === reason)
    await reader.cancel(reason)
    await closed
    await assert.rejects(writer.write("B"), error => error === reason)
    assert.equal(called, false)
    writer.releaseLock()
    reader.releaseLock()
  })

  it("propagates an aborted write to the reader without flushing pending input", async function () {
    let called = false
    const transform = iconv.encodeWebStream("latin1", { invalidCharHandler () { called = true } })
    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()
    const reason = new Error("Producer stopped")
    const read = assert.rejects(reader.read(), error => error === reason)
    await writer.write("\uD800")
    await writer.abort(reason)
    await read
    assert.equal(called, false)
    writer.releaseLock()
    reader.releaseLock()
  })

  it("rejects unsupported encodings and handler options before constructing a stream", function () {
    assert.throws(() => iconv.encodeWebStream("unknown"), /Encoding not recognized/)
    assert.throws(() => iconv.decodeWebStream("unknown"), /Encoding not recognized/)
    for (const encoding of ["hex", "base64"]) {
      assert.throws(() => iconv.encodeWebStream(encoding, { invalidCharHandler: () => "" }), /not supported/)
    }
  })
})
