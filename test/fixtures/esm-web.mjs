import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createContext, SourceTextModule } from "node:vm"

// Load the actual web module graph with browser globals and no Node built-ins.
const context = createContext({ TextEncoder, TextDecoder, btoa })
const modules = new Map()
function load (url) {
  if (!modules.has(url.href)) {
    modules.set(url.href, new SourceTextModule(readFileSync(url, "utf8"), {
      context,
      identifier: url.href
    }))
  }
  return modules.get(url.href)
}

const entryURL = new URL(import.meta.resolve("iconv-lite/web"))
const entry = load(entryURL)
await entry.link((specifier, parent) => {
  assert(specifier.startsWith("."), `Unexpected platform dependency: ${specifier}`)
  return load(new URL(specifier, parent.identifier))
})
await entry.evaluate()
const { default: iconv, encode, decode } = entry.namespace
assert.equal(iconv.encodings, null)
assert.equal(Object.keys(iconv._codecDataCache).length, 0)
for (const name of ["encodeStream", "decodeStream", "enableStreamingAPI", "supportsStreams"]) {
  assert.equal(name in iconv, false)
  assert.equal(name in entry.namespace, false)
}
assert(!modules.has(new URL("./streams.js", entryURL).href))
assert(!modules.has(new URL("./iconv-node.js", entryURL).href))
// Importing the package and using synchronous codecs also works without Web Streams.
assert.equal(iconv.supportsWebStreams, false)
assert.throws(() => iconv.encodeWebStream("utf8"), /require a global TransformStream/)
assert.throws(() => iconv.decodeWebStream("utf8"), /require a global TransformStream/)
assert.equal(encode, iconv.encode)

// A UTF-8 operation must not initialize a DBCS codec or request any DBCS table.
const dbcs = modules.get(new URL("../encodings/dbcs-data.js", entryURL).href).namespace.default
const calls = []
for (const [encoding, definition] of Object.entries(dbcs)) {
  if (typeof definition === "object" && definition.table) {
    const table = definition.table
    definition.table = () => { calls.push(encoding); return table() }
  }
}
assert.equal(decode(encode("hello 😱", "utf8"), "utf8"), "hello 😱")
assert.equal(calls.length, 0)
for (const [encoding, input, expected] of [
  ["gbk", "中文", [0xd6, 0xd0, 0xce, 0xc4]],
  ["shiftjis", "あ", [0x82, 0xa0]],
  ["cp949", "한", [0xc7, 0xd1]],
  ["big5hkscs", "中文", [0xa4, 0xa4, 0xa4, 0xe5]]
]) {
  assert.deepEqual(Array.from(encode(input, encoding)), expected)
  assert.equal(decode(encode(input, encoding), encoding), input)
  assert.equal(calls.filter(name => name === encoding).length, 1)
}

const table = modules.get(new URL("../encodings/tables/cp936.js", entryURL).href).namespace.default
assert.equal(table(), table(), "table data is cached across codec instances")
assert.equal("defaultCharSingleByte" in iconv, false)
assert.equal("defaultCharUnicode" in iconv, false)
assert.deepEqual(Array.from(encode("😱", "ascii", { defaultCharByte: 0x21 })), [0x21, 0x21])
assert.equal(decode(Uint8Array.of(0xAA), "windows1253", { defaultCharUnicode: "!" }), "!")
