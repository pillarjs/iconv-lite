import iconv from "./index.js"
import backend from "../backends/node.js"
import * as stream from "node:stream"

iconv.setBackend(backend)
iconv.enableStreamingAPI(stream)

export { default } from "./index.js"
export * from "./index.js"
