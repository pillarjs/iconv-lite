// Mocha awaits this preload before importing the test files.
import iconv from "../../lib/index-node.js"
import backend from "../../backends/web.js"

iconv.setBackend(backend)
