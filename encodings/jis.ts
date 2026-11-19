import shiftjis from "./tables/shiftjis.js"
import jis0212Data from "./tables/jis0212.js"
import { forEachVlqRun } from "./vlq-runs.js"

const SIZE = 94 * 94
let jis0208: Uint16Array | undefined
let jis0212: Uint16Array | undefined

// The first 94 rows of index jis0208 are already present in Shift_JIS.
// Read its compressed data directly: no Shift_JIS codec or encoder trie is needed.
export function getJis0208 () {
  if (jis0208) return jis0208
  const table = new Uint16Array(SIZE)
  forEachVlqRun(shiftjis(), (bytes, code, length) => {
    for (let i = 0; i < length; i++) {
      const value = bytes + i
      const lead = value >>> 8
      const trail = value & 0xFF
      if (!((lead >= 0x81 && lead <= 0x9F) || (lead >= 0xE0 && lead <= 0xEF))) continue
      const pointer = (lead - (lead < 0xA0 ? 0x81 : 0xC1)) * 188 + trail - (trail < 0x7F ? 0x40 : 0x41)
      table[pointer] = code + i
    }
  })
  jis0208 = table
  return table
}

export function getJis0212 () {
  if (jis0212) return jis0212
  const table = new Uint16Array(SIZE)
  forEachVlqRun(jis0212Data(), (pointer, code, length) => {
    for (let i = 0; i < length; i++) table[pointer + i] = code + i
  })
  jis0212 = table
  return table
}
