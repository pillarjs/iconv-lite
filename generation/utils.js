import fs from "node:fs"
import { readFile, mkdir, writeFile as writeFileAsync } from "node:fs/promises"
import path from "node:path"

// Common utilities used in scripts.

export async function getFile (url) {
  const sourceDataFolder = path.join(import.meta.dirname, "source-data")
  const fullpath = path.join(sourceDataFolder, path.basename(url))
  try {
    return await readFile(fullpath, "utf8")
  } catch (err) {
    if (err.code !== "ENOENT") throw err
  }

  const response = await fetch(url)
  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error("GET " + url + " returned HTTP " + response.status)
  }
  const text = await response.text()
  await mkdir(sourceDataFolder, { recursive: true })
  await writeFileAsync(fullpath, text)
  return text
}

// Returns array of arrays.
export function parseText (text, splitChar) {
  return text.split("\n").map(function (line) {
    return line.split("#")[0].trim()
  }).filter(Boolean).map(function (line) {
    return line.split(splitChar || /\s+/).map(function (s) { return s.trim() }).filter(Boolean)
  })
}

// Convert array of character codes to string. Character codes can be > 0xFFFF,
// so we emit surrogates when needed. Also, some character codes are actually
// sequences (arrays) - we emit them prepended with U+0FFF-(length-2).
// U+0FFF was chosen because it's small and unassigned, as well as 32 chars before it
function arrToStr (arr) {
  var s = ""
  for (var i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      if (arr[i].length == 1) { s += arrToStr(arr[i]) } else if (arr[i].length > 1) {
        s += String.fromCharCode(0xFFF - (arr[i].length - 2)) +
                    arrToStr(arr[i])
      }
    } else if (arr[i] > 0xFFFF) {
    // Surrogates
      s += String.fromCharCode(0xD800 + Math.floor((arr[i] - 0x10000) / 0x400)) +
               String.fromCharCode(0xDC00 + (arr[i] - 0x10000) % 0x400)
    } else {
    // Basic characters.
      s += String.fromCharCode(arr[i])
    }
  }

  return s
}

// Input: map <dbcs num> -> <unicode num>
// Resulting format: Array of chunks, each chunk is:
// [0] = address of start of the chunk, hex string.
// <str> - characters of the chunk.
// <num> - increasing sequence of the length num, starting with prev character.
export function generateTable (dbcs, maxBytes) {
  var minSeqLen = 4
  var table = []; var range; var block; var seqLen
  var max = 1 << ((maxBytes || 2) * 8)
  for (var i = 0x0000; i < max; i++) {
    if (dbcs[i] !== undefined) {
      if (dbcs[i - 1] === undefined) { // Range started.
        range = [i.toString(16)] // Range[0] is starting address.
        block = [] // Current block of character codes.
        seqLen = 0 // Increasing sequence length at the end of the block.
      } else if (typeof dbcs[i - 1] === "number" &&  // We have arrays as elements of dbcs - check against it.
                     typeof dbcs[i] === "number" &&
                     dbcs[i - 1] + 1 === dbcs[i]) { // Increasing sequence continues - track its length.
        seqLen++
      } else { // Increasing sequence ended (or not started at all).
        if (seqLen >= minSeqLen) {
        // Seq is long enough: write prev segment and its length.
          range.push(arrToStr(block.slice(0, -seqLen)), seqLen)
          block = []
        }
        seqLen = 0
      }

      block.push(dbcs[i])
    } else if (range) { // Range finished, write last segments.
      if (seqLen >= minSeqLen) { range.push(arrToStr(block.slice(0, -seqLen)), seqLen) } else { range.push(arrToStr(block)) }

      table.push(range)
      range = null
    }
  }

  return table
}

export function writeTable (name, table) {
  writeFile(name, "[\n" + table.map(function (a) { return JSON.stringify(a) }).join(",\n") + "\n]\n")
}

export function writeFile (name, body) {
  fs.writeFileSync(path.join(import.meta.dirname, "../encodings/tables", name + ".js"),
    "// Generated encoding table. Allocate and cache its data on first use.\nlet table\n\n" +
        "export default function getTable () {\n  return table ||= " + body.trimEnd() + "\n}\n")
}
