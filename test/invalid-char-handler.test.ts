import { expect } from "vitest"
import utils from "./helpers/utils.js"
import Iconv from "../lib/iconv.js"

const defaultIconv = utils.requireIconv()

describe("invalidCharHandler (SBCS)", function () {
  let iconv: Iconv<Uint8Array<ArrayBufferLike>>

  beforeEach(function () {
    iconv = new Iconv(defaultIconv.backend)
  })
  it("calls handler for unencodable chars", function () {
    const calls: { char: string, index: number }[] = []
    const res = iconv.encode("A世B", "latin1", {
      invalidCharHandler: function (char: string, index: number) {
        calls.push({ char, index })
      }
    })

    expect(res).toStrictEqual(utils.bytes([0x41, 0x3F, 0x42]))
    expect(calls.length).toBe(1)
    expect(calls[0].char).toBe("世")
    expect(calls[0].index).toBe(1)
  })

  it("does not call handler for encodable chars including '?'", function () {
    let called = false
    const res = iconv.encode("?A", "latin1", {
      invalidCharHandler: function () {
        called = true
      }
    })

    expect(called).toBe(false)
    expect(res).toStrictEqual(utils.bytes([0x3F, 0x41]))
  })

  it("reports U+FFFD when the replacement byte is unassigned", function () {
    const calls: { char: string, index: number }[] = []
    const result = iconv.encode("�A?", "windows1253", {
      defaultCharByte: 0xAA,
      invalidCharHandler (char: string, index: number) {
        calls.push({ char, index })
      }
    })

    expect(Array.from(result!)).toStrictEqual([0xAA, 0x41, 0x3F])
    expect(calls).toStrictEqual([{ char: "�", index: 0 }])
    expect(iconv.encode("�", "windows1253", {
      defaultCharByte: 0xAA,
      invalidCharHandler () { return true }
    })).toBe(null)
  })

  it("allows a C1 control at the configured replacement byte", function () {
    const calls: { char: string, index: number }[] = []
    const result = iconv.encode("\u0081�", "windows1252", {
      defaultCharByte: 0x81,
      invalidCharHandler (char: string, index: number) {
        calls.push({ char, index })
      }
    })

    expect(Array.from(result!)).toStrictEqual([0x81, 0x81])
    expect(calls).toStrictEqual([{ char: "�", index: 1 }])
  })

  it("allows the valid character at the configured replacement byte", function () {
    const calls: { char: string, index: number }[] = []
    const result = iconv.encode("€世", "windows1252", {
      defaultCharByte: 0x80,
      invalidCharHandler (char: string, index: number) {
        calls.push({ char, index })
      }
    })

    expect(Array.from(result!)).toStrictEqual([0x80, 0x80])
    expect(calls).toStrictEqual([{ char: "世", index: 1 }])
  })

  it("rejects a replacement outside the byte range for SBCS", function () {
    expect(function () {
      iconv.getEncoder("iso88591", { defaultCharByte: 0xFFFD })
    }).toThrowError(expect.objectContaining({ name: "TypeError", message: "defaultCharByte must be an integer between 0 and 255" }))
  })

  it("propagates thrown errors", function () {
    expect(function () {
      iconv.encode("世", "latin1", {
        invalidCharHandler: function () {
          throw new Error("boom")
        }
      })
    }).toThrowError(/boom/)
  })

  it("supports error message with full character details", function () {
    const encoding = "latin1"

    expect(function () {
      iconv.encode("Hello 世", encoding, {
        invalidCharHandler: function (char: string, index: number) {
          throw new Error("Cannot encode character " + char + " at index " + index + " to " + encoding)
        }
      })
    }).toThrowError(expect.objectContaining({ message: "Cannot encode character 世 at index 6 to latin1" }))
  })

  it("supports error message with full character details (even for surrogate pairs)", function () {
    const encoding = "latin1"

    expect(function () {
      iconv.encode("Hello 🙂", encoding, {
        invalidCharHandler: function (char: string, index: number) {
          throw new Error("Cannot encode character " + char + " at index " + index + " to " + encoding)
        }
      })
    }).toThrowError(expect.objectContaining({ message: "Cannot encode character 🙂 at index 6 to latin1" }))
  })

  it("reports index as Unicode code-point position", function () {
    const calls: { char: string, index: number }[] = []
    const res = iconv.encode("A🙂世B", "latin1", {
      invalidCharHandler: function (char: string, index: number) {
        calls.push({ char, index })
      }
    })

    expect(res).toStrictEqual(utils.bytes([0x41, 0x3F, 0x3F, 0x3F, 0x42]))
    expect(calls.length).toBe(2)
    expect(calls[0].char).toBe("🙂")
    expect(calls[0].index).toBe(1)
    expect(calls[1].char).toBe("世")
    expect(calls[1].index).toBe(2)
  })

  it("reports a split surrogate pair once, keeping the index where it starts", function () {
    const calls: { char: string, index: number }[] = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char: string, index: number) { calls.push({ char, index }) }
    })

    expect(Array.from(encoder.write("A\uD83D")!)).toStrictEqual([0x41])
    expect(Array.from(encoder.write("")!)).toStrictEqual([])
    expect(calls).toStrictEqual([])
    expect(Array.from(encoder.write("\uDE42世B")!)).toStrictEqual([0x3F, 0x3F, 0x3F, 0x42])
    expect(calls).toStrictEqual([{ char: "🙂", index: 1 }, { char: "世", index: 1 }])
    expect(encoder.end()).toBe(undefined)
  })

  it("preserves output and callback characters across every split position", function () {
    const input = "A🙂世B\uD800"
    for (let split = 1; split < input.length; split++) {
      const calls: string[] = []
      const encoder = iconv.getEncoder("latin1", {
        invalidCharHandler (char: string) { calls.push(char) }
      })
      const chunks = [encoder.write(input.slice(0, split)), encoder.write(""), encoder.write(input.slice(split))]
      const tail = encoder.end()
      if (tail) chunks.push(tail)

      expect(utils.concatBufs(chunks)).toStrictEqual(utils.bytes([0x41, 0x3F, 0x3F, 0x3F, 0x42, 0x3F]))
      expect(calls).toStrictEqual(["🙂", "世", "\uD800"])
      expect(encoder.end()).toBe(undefined)
    }
  })

  it("reports a buffered high surrogate separately when no low surrogate follows", function () {
    const calls: { char: string, index: number }[] = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char: string, index: number) { calls.push({ char, index }) }
    })

    expect(Array.from(encoder.write("A\uD800")!)).toStrictEqual([0x41])
    expect(Array.from(encoder.write("世")!)).toStrictEqual([0x3F, 0x3F])
    expect(calls).toStrictEqual([{ char: "\uD800", index: 1 }, { char: "世", index: 0 }])
    expect(encoder.end()).toBe(undefined)
  })

  it("discards the current write when a buffered character cancels it", function () {
    const calls: { char: string, index: number }[] = []
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler (char: string, index: number) {
        calls.push({ char, index })
        return true
      }
    })

    expect(Array.from(encoder.write("A\uD83D")!)).toStrictEqual([0x41])
    expect(encoder.write("\uDE42discarded\uD800")).toBe(null)
    expect(Array.from(encoder.write("B")!)).toStrictEqual([0x42])
    expect(encoder.end()).toBe(undefined)
    expect(calls).toStrictEqual([{ char: "🙂", index: 1 }])
  })

  it("clears a buffered character when its handler throws", function () {
    const error = new Error("Unencodable character")
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler () { throw error }
    })

    encoder.write("\uD83D")
    let caught: unknown
    try {
      encoder.write("\uDE42")
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(error)
    expect(Array.from(encoder.write("A")!)).toStrictEqual([0x41])
    expect(encoder.end()).toBe(undefined)
  })

  it("lets the handler cancel a trailing high surrogate at end", function () {
    const calls: { char: string, index: number }[] = []
    const options = {
      invalidCharHandler (char: string, index: number) {
        calls.push({ char, index })
        return true
      }
    }
    const encoder = iconv.getEncoder("latin1", options)
    expect(Array.from(encoder.write("A\uD800")!)).toStrictEqual([0x41])
    expect(encoder.end()).toBe(null)
    expect(encoder.end()).toBe(undefined)
    expect(calls).toStrictEqual([{ char: "\uD800", index: 1 }])
    expect(iconv.encode("A\uD800", "latin1", options)).toBe(null)
  })

  it("propagates errors from a trailing high surrogate at end", function () {
    const error = new Error("Incomplete character")
    const options = { invalidCharHandler () { throw error } }
    const encoder = iconv.getEncoder("latin1", options)

    encoder.write("\uD800")
    let caught: unknown
    try {
      encoder.end()
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(error)
    expect(encoder.end()).toBe(undefined)
    caught = undefined
    try {
      iconv.encode("A\uD800", "latin1", options)
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(error)
  })

  it("preserves immediate surrogate replacement without a handler", function () {
    const encoder = iconv.getEncoder("latin1")
    expect(Array.from(encoder.write("\uD83D"))).toStrictEqual([0x3F])
    expect(Array.from(encoder.write("\uDE42"))).toStrictEqual([0x3F])
    expect(encoder.end()).toBe(undefined)
  })

  it("supports stopping SBCS encoding via handler return value", function () {
    const calls: { char: string, index: number }[] = []
    const res = iconv.encode("A世界B", "latin1", {
      invalidCharHandler: function (char: string, index: number) {
        calls.push({ char, index })
        return true
      }
    })

    expect(res).toBe(null)
    expect(calls.length).toBe(1)
    expect(calls[0].char).toBe("世")
    expect(calls[0].index).toBe(1)
    // We don't call the handler for "界" because we stopped encoding after "世".
  })

  it("allows a handler to append a fallback before continuing", function () {
    const calls: { char: string, index: number }[] = []
    const output = []
    const replacements: Record<string, string> = {
      "🙂": ":)"
    }
    const encoder = iconv.getEncoder("latin1", {
      invalidCharHandler: function (char: string, index: number) {
        calls.push({ char, index })
        const replacement = replacements[char]
        expect(replacement).not.toBe(undefined)
        output.push(iconv.encode(replacement, "latin1"))
        return true
      }
    })

    output.push(encoder.write("Hello "))
    expect(encoder.write("🙂")).toBe(null)
    output.push(encoder.write(" world"))

    expect(utils.concatBufs(output)).toStrictEqual(utils.bytes(new TextEncoder().encode("Hello :) world")))
    expect(calls.length).toBe(1)
    expect(calls[0].char).toBe("🙂")
    expect(calls[0].index).toBe(0)
    expect(encoder.end()).toBe(undefined)
  })

  it("encodes the replacement returned by the handler", function () {
    const res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
        return "!"
      }
    })

    expect(res).toStrictEqual(utils.bytes([0x21]))
  })

  it("supports expanding and empty replacements without changing source indices", function () {
    const calls: [string, number][] = []
    const result = iconv.encode("A🙂世B界", "latin1", {
      invalidCharHandler (char: string, index: number) {
        calls.push([char, index])
        return char === "🙂" ? ":)".repeat(100) : ""
      }
    })
    expect(result).toStrictEqual(utils.bytes(new TextEncoder().encode("A" + ":)".repeat(100) + "B")))
    expect(calls).toStrictEqual([["🙂", 1], ["世", 2], ["界", 4]])
  })

  it("rejects unencodable replacements without recursive callbacks", function () {
    let calls = 0
    expect(() => iconv.encode("世", "latin1", {
      invalidCharHandler () { calls++; return "🙂" }
    })).toThrowError(/Replacement .* cannot be encoded/)
    expect(calls).toBe(1)
  })

  it("replaces split pairs and pending characters at end", function () {
    const encoder = iconv.getEncoder("latin1", { invalidCharHandler: () => ":)" })
    expect(encoder.write("A\uD83D")).toStrictEqual(utils.bytes([0x41]))
    expect(encoder.write("\uDE42\uD800")).toStrictEqual(utils.bytes([0x3A, 0x29]))
    expect(encoder.end()).toStrictEqual(utils.bytes([0x3A, 0x29]))
    expect(encoder.end()).toBe(undefined)
  })

  it("rejects invalid callback return types", function () {
    expect(() => iconv.encode("世", "latin1", { invalidCharHandler: () => 42 as never })).toThrowError(/must return/)
  })

  it("keeps default replacement when handler returns nothing", function () {
    const res = iconv.encode("世", "latin1", {
      invalidCharHandler: function () {
      }
    })

    expect(res).toStrictEqual(utils.bytes([0x3F]))
  })
})
