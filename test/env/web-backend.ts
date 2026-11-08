// Vitest runs this setup before importing each test file in the Web backend project.
import type { Iconv } from "../../lib/types.js"
import iconv from "../../lib/index-node.js"
import backend from "../../backends/web.js"

const selectedIconv = iconv as unknown as Iconv<Uint8Array>
selectedIconv.setBackend(backend)
