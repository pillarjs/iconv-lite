import iconv from "./index.js"
import backend from "../backends/node.js"

iconv.setBackend(backend)

export { default } from "./index.js"
export * from "./index.js"
