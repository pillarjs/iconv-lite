import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import utils from "./helpers/utils.js"
const iconv = utils.requireIconv()
const require = createRequire(import.meta.url)

// This reference check needs Node's native binding and filesystem, but runs
// against either iconv-lite backend. Portable cases live in gbk.test.js.
describe("GBK native reference", function () {
  it("decodes the GBK fixture like native iconv", function ({ skip }) {
    let Iconv
    try { ({ Iconv } = require("iconv")) } catch { return skip() }
    const bytes = readFileSync(new URL("./fixtures/gbkFile.txt", import.meta.url))
    const expected = new Iconv("GBK", "utf8").convert(bytes).toString()
    assert.equal(iconv.decode(utils.bytes(bytes), "GBK"), expected)
  })
})
