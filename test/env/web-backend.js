// Vitest runs this setup before importing each test file in the Web backend project.
import iconv from "../../lib/index-node.js"
import backend from "../../backends/web.js"

iconv.setBackend(backend)
