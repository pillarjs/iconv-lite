// Keep imports explicit so this registry also works in browsers.
import internal from "./internal.js"
import * as utf32 from "./utf32.js"
import * as utf16 from "./utf16.js"
import * as utf7 from "./utf7.js"
import * as sbcsCodec from "./sbcs-codec.js"
import sbcsData from "./sbcs-data.js"
import sbcsDataGenerated from "./sbcs-data-generated.js"
import * as dbcsCodec from "./dbcs-codec.js"
import dbcsData from "./dbcs-data.js"
import whatwgAliases from "./whatwg-aliases.js"

export default function getEncodings () {
  return Object.assign({ __proto__: null }, internal, utf32, utf16, utf7, sbcsCodec, sbcsData, sbcsDataGenerated, dbcsCodec, dbcsData, whatwgAliases)
}
