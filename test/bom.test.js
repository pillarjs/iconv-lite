import { expect } from "vitest"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

const sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<俄语>данные</俄语>"
const strBOM = "\ufeff"
const utf8BOM = utils.bytes([0xEF, 0xBB, 0xBF])
const utf16beBOM = utils.bytes([0xFE, 0xFF])
const utf16leBOM = utils.bytes([0xFF, 0xFE])

describe("BOM Handling", function () {
  it("strips UTF-8 BOM", function () {
    const body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8")).toBe(sampleStr)
  })

  it("strips UTF-16 BOM", function () {
    let body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.decode(body, "utf16")).toBe(sampleStr)
    expect(iconv.decode(body, "utf16le")).toBe(sampleStr)

    body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.decode(body, "utf16")).toBe(sampleStr)
    expect(iconv.decode(body, "utf16be")).toBe(sampleStr)
  })

  it("doesn't strip BOMs when stripBOM=false", function () {
    let body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8", { stripBOM: false })).toBe(strBOM + sampleStr)

    body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.decode(body, "utf16", { stripBOM: false })).toBe(strBOM + sampleStr)
    expect(iconv.decode(body, "utf16le", { stripBOM: false })).toBe(strBOM + sampleStr)

    body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.decode(body, "utf16", { stripBOM: false })).toBe(strBOM + sampleStr)
    expect(iconv.decode(body, "utf16be", { stripBOM: false })).toBe(strBOM + sampleStr)
  })

  it("adds/strips UTF-7 BOM", function () {
    const bodyWithBOM = iconv.encode(sampleStr, "utf7", { addBOM: true })
    const body = iconv.encode(sampleStr, "utf7")
    expect(body).not.toStrictEqual(bodyWithBOM)
    expect(iconv.decode(body, "utf7")).toBe(sampleStr)
  })

  it("adds UTF-8 BOM when addBOM=true", function () {
    const body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.encode(sampleStr, "utf8", { addBOM: true })).toStrictEqual(body)
  })

  it("adds UTF-16 BOMs when addBOM=true", function () {
    let body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.encode(sampleStr, "utf16le", { addBOM: true })).toStrictEqual(body)

    body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.encode(sampleStr, "utf16be", { addBOM: true })).toStrictEqual(body)
  })

  it("'UTF-16' encoding adds BOM by default, but can be overridden with addBOM=false", function () {
    let body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.encode(sampleStr, "utf16")).toStrictEqual(body)

    body = iconv.encode(sampleStr, "utf16le")
    expect(iconv.encode(sampleStr, "utf16", { addBOM: false })).toStrictEqual(body)
  })

  it("when stripping BOM, calls callback 'stripBOM' if provided", function () {
    let bomStripped = false
    const stripBOM = function () { bomStripped = true }

    let body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8", { stripBOM })).toBe(sampleStr)
    expect(bomStripped).toBeTruthy()

    bomStripped = false

    body = utils.bytes(new TextEncoder().encode(sampleStr))
    expect(iconv.decode(body, "utf8", { stripBOM })).toBe(sampleStr)
    expect(!bomStripped).toBeTruthy()
  })
})
