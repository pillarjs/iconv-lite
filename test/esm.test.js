import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import iconv, { encode, decode, encodeStream, encodeWebStream, decodeWebStream } from "iconv-lite"

describe("ES module entry points", function () {
  it("exports the Node API as default and named functions", async function () {
    const node = await import("iconv-lite")
    assert.equal("enableStreamingAPI" in node, false)
    assert.equal("enableStreamingAPI" in iconv, false)
    assert.equal(encode, iconv.encode)
    assert.equal(decode, iconv.decode)
    assert.equal(node.addEncoding, iconv.addEncoding)
    assert.equal(encodeStream, iconv.encodeStream)
    assert.equal(encodeWebStream, iconv.encodeWebStream)
    assert.equal(decodeWebStream, iconv.decodeWebStream)
    assert(Buffer.isBuffer(encode("hello", "utf8")))
    assert.equal(decode(encode("hello", "utf8"), "utf8"), "hello")
    assert.equal(typeof encodeStream("utf8").pipe, "function")
    assert(encodeWebStream("utf8") instanceof TransformStream)
    assert(decodeWebStream("utf8") instanceof TransformStream)
  })

  it("supports dynamic import from CommonJS", function () {
    execFileSync(process.execPath, ["--input-type=commonjs", "-e", `
      (async () => {
        const { default: iconv } = await import("iconv-lite")
        if (iconv.decode(iconv.encode("中文", "gbk"), "gbk") !== "中文") throw new Error("Round trip failed")
      })().catch(error => { console.error(error); process.exitCode = 1 })
    `], { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "pipe" })
  })

  it("keeps Node and Web entry points independent", async function () {
    const nodeCodec = iconv.getCodec("windows1251")
    const web = await import("iconv-lite/web")
    const { default: webIconv, encode: webEncode, encodeWebStream: webEncodeStream, decodeWebStream: webDecodeStream } = web

    assert.notEqual(iconv, webIconv)
    assert.equal(webEncode, webIconv.encode)
    assert.equal(web.addEncoding, webIconv.addEncoding)
    assert(Buffer.isBuffer(encode("hello", "windows1251")))
    assert.equal(webEncode("hello", "windows1251").constructor, Uint8Array)
    assert.equal(iconv.getCodec("windows1251"), nodeCodec)
    assert.equal(iconv.supportsStreams, true)
    for (const name of ["encodeStream", "decodeStream", "enableStreamingAPI", "supportsStreams"]) {
      assert.equal(name in web, false)
      assert.equal(name in webIconv, false)
    }
    assert.equal(webIconv.supportsWebStreams, true)
    assert.equal(webEncodeStream, webIconv.encodeWebStream)
    assert.equal(webDecodeStream, webIconv.decodeWebStream)
    assert(webEncodeStream("utf8") instanceof TransformStream)
    assert(webDecodeStream("utf8") instanceof TransformStream)
  })

  it("exports encoding modules", async function () {
    const { default: getEncodings } = await import("iconv-lite/encodings/index.js")

    assert.equal(typeof getEncodings, "function")
    assert.ok("utf8" in getEncodings())
  })

  it("blocks imports of internal package paths", async function () {
    for (const path of ["utils", "lib/index.js", "lib/iconv.js", "lib/utils.js", "backends/node.js", "backends/web.js", "package.json"]) {
      await assert.rejects(import(`iconv-lite/${path}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" })
    }
  })

  it("loads the web module graph without Node globals and initializes DBCS codecs on demand", function () {
    execFileSync(process.execPath, [
      "--experimental-vm-modules",
      fileURLToPath(new URL("./fixtures/esm-web.mjs", import.meta.url))
    ], { stdio: "pipe" })
  })
})
