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

function decodeVlqStream (stream: string) {
  const values = []
  let i = 0
  while (i < stream.length) {
    let value = 0
    let multiplier = 1
    let digit
    do {
      digit = B64_VALUE[stream.charCodeAt(i++)]
      // Keep the accumulator wider than 32 bits for four-byte DBCS addresses.
      value += (digit & 31) * multiplier
      multiplier *= 32
    } while ((digit & 32) !== 0)
    const magnitude = Math.floor(value / 2)
    values.push((value & 1) === 1 ? -magnitude : magnitude)
  }
  return values
}

// Walks a payload and invokes addRun (dbcs, uCode, length) per run,
// so callers can write mappings straight into their own structures.
export function forEachVlqRun (payload: string, addRun: (dbcs: number, uCode: number, length: number) => void) {
  const [firstUCode, firstDbcs, uCodeGaps, lengths, dbcsGaps] = payload.split(".")
  const runUCodeGaps = decodeVlqStream(uCodeGaps)
  const runLengths = decodeVlqStream(lengths)
  const runDbcsGaps = decodeVlqStream(dbcsGaps)

  let uCode = decodeVlqStream(firstUCode)[0]
  let dbcs = decodeVlqStream(firstDbcs)[0]
  for (let i = 0; i < runLengths.length; i++) {
    addRun(dbcs, uCode, runLengths[i])
    uCode += runLengths[i] + runUCodeGaps[i]
    dbcs += runLengths[i] + runDbcsGaps[i]
  }
}
