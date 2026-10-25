import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import iconv, { encode, decode, encodeStream } from "iconv-lite"

// Isolated processes avoid sharing backend selection and initialized codec caches.
describe("ES module entry points", function () {
  it("exports the Node API as default and named functions", function () {
    assert.equal(encode, iconv.encode)
    assert.equal(decode, iconv.decode)
    assert.equal(encodeStream, iconv.encodeStream)
    assert(Buffer.isBuffer(encode("hello", "utf8")))
    assert.equal(decode(encode("hello", "utf8"), "utf8"), "hello")
    assert.equal(typeof encodeStream("utf8").pipe, "function")
  })

  it("supports dynamic import from CommonJS", function () {
    execFileSync(process.execPath, ["--input-type=commonjs", "-e", `
      (async () => {
        const { default: iconv } = await import("iconv-lite")
        if (iconv.decode(iconv.encode("中文", "gbk"), "gbk") !== "中文") throw new Error("Round trip failed")
      })().catch(error => { console.error(error); process.exitCode = 1 })
    `], { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "pipe" })
  })

  it("loads the web module graph without Node globals and initializes DBCS codecs on demand", function () {
    execFileSync(process.execPath, [
      "--experimental-vm-modules",
      fileURLToPath(new URL("./fixtures/esm-web.mjs", import.meta.url))
    ], { stdio: "pipe" })
  })
})
