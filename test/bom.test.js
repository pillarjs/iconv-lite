import { expect } from "vitest"
import utils from "./helpers/utils.js"

const iconv = utils.requireIconv()

var sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<俄语>данные</俄语>"
var strBOM = "\ufeff"
var utf8BOM = utils.bytes([0xEF, 0xBB, 0xBF])
var utf16beBOM = utils.bytes([0xFE, 0xFF])
var utf16leBOM = utils.bytes([0xFF, 0xFE])

describe("BOM Handling", function () {
  it("strips UTF-8 BOM", function () {
    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8")).toBe(sampleStr)
  })

  it("strips UTF-16 BOM", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.decode(body, "utf16")).toBe(sampleStr)
    expect(iconv.decode(body, "utf16le")).toBe(sampleStr)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.decode(body, "utf16")).toBe(sampleStr)
    expect(iconv.decode(body, "utf16be")).toBe(sampleStr)
  })

  it("doesn't strip BOMs when stripBOM=false", function () {
    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8", { stripBOM: false })).toBe(strBOM + sampleStr)

    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.decode(body, "utf16", { stripBOM: false })).toBe(strBOM + sampleStr)
    expect(iconv.decode(body, "utf16le", { stripBOM: false })).toBe(strBOM + sampleStr)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.decode(body, "utf16", { stripBOM: false })).toBe(strBOM + sampleStr)
    expect(iconv.decode(body, "utf16be", { stripBOM: false })).toBe(strBOM + sampleStr)
  })

  it("adds/strips UTF-7 BOM", function () {
    var bodyWithBOM = iconv.encode(sampleStr, "utf7", { addBOM: true })
    var body = iconv.encode(sampleStr, "utf7")
    expect(body).not.toStrictEqual(bodyWithBOM)
    expect(iconv.decode(body, "utf7")).toBe(sampleStr)
  })

  it("adds UTF-8 BOM when addBOM=true", function () {
    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.encode(sampleStr, "utf8", { addBOM: true })).toStrictEqual(body)
  })

  it("adds UTF-16 BOMs when addBOM=true", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.encode(sampleStr, "utf16le", { addBOM: true })).toStrictEqual(body)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    expect(iconv.encode(sampleStr, "utf16be", { addBOM: true })).toStrictEqual(body)
  })

  it("'UTF-16' encoding adds BOM by default, but can be overridden with addBOM=false", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    expect(iconv.encode(sampleStr, "utf16")).toStrictEqual(body)

    var body = iconv.encode(sampleStr, "utf16le")
    expect(iconv.encode(sampleStr, "utf16", { addBOM: false })).toStrictEqual(body)
  })

  it("when stripping BOM, calls callback 'stripBOM' if provided", function () {
    var bomStripped = false
    var stripBOM = function () { bomStripped = true }

    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    expect(iconv.decode(body, "utf8", { stripBOM: stripBOM })).toBe(sampleStr)
    expect(bomStripped).toBeTruthy()

    bomStripped = false

    body = utils.bytes(new TextEncoder().encode(sampleStr))
    expect(iconv.decode(body, "utf8", { stripBOM: stripBOM })).toBe(sampleStr)
    expect(!bomStripped).toBeTruthy()
  })
})
