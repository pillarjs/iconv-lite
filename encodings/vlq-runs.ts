// VLQ-encoded run-length codec for generated DBCS mapping tables.
//
// A payload is "<first unicode>.<first dbcs>.<unicode gaps>.<lengths>.<dbcs gaps>"
// written by generateVlqTable in generation/utils.ts.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const B64_VALUE = (() => {
  const table = new Uint8Array(128).fill(255)
  for (let i = 0; i < B64.length; i++) { table[B64.charCodeAt(i)] = i }
  return table
})()

// Read the three columns in lockstep, writing runs directly into the caller's
// table instead of allocating substrings and intermediate arrays of VLQ values.
export function forEachVlqRun (payload: string, addRun: (dbcs: number, uCode: number, length: number) => void) {
  let offset = 0
  function read () {
    let value = 0
    let multiplier = 1
    let digit
    do {
      digit = B64_VALUE[payload.charCodeAt(offset++)]
      // Four-byte DBCS addresses require more than 32 bits after zig-zag encoding.
      value += (digit & 31) * multiplier
      multiplier *= 32
    } while ((digit & 32) !== 0)
    const magnitude = Math.floor(value / 2)
    return (value & 1) === 1 ? -magnitude : magnitude
  }

  let uCode = read()
  offset++ // First separator.
  let dbcs = read()
  let unicodeOffset = offset + 1
  let lengthOffset = payload.indexOf(".", unicodeOffset) + 1
  let dbcsOffset = payload.indexOf(".", lengthOffset) + 1
  const lengthsEnd = dbcsOffset - 1
  while (lengthOffset < lengthsEnd) {
    offset = lengthOffset
    const length = read()
    lengthOffset = offset
    addRun(dbcs, uCode, length)
    if (lengthOffset === lengthsEnd) break
    offset = unicodeOffset
    uCode += length + read()
    unicodeOffset = offset
    offset = dbcsOffset
    dbcs += length + read()
    dbcsOffset = offset
  }
}
