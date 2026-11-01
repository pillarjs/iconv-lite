// VLQ-encoded run-length codec for generated DBCS mapping tables.
//
// A payload is "<first unicode>.<first dbcs>.<unicode gaps>.<lengths>.<dbcs gaps>"
// written by generateVlqTable in generation/utils.js.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const B64_VALUE = (() => {
  const table = new Uint8Array(128).fill(255)
  for (let i = 0; i < B64.length; i++) { table[B64.charCodeAt(i)] = i }
  return table
})()

function decodeVlqStream (stream) {
  const values = []
  let i = 0
  while (i < stream.length) {
    let value = 0
    let shift = 0
    let digit
    do {
      digit = B64_VALUE[stream.charCodeAt(i++)]
      value += (digit & 31) << shift
      shift += 5
    } while ((digit & 32) !== 0)
    values.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1)
  }
  return values
}

// Walks a payload and invokes addRun (dbcs, uCode, length) per run,
// so callers can write mappings straight into their own structures.
export function forEachVlqRun (payload, addRun) {
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
