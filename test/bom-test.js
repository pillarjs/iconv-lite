var assert = require("assert")
var Buffer = require("safer-buffer").Buffer
var join = require("path").join
var iconv = require(join(__dirname, "/../"))
var StripBOM = require(join(__dirname, "/../lib/bom-handling")).StripBOM

var sampleStr = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<俄语>данные</俄语>"
var strBOM = "\ufeff"
var utf8BOM = Buffer.from([0xEF, 0xBB, 0xBF])
var utf16beBOM = Buffer.from([0xFE, 0xFF])
var utf16leBOM = Buffer.from([0xFF, 0xFE])

describe("BOM Handling", function () {
  it("strips UTF-8 BOM", function () {
    var body = Buffer.concat([utf8BOM, Buffer.from(sampleStr)])
    assert.equal(iconv.decode(body, "utf8"), sampleStr)
  })

  it("strips UTF-16 BOM", function () {
    var body = Buffer.concat([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.equal(iconv.decode(body, "utf16"), sampleStr)
    assert.equal(iconv.decode(body, "utf16le"), sampleStr)

    var body = Buffer.concat([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    assert.equal(iconv.decode(body, "utf16"), sampleStr)
    assert.equal(iconv.decode(body, "utf16be"), sampleStr)
  })

  it("doesn't strip BOMs when stripBOM=false", function () {
    var body = Buffer.concat([utf8BOM, Buffer.from(sampleStr)])
    assert.equal(iconv.decode(body, "utf8", { stripBOM: false }), strBOM + sampleStr)

    var body = Buffer.concat([utf16leBOM, iconv.encode(sampleStr, "utf16le")])
    assert.equal(iconv.decode(body, "utf16", { stripBOM: false }), strBOM + sampleStr)
    assert.equal(iconv.decode(body, "utf16le", { stripBOM: false }), strBOM + sampleStr)

    var body = Buffer.concat([utf16beBOM, iconv.encode(sampleStr, "utf16be")])
    assert.equal(iconv.decode(body, "utf16", { stripBOM: false }), strBOM + sampleStr)
    assert.equal(iconv.decode(body, "utf16be", { stripBOM: false }), strBOM + sampleStr)
  })

  it("adds/strips UTF-7 BOM", function () {
    var bodyWithBOM = iconv.encode(sampleStr, "utf7", { addBOM: true })
    var body = iconv.encode(sampleStr, "utf7")
    assert.notEqual(body.toString("hex"), bodyWithBOM.toString("hex"))
    assert.equal(iconv.decode(body, "utf7"), sampleStr)
  })

  it("adds UTF-8 BOM when addBOM=true", function () {
    var body = Buffer.concat([utf8BOM, Buffer.from(sampleStr)]).toString("hex")
    assert.equal(iconv.encode(sampleStr, "utf8", { addBOM: true }).toString("hex"), body)
  })

  it("adds UTF-16 BOMs when addBOM=true", function () {
    var body = Buffer.concat([utf16leBOM, iconv.encode(sampleStr, "utf16le")]).toString("hex")
    assert.equal(iconv.encode(sampleStr, "utf16le", { addBOM: true }).toString("hex"), body)

    var body = Buffer.concat([utf16beBOM, iconv.encode(sampleStr, "utf16be")]).toString("hex")
    assert.equal(iconv.encode(sampleStr, "utf16be", { addBOM: true }).toString("hex"), body)
  })

  it("'UTF-16' encoding adds BOM by default, but can be overridden with addBOM=false", function () {
    var body = Buffer.concat([utf16leBOM, iconv.encode(sampleStr, "utf16le")]).toString("hex")
    assert.equal(iconv.encode(sampleStr, "utf16").toString("hex"), body)

    var body = Buffer.concat([iconv.encode(sampleStr, "utf16le")]).toString("hex")
    assert.equal(iconv.encode(sampleStr, "utf16", { addBOM: false }).toString("hex"), body)
  })

  it("strips BOM emitted only by the wrapped decoder's end()", function () {
    function BufferingDecoder () { this.buf = "" }
    BufferingDecoder.prototype.write = function (chunk) {
      this.buf += chunk.toString("utf8")
      return ""
    }
    BufferingDecoder.prototype.end = function () {
      var res = this.buf; this.buf = ""; return res
    }

    var bomStripped = false
    var wrapper = new StripBOM(new BufferingDecoder(), { stripBOM: function () { bomStripped = true } })
    var out = wrapper.write(Buffer.from("﻿hello", "utf8"))
    out += wrapper.end()
    assert.equal(out, "hello")
    assert(bomStripped)
  })

  it("when stripping BOM, calls callback 'stripBOM' if provided", function () {
    var bomStripped = false
    var stripBOM = function () { bomStripped = true }

    var body = Buffer.concat([utf8BOM, Buffer.from(sampleStr)])
    assert.equal(iconv.decode(body, "utf8", { stripBOM: stripBOM }), sampleStr)
    assert(bomStripped)

    bomStripped = false

    body = Buffer.from(sampleStr)
    assert.equal(iconv.decode(body, "utf8", { stripBOM: stripBOM }), sampleStr)
    assert(!bomStripped)
  })
})
