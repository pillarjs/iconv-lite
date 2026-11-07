import { createRequire } from "node:module"
import assert from "assert"
import { Buffer } from "buffer"
import utils from "./helpers/utils.js"

const require = createRequire(import.meta.url)
const iconv = utils.requireIconv()

describe("Big5 native reference", function () {
  it("Big5 file read decoded,compare with iconv result", function () {
    try {
      require("iconv")
    } catch (_e) {
      this.skip()
    }
    var contentBuffer = Buffer.from("PEhUTUw+DQo8SEVBRD4gICAgDQoJPFRJVExFPiBtZXRhILzQxdKquqjPpc6hR6SkpOW69K22IDwvVElUTEU+DQoJPG1ldGEgSFRUUC1FUVVJVj0iQ29udGVudC1UeXBlIiBDT05URU5UPSJ0ZXh0L2h0bWw7IGNoYXJzZXQ9YmlnNSI+DQo8L0hFQUQ+DQo8Qk9EWT4NCg0Ks2+sT6RArdPBY8XppKSk5br0rbahSTxicj4NCihUaGlzIHBhZ2UgdXNlcyBiaWc1IGNoYXJhY3RlciBzZXQuKTxicj4NCmNoYXJzZXQ9YmlnNQ0KDQo8L0JPRFk+DQo8L0hUTUw+", "base64")
    var str = iconv.decode(contentBuffer, "big5")
    var iconvc = new (require("iconv").Iconv)("big5", "utf8")
    assert.strictEqual(iconvc.convert(contentBuffer).toString(), str)
  })
})
