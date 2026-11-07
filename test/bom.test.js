import assert from "assert"
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
    assert.equal(iconv.decode(body, "utf8"), sampleStr)
  })

  it("strips UTF-16 BOM", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.equal(iconv.decode(body, "utf16"), sampleStr)
    assert.equal(iconv.decode(body, "utf16le"), sampleStr)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    assert.equal(iconv.decode(body, "utf16"), sampleStr)
    assert.equal(iconv.decode(body, "utf16be"), sampleStr)
  })

  it("doesn't strip BOMs when stripBOM=false", function () {
    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    assert.equal(iconv.decode(body, "utf8", { stripBOM: false }), strBOM + sampleStr)

    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.equal(iconv.decode(body, "utf16", { stripBOM: false }), strBOM + sampleStr)
    assert.equal(iconv.decode(body, "utf16le", { stripBOM: false }), strBOM + sampleStr)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    assert.equal(iconv.decode(body, "utf16", { stripBOM: false }), strBOM + sampleStr)
    assert.equal(iconv.decode(body, "utf16be", { stripBOM: false }), strBOM + sampleStr)
  })

  it("adds/strips UTF-7 BOM", function () {
    var bodyWithBOM = iconv.encode(sampleStr, "utf7", { addBOM: true })
    var body = iconv.encode(sampleStr, "utf7")
    assert.notDeepStrictEqual(body, bodyWithBOM)
    assert.equal(iconv.decode(body, "utf7"), sampleStr)
  })

  it("adds UTF-8 BOM when addBOM=true", function () {
    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    assert.deepStrictEqual(iconv.encode(sampleStr, "utf8", { addBOM: true }), body)
  })

  it("adds UTF-16 BOMs when addBOM=true", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.deepStrictEqual(iconv.encode(sampleStr, "utf16le", { addBOM: true }), body)

    var body = utils.concatBufs([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    assert.deepStrictEqual(iconv.encode(sampleStr, "utf16be", { addBOM: true }), body)
  })

  it("'UTF-16' encoding adds BOM by default, but can be overridden with addBOM=false", function () {
    var body = utils.concatBufs([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.deepStrictEqual(iconv.encode(sampleStr, "utf16"), body)

    var body = iconv.encode(sampleStr, "utf16le")
    assert.deepStrictEqual(iconv.encode(sampleStr, "utf16", { addBOM: false }), body)
  })

  it("when stripping BOM, calls callback 'stripBOM' if provided", function () {
    var bomStripped = false
    var stripBOM = function () { bomStripped = true }

    var body = utils.concatBufs([utf8BOM, utils.bytes(new TextEncoder().encode(sampleStr))])
    assert.equal(iconv.decode(body, "utf8", { stripBOM: stripBOM }), sampleStr)
    assert(bomStripped)

    bomStripped = false

    body = utils.bytes(new TextEncoder().encode(sampleStr))
    assert.equal(iconv.decode(body, "utf8", { stripBOM: stripBOM }), sampleStr)
    assert(!bomStripped)
  })
})
