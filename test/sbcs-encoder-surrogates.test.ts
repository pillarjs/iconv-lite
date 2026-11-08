import { expect } from "vitest"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()
iconv.encodingExists("windows1252")
const encodings = Object.entries(iconv.encodings!)
  .filter(([, definition]) => typeof definition === "object" && definition.type === "_sbcs")
  .map(([name]) => name)

describe("SBCS encoding by code point (#368)", function () {
  for (const encoding of encodings) {
    it(`${encoding} emits one replacement per supplementary character`, function () {
      const input = "\u{10000}\u{103FF}\u{10400}🙂\u{10FFFF}"
      for (const defaultCharByte of [undefined, 0, 0x21, 0xFF]) {
        for (const invalidCharHandler of [undefined, () => undefined, () => false]) {
          expect(iconv.encode(input, encoding, { defaultCharByte, invalidCharHandler }))
            .toStrictEqual(utils.bytes(Array(5).fill(defaultCharByte ?? 0x3F)))
        }
      }
    })
  }

  const cases: [string, (number | null)[]][] = [
    ["", []],
    ["A🙂B", [0x41, null, 0x42]],
    ["\u{10000}🙂\u{10FFFF}", [null, null, null]],
    ["\uD800", [null]],
    ["\uDC00", [null]],
    ["\uD800A", [null, 0x41]],
    ["\uD800\uDBFF", [null, null]],
    ["\uDC00\uD800", [null, null]],
    ["\uD800\uD800\uDC00\uDC00", [null, null, null]],
    ["A🙂\uDBFF", [0x41, null, null]],
    ["?\0\uFFFD", [0x3F, 0, null]]
  ]

  for (const defaultCharByte of [undefined, 0, 0x21, 0xFF]) {
    for (const handler of ["none", "undefined", "false"] as const) {
      const options = {
        defaultCharByte,
        invalidCharHandler: handler === "none" ? undefined : () => handler === "false" ? false : undefined
      }
      const replacement = defaultCharByte ?? 0x3F
      const label = `replacement ${replacement}, handler ${handler}`

      it(`preserves output across UTF-16 chunk boundaries (${label})`, function () {
        for (const [input, values] of cases) {
          const expected = utils.bytes(values.map(byte => byte ?? replacement))
          expect(iconv.encode(input, "windows1252", options)).toStrictEqual(expected)
          for (let split = 0; split <= input.length; split++) {
            const encoder = iconv.getEncoder("windows1252", options)
            const chunks = [encoder.write(input.slice(0, split)), encoder.write(""), encoder.write(input.slice(split))]
            const tail = encoder.end()
            if (tail) chunks.push(tail)
            expect(utils.concatBufs(chunks), `${JSON.stringify(input)}, split ${split}`).toStrictEqual(expected)
            expect(encoder.end()).toBe(undefined)
          }
          const encoder = iconv.getEncoder("windows1252", options)
          const chunks = input.split("").flatMap(unit => [encoder.write(unit), encoder.write("")])
          const tail = encoder.end()
          if (tail) chunks.push(tail)
          expect(utils.concatBufs(chunks), JSON.stringify(input)).toStrictEqual(expected)
        }
      })

      it(`buffers high surrogates and flushes them once (${label})`, function () {
        const encoder = iconv.getEncoder("windows1252", options)
        expect(encoder.write("\uD800")).toStrictEqual(utils.bytes([]))
        expect(encoder.write("")).toStrictEqual(utils.bytes([]))
        expect(encoder.write("\uDC00")).toStrictEqual(utils.bytes([replacement]))
        expect(encoder.end()).toBe(undefined)
        expect(encoder.write("\uDBFF")).toStrictEqual(utils.bytes([]))
        expect(encoder.end()).toStrictEqual(utils.bytes([replacement]))
        expect(encoder.end()).toBe(undefined)
        expect(encoder.write("A")).toStrictEqual(utils.bytes([0x41]))
      })
    }
  }
})
