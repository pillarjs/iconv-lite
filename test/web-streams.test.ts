import { expect } from "vitest"
import Iconv from "../lib/iconv.js"
import utils from "./helpers/utils.js"

const defaultIconv = utils.requireIconv()

function source<T> (chunks: T[]) {
  return new ReadableStream<T>({
    start (controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  })
}

async function collect<T> (readable: ReadableStream<T>) {
  const reader = readable.getReader()
  const chunks: T[] = []
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
  let iconv: Iconv<Uint8Array<ArrayBufferLike>>
  beforeEach(function () { iconv = new Iconv(defaultIconv.backend) })

  it("works without enabling Node streams and binds destructured methods", async function () {
    const { encodeWebStream, decodeWebStream } = iconv
    expect(iconv.supportsWebStreams).toBe(true)
    expect("encodeStream" in iconv).toBe(false)
    const encoder = encodeWebStream("gbk")
    const decoder = decodeWebStream("gbk")
    expect(encoder instanceof TransformStream).toBeTruthy()
    expect(decoder instanceof TransformStream).toBeTruthy()
    const output = source(["中文"]).pipeThrough(encoder).pipeThrough(decoder)
    expect((await collect(output)).join("")).toBe("中文")
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
    ["latin1", "Aé世🙂\uD800"],
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
  ] as const) {
    it(`${encoding} preserves output across every character and byte split`, async function () {
      const encoded = iconv.encode(input, encoding)
      for (let split = 0; split <= input.length; split++) {
        const chunks = await collect(source([input.slice(0, split), "", input.slice(split)])
          .pipeThrough(iconv.encodeWebStream(encoding)))
        expect(chunks.every(chunk => chunk.constructor === encoded.constructor && chunk.length > 0)).toBeTruthy()
        const bytes = iconv.backend.concatByteResults(chunks)
        if (iconv.getCodec(encoding) === iconv.getCodec("utf7")) {
          // UTF-7 may close and reopen shifted runs at chunk boundaries.
          expect(iconv.decode(bytes, encoding)).toBe(input)
        } else {
          expect(bytes).toStrictEqual(encoded)
        }
      }
      for (let split = 0; split <= encoded.length; split++) {
        const chunks = await collect(source([encoded.subarray(0, split), new Uint8Array(), encoded.subarray(split)])
          .pipeThrough(iconv.decodeWebStream(encoding)))
        expect(chunks.every(chunk => typeof chunk === "string" && chunk.length > 0)).toBeTruthy()
        expect(chunks.join("")).toBe(iconv.decode(encoded, encoding))
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
          expect((await output).join("")).toBe(text)
        }
      })
    }
  }

  it("preserves per-chunk hex parsing and flushes hexadecimal output", async function () {
    const encoded = await collect(source(["4", "142"]).pipeThrough(iconv.encodeWebStream("hex")))
    expect(Array.from(iconv.backend.concatByteResults(encoded))).toStrictEqual([0x14])
    const decoded = await collect(source([Uint8Array.of(0x41), Uint8Array.of(0x42)])
      .pipeThrough(iconv.decodeWebStream("hex")))
    expect(decoded.join("")).toBe("4142")
  })

  for (const [encoding, first, second] of [
    ["binary", "ABCD", "EF"],
    ["hex", "41424344", "4546"],
    ["base64", "QUJD", "REVG"]
  ] as const) {
    it(`${encoding} decodes before close and applies backpressure`, async function () {
      const transform = iconv.decodeWebStream(encoding)
      const writer = transform.writable.getWriter()
      const reader = transform.readable.getReader()
      const read = reader.read()
      await writer.write(Uint8Array.of(0x41, 0x42, 0x43, 0x44))
      expect((await read).value).toBe(first)
      let written = false
      const pending = writer.write(Uint8Array.of(0x45, 0x46)).then(() => { written = true })
      await Promise.resolve()
      expect(written).toBe(false)
      expect((await reader.read()).value).toBe(second)
      await pending
      await writer.close()
      expect((await reader.read()).done).toBe(true)
      writer.releaseLock()
      reader.releaseLock()
    })
  }

  it("preserves BOM options and flushes replacement text with original indices", async function () {
    const calls: unknown[] = []
    const options = Object.freeze({
      addBOM: true,
      invalidCharHandler (char: string, index: number) { calls.push([char, index]); return "!" }
    })
    const output = source(["A\uD800"])
      .pipeThrough(iconv.encodeWebStream("utf8", options))
      .pipeThrough(iconv.decodeWebStream("utf8", Object.freeze({ stripBOM: false })))
    expect((await collect(output)).join("")).toBe("\uFEFFA!")
    expect(calls).toStrictEqual([["\uD800", 1]])
  })

  it("drops cancelled writes and final output while allowing later chunks", async function () {
    const output = source(["A", "discarded世", "B", "\uD800"])
      .pipeThrough(iconv.encodeWebStream("latin1", { invalidCharHandler: () => true }))
      .pipeThrough(iconv.decodeWebStream("latin1"))
    expect((await collect(output)).join("")).toBe("AB")
  })

  for (const input of ["世", "\uD800"]) {
    it(`propagates handler errors during ${input === "世" ? "write" : "flush"}`, async function () {
      const error = new Error("Cannot encode input")
      const output = source([input as never]).pipeThrough(iconv.encodeWebStream("latin1", {
        invalidCharHandler () { throw error }
      }))
      await expect(collect(output)).rejects.toBe(error)
    })
  }

  for (const byte of [0x80, 0xC3]) {
    it(`propagates fatal decoder errors during ${byte === 0x80 ? "write" : "flush"}`, async function () {
      const output = source([Uint8Array.of(byte)]).pipeThrough(iconv.decodeWebStream("utf8", { fatal: true }))
      await expect(collect(output)).rejects.toMatchObject({ name: "TypeError" })
    })
  }

  for (const encoding of ["utf32le", "utf32be", "utf32"]) {
    for (const truncated of [false, true]) {
      it(`${encoding} propagates fatal TypeError during ${truncated ? "flush" : "write"}`, async function () {
        const invalid = truncated ? "00" : encoding === "utf32be" ? "00 00 d8 00" : "00 d8 00 00"
        const output = source([iconv.encode("A".repeat(8), encoding), utils.bytes(invalid)])
          .pipeThrough(iconv.decodeWebStream(encoding, { fatal: true, defaultCharUnicode: "" }))
        await expect(collect(output)).rejects.toBeInstanceOf(TypeError)
      })
    }
  }

  for (const [encoding, lead] of [
    ["big5", 0xA1], ["shift_jis", 0x81], ["euc-jp", 0xA1],
    ["euc-kr", 0xB0], ["gbk", 0x81], ["gb18030", 0x81]
  ] as const) {
    for (const truncated of [false, true]) {
      it(`${encoding} propagates fatal TypeError during ${truncated ? "flush" : "write"}`, async function () {
        const chunks = [Uint8Array.of(0x41), Uint8Array.of(lead)]
        if (!truncated) chunks.push(Uint8Array.of(0x20))
        const output = source(chunks).pipeThrough(iconv.decodeWebStream(encoding, {
          fatal: true,
          defaultCharUnicode: ""
        }))
        await expect(collect(output)).rejects.toBeInstanceOf(TypeError)
      })
    }
  }

  it("preserves Windows C1 controls in fatal mode", async function () {
    const output = source([Uint8Array.of(0x81), Uint8Array.of(0x80, 0x41)])
      .pipeThrough(iconv.decodeWebStream("windows-1252", { fatal: true }))
    expect((await collect(output)).join("")).toBe("\u0081€A")
  })

  for (const [alias, text, bytes] of [
    ["ascii", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["latin1", "€\u0081Ÿ", [0x80, 0x81, 0x9F]],
    ["iso-8859-9", "€Ğİş", [0x80, 0xD0, 0xDD, 0xFE]],
    ["tis-620", "€\u0081ก", [0x80, 0x81, 0xA1]]
  ] as const) {
    it(alias + " uses Windows mappings in both Web Stream directions", async function () {
      const encoded = await collect(source(Array.from(text)).pipeThrough(iconv.encodeWebStream(alias)))
      expect(Array.from(iconv.backend.concatByteResults(encoded))).toStrictEqual(bytes)
      const decoded = await collect(source(bytes.map((byte: number) => Uint8Array.of(byte)))
        .pipeThrough(iconv.decodeWebStream(alias, { fatal: true })))
      expect(decoded.join("")).toBe(text)
    })
  }

  for (const [encoding, byte, expected] of [
    ["cp20127", 0x80, "\uFFFD"],
    ["28591", 0x80, "\u0080"],
    ["cp28599", 0x80, "\u0080"],
    ["cp28601", 0x80, "\u0080"]
  ] as const) {
    it(encoding + " preserves its original mapping in Web Streams", async function () {
      const decoded = await collect(source([Uint8Array.of(0x41), Uint8Array.of(byte)])
        .pipeThrough(iconv.decodeWebStream(encoding)))
      expect(decoded.join("")).toBe("A" + expected)
      const encoded = await collect(source(["A", expected]).pipeThrough(iconv.encodeWebStream(encoding)))
      expect(Array.from(iconv.backend.concatByteResults(encoded))).toStrictEqual([0x41, encoding === "cp20127" ? 0x3F : byte])
    })
  }

  it("preserves strict ASCII fatal decoding through a Windows code page Web Stream", async function () {
    const output = source([Uint8Array.of(0x80)]).pipeThrough(iconv.decodeWebStream("20127", { fatal: true }))
    await expect(collect(output)).rejects.toBeInstanceOf(TypeError)
  })

  it("propagates fatal errors through a Windows-874 alias in Web Streams", async function () {
    const output = source([Uint8Array.of(0x80), Uint8Array.of(0xDB)])
      .pipeThrough(iconv.decodeWebStream("tis-620", { fatal: true }))
    await expect(collect(output)).rejects.toBeInstanceOf(TypeError)
  })

  for (const [encoding, input] of [
    ["gb18030", "41 84 31 a5 30 81"], ["cesu8", "41 ff e0"],
    ["utf32", "41 00 00 00 00 d8 00 00 00"]
  ]) {
    it(encoding + " captures replacement text through Web Stream writes and finalization", async function () {
      for (const replacement of ["🙂", "<invalid>", "", "$&$`$'$$"]) {
        const options = { defaultCharUnicode: replacement }
        const transform = iconv.decodeWebStream(encoding, options)
        options.defaultCharUnicode = "!"
        const output = source([utils.bytes(input), utils.bytes([])]).pipeThrough(transform)
        expect((await collect(output)).join("")).toBe("A" + replacement + replacement)
      }
    })
  }

  for (const [encoding, invalid] of [
    ["cesu8", "ff"], ["utf32le", "00 d8 00 00"],
    ["utf32be", "00 00 d8 00"], ["utf32", "00 d8 00 00"]
  ]) {
    it(encoding + " preserves literal replacement BOMs in Web Streams", async function () {
      for (const replacement of ["\uFEFFx", ""]) {
        for (const addBOM of [false, true]) {
          let calls = 0
          const options = Object.freeze({ defaultCharUnicode: replacement, stripBOM () { calls++ } })
          const input = utils.concatBufs([
            iconv.encode("", encoding, { addBOM }), utils.bytes(invalid),
            iconv.encode("\uFEFFA", encoding, { addBOM: false })
          ])
          const output = source(Array.from(input, byte => Uint8Array.of(byte)))
            .pipeThrough(iconv.decodeWebStream(encoding, options))
          expect((await collect(output)).join("")).toBe(replacement + "\uFEFFA")
          expect(calls).toBe(addBOM ? 1 : 0)
        }
      }
    })
  }

  it("captures literal SBCS replacement options in Web Streams", async function () {
    for (const replacement of ["🙂", "<invalid>", "$&$`$'$$", "", "\0"]) {
      const options = { defaultCharUnicode: replacement }
      const transform = iconv.decodeWebStream("cp1253", options)
      options.defaultCharUnicode = "?"
      const output = source([Uint8Array.of(0xAA), Uint8Array.of(), Uint8Array.of(0xAA)]).pipeThrough(transform)
      expect((await collect(output)).join("")).toBe(replacement + replacement)
    }
  })

  it("keeps fatal decoding ahead of replacement options in Web Streams", async function () {
    const output = source([Uint8Array.of(0xAA)]).pipeThrough(iconv.decodeWebStream("cp1253", {
      defaultCharUnicode: "",
      fatal: true
    }))
    await expect(collect(output)).rejects.toBeInstanceOf(TypeError)
  })

  for (const withHandler of [false, true]) {
    it(`captures the SBCS replacement option in Web Streams (handler: ${withHandler})`, async function () {
      const options = { defaultCharByte: 0x21, ...(withHandler ? { invalidCharHandler () {} } : {}) }
      const transform = iconv.encodeWebStream("cp1252", options)
      options.defaultCharByte = 0x23
      expect(Array.from(iconv.encode("\uFFFD", "windows1252", options)!)).toStrictEqual([0x23])
      const output = source(["A\uFFFD\uD83D", "", "\uDE42\uD800"]).pipeThrough(transform)
      const chunks = await collect(output)
      expect(Array.from(iconv.backend.concatByteResults(chunks))).toStrictEqual([0x41, 0x21, 0x21, 0x21])
    })

    it(`captures the DBCS replacement option in Web Streams (handler: ${withHandler})`, async function () {
      iconv.encodingExists("gbk")
      const options = { defaultCharByte: 0x21, ...(withHandler ? { invalidCharHandler () {} } : {}) }
      const transform = iconv.encodeWebStream("gbk", options)
      options.defaultCharByte = 0x23
      expect(Array.from(iconv.encode("\uD800", "gbk", options)!)).toStrictEqual([0x23])
      const output = source(["A\uE7C7\uD83D", "", "\uDE42\uD800"]).pipeThrough(transform)
      const chunks = await collect(output)
      expect(Array.from(iconv.backend.concatByteResults(chunks))).toStrictEqual([0x41, 0x21, 0x21, 0x21])
    })
  }

  for (const [encoding, byte] of [
    ["windows-874", 0xDB], ["windows-1253", 0xAA],
    ["windows-1255", 0xD9], ["windows-1257", 0xA1]
  ] as const) {
    it(encoding + " propagates fatal errors to both Web Stream sides", async function () {
      const transform = iconv.decodeWebStream(encoding, { defaultCharUnicode: "!", fatal: true })
      const writer = transform.writable.getWriter()
      const reader = transform.readable.getReader()
      try {
        const first = reader.read()
        await writer.write(Uint8Array.of(0x81))
        expect((await first).value).toBe("\u0081")
        const readError = expect(reader.read()).rejects.toBeInstanceOf(TypeError)
        await expect(writer.write(Uint8Array.of(0x41, byte, 0x42))).rejects.toBeInstanceOf(TypeError)
        await readError
        await expect(writer.closed).rejects.toBeInstanceOf(TypeError)
        await expect(reader.closed).rejects.toBeInstanceOf(TypeError)
      } finally {
        writer.releaseLock()
        reader.releaseLock()
      }
    })
  }

  it("rejects chunks of the wrong type", async function () {
    for (const input of [null, 42, new Uint8Array()]) {
      await expect(collect(source([input as never]).pipeThrough(iconv.encodeWebStream("utf8")))).rejects.toThrow(/needs strings/)
    }
    for (const input of [null, 42, "text", [0x41], new ArrayBuffer(1)]) {
      await expect(collect(source([input as never]).pipeThrough(iconv.decodeWebStream("utf8")))).rejects.toThrow(/needs Uint8Array/)
    }
  })

  it("flushes an empty stream without emitting empty chunks", async function () {
    expect(await collect(source([]).pipeThrough(iconv.encodeWebStream("utf8")))).toStrictEqual([])
    expect(await collect(source([]).pipeThrough(iconv.decodeWebStream("utf8")))).toStrictEqual([])
  })

  it("applies backpressure until the readable side consumes output", async function () {
    const transform = iconv.encodeWebStream("utf8")
    const writer = transform.writable.getWriter()
    let written = false
    const pending = writer.write("A").then(() => { written = true })
    await Promise.resolve()
    expect(written).toBe(false)
    const reader = transform.readable.getReader()
    expect(Array.from((await reader.read()).value!)).toStrictEqual([0x41])
    await pending
    expect(written).toBe(true)
    await writer.close()
    expect((await reader.read()).done).toBe(true)
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
    expect(Array.from((await read).value!)).toStrictEqual([0x41])
    const reason = new Error("Consumer stopped")
    const closed = expect(writer.closed).rejects.toBe(reason)
    await reader.cancel(reason)
    await closed
    await expect(writer.write("B")).rejects.toBe(reason)
    expect(called).toBe(false)
    writer.releaseLock()
    reader.releaseLock()
  })

  it("propagates an aborted write to the reader without flushing pending input", async function () {
    let called = false
    const transform = iconv.encodeWebStream("latin1", { invalidCharHandler () { called = true } })
    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()
    const reason = new Error("Producer stopped")
    const read = expect(reader.read()).rejects.toBe(reason)
    await writer.write("\uD800")
    await writer.abort(reason)
    await read
    expect(called).toBe(false)
    writer.releaseLock()
    reader.releaseLock()
  })

  it("rejects unsupported encodings and handler options before constructing a stream", function () {
    expect(() => iconv.encodeWebStream("unknown")).toThrowError(/Encoding not recognized/)
    expect(() => iconv.decodeWebStream("unknown")).toThrowError(/Encoding not recognized/)
    for (const encoding of ["hex", "base64"]) {
      expect(() => iconv.encodeWebStream(encoding, { invalidCharHandler: () => "" })).toThrowError(/not supported/)
    }
  })
})
