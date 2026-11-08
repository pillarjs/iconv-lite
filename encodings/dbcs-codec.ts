import type { Backend, WebIconv, EncodeOptions, DecodeOptions } from "../lib/iconv.js"
import { EncodingHandler, EncodingBuffer } from "../lib/encoding-handler.js"
import { forEachVlqRun } from "./vlq-runs.js"

// Multibyte codec. In this scheme, a character is represented by 1 or more bytes.
// Our codec supports UTF-16 surrogates, extensions for GB18030 and unicode sequences.
// To save memory and initialization time, we build codec tables only when requested.

type GB18030Ranges = { uChars: number[], gbChars: number[] }
type MappingTable = string | (MappingTable | number)[]
interface EncodeSequence {
  [code: number]: number | EncodeSequence | undefined
  [-1]?: number
}
interface EncodingToken { char: string, index: number, replacement?: boolean }
interface DBCSOptions {
  encodingName: string
  table: () => MappingTable
  leadBytes?: number[][]
  eucjp?: boolean
  gb18030?: () => GB18030Ranges
  gb18030Decode?: () => GB18030Ranges
  gb18030EncoderTable?: Record<number, number | null>
  encodeSkipVals?: (number | { from: number, to: number })[]
  encodeAdd?: Record<string, number>
}

const UNASSIGNED = -1
const GB18030_CODE = -2
const SEQ_START = -10
const NODE_START = -1000
const UNASSIGNED_NODE: number[] = new Array(0x100)
const DEF_CHAR = -1

// Pointer ranges left unassigned by the WHATWG "index gb18030 ranges" table.
// https://encoding.spec.whatwg.org/#index-gb18030-ranges-code-point
const GB18030_GAP_START = 39420
const GB18030_SUPPLEMENTARY_START = 189000
const GB18030_MAX_POINTER = 1237575

for (let i = 0; i < 0x100; i++) { UNASSIGNED_NODE[i] = UNASSIGNED }

// Class DBCSCodec reads and initializes mapping tables.
class DBCSCodec {
  declare encodingName: string
  declare decodeTables: number[][]
  declare decodeTableSeq: number[][]
  declare eucjp: boolean
  declare gb18030: GB18030Ranges | undefined
  declare gb18030EncoderTable: Record<number, number | null> | undefined
  declare gb18030Decode: GB18030Ranges | undefined
  declare defaultCharUnicode: string
  declare encodeTable: number[][]
  declare encodeTableSeq: EncodeSequence[]
  declare defCharSB: number
  declare _vlqRunNode: number[] | undefined
  declare _vlqRunBlockAddr: number | undefined

  constructor (codecOptions: DBCSOptions, iconv: WebIconv) {
    this.encodingName = codecOptions.encodingName
    if (!codecOptions) { throw new Error("DBCS codec is called without the data.") }
    if (!codecOptions.table) { throw new Error("Encoding '" + this.encodingName + "' has no data.") }

    // Load tables.
    const mappingTable = codecOptions.table()

    // Decode tables: MBCS -> Unicode.

    // decodeTables is a trie, encoded as an array of arrays of integers. Internal arrays are trie nodes and all have len = 256.
    // Trie root is decodeTables[0].
    // Values: >=  0 -> unicode character code. can be > 0xFFFF
    //         == UNASSIGNED -> unknown/unassigned sequence.
    //         == GB18030_CODE -> this is the end of a GB18030 4-byte sequence.
    //         <= NODE_START -> index of the next node in our trie to process next byte.
    //         <= SEQ_START  -> index of the start of a character code sequence, in decodeTableSeq.
    this.decodeTables = []
    this.decodeTables[0] = UNASSIGNED_NODE.slice(0) // Create root node.

    // Sometimes a MBCS char corresponds to a sequence of unicode chars. We store them as arrays of integers here.
    this.decodeTableSeq = []

    // A mapping table is a VLQ run-length payload string (see encodings/vlq-runs.js)
    // or chunk rows, or a list mixing both when an encoding extends another one.
    this._addMappingTable(mappingTable)

    // Buffer every lead byte the Encoding Standard decoder buffers, including
    // rows with no assigned mappings, so a pair that starts with one of them
    // is a single error instead of a stray byte followed by a new sequence.
    for (const [from, to] of codecOptions.leadBytes || []) {
      for (let lead = from; lead <= to; lead++) this._getDecodeTrieNode(lead << 8)
    }

    this.eucjp = !!codecOptions.eucjp
    if (this.eucjp) {
      // JIS X 0212 sequences buffer both prefix bytes, even for unassigned rows.
      for (let lead = 0xA1; lead <= 0xFE; lead++) this._getDecodeTrieNode(0x8F0000 | (lead << 8))
    }

    // GBK uses GB18030 decoding without enabling its algorithmic encoder.
    if (typeof codecOptions.gb18030 === "function") {
      this.gb18030 = codecOptions.gb18030()
      this.gb18030EncoderTable = codecOptions.gb18030EncoderTable
    }
    this.gb18030Decode = typeof codecOptions.gb18030Decode === "function"
      ? codecOptions.gb18030Decode()
      : this.gb18030

    if (this.gb18030Decode) {
      // Add GB18030 common decode nodes.
      const commonThirdByteNodeIdx = this.decodeTables.length
      this.decodeTables.push(UNASSIGNED_NODE.slice(0))

      const commonFourthByteNodeIdx = this.decodeTables.length
      this.decodeTables.push(UNASSIGNED_NODE.slice(0))

      // Fill out the tree
      const firstByteNode = this.decodeTables[0]
      for (let i = 0x81; i <= 0xFE; i++) {
        const secondByteNode = this.decodeTables[NODE_START - firstByteNode[i]]
        for (let j = 0x30; j <= 0x39; j++) {
          if (secondByteNode[j] === UNASSIGNED) {
            secondByteNode[j] = NODE_START - commonThirdByteNodeIdx
          } else if (secondByteNode[j] > NODE_START) {
            throw new Error("gb18030 decode tables conflict at byte 2")
          }

          const thirdByteNode = this.decodeTables[NODE_START - secondByteNode[j]]
          for (let k = 0x81; k <= 0xFE; k++) {
            if (thirdByteNode[k] === UNASSIGNED) {
              thirdByteNode[k] = NODE_START - commonFourthByteNodeIdx
            } else if (thirdByteNode[k] === NODE_START - commonFourthByteNodeIdx) {
              continue
            } else if (thirdByteNode[k] > NODE_START) {
              throw new Error("gb18030 decode tables conflict at byte 3")
            }

            const fourthByteNode = this.decodeTables[NODE_START - thirdByteNode[k]]
            for (let l = 0x30; l <= 0x39; l++) {
              if (fourthByteNode[l] === UNASSIGNED) { fourthByteNode[l] = GB18030_CODE }
            }
          }
        }
      }
    }

    this.defaultCharUnicode = iconv.defaultCharUnicode

    // Encode tables: Unicode -> DBCS.

    // `encodeTable` is array mapping from unicode char to encoded char. All its values are integers for performance.
    // Because it can be sparse, it is represented as array of buckets by 256 chars each. Bucket can be null.
    // Values: >=  0 -> it is a normal char. Write the value (if <=256 then 1 byte, if <=65536 then 2 bytes, etc.).
    //         == UNASSIGNED -> no conversion found. Output a default char.
    //         <= SEQ_START  -> it's an index in encodeTableSeq, see below. The character starts a sequence.
    this.encodeTable = []

    // `encodeTableSeq` is used when a sequence of unicode characters is encoded as a single code. We use a tree of
    // objects where keys correspond to characters in sequence and leafs are the encoded dbcs values. A special DEF_CHAR key
    // means end of sequence (needed when one sequence is a strict subsequence of another).
    // Objects are kept separately from encodeTable to increase performance.
    this.encodeTableSeq = []

    // Some chars can be decoded, but need not be encoded.
    const skipEncodeChars: Record<number, boolean> = {}
    if (codecOptions.encodeSkipVals) {
      for (let i = 0; i < codecOptions.encodeSkipVals.length; i++) {
        const val = codecOptions.encodeSkipVals[i]
        if (typeof val === "number") { skipEncodeChars[val] = true } else {
          for (let j = val.from; j <= val.to; j++) { skipEncodeChars[j] = true }
        }
      }
    }

    // Use decode trie to recursively fill out encode tables.
    this._fillEncodeTable(0, 0, skipEncodeChars)

    // Add more encoding pairs when needed.
    if (codecOptions.encodeAdd) {
      for (const uChar in codecOptions.encodeAdd) {
        if (Object.prototype.hasOwnProperty.call(codecOptions.encodeAdd, uChar)) { this._setEncodeChar(uChar.charCodeAt(0), codecOptions.encodeAdd[uChar]) }
      }
    }

    this.defCharSB = this.encodeTable[0][iconv.defaultCharSingleByte.charCodeAt(0)]
    if (this.defCharSB === UNASSIGNED) this.defCharSB = Reflect.get(this.encodeTable[0], "?") as number
    if (this.defCharSB === UNASSIGNED) this.defCharSB = "?".charCodeAt(0)
  }

  createEncoder<Bytes extends Uint8Array> (options: EncodeOptions | undefined, iconv: WebIconv<Bytes>) {
    return typeof options?.invalidCharHandler === "function"
      ? new DBCSHandlerEncoder(this, iconv.backend, options.invalidCharHandler)
      : new DBCSEncoder(this, iconv.backend)
  }

  createDecoder (options: DecodeOptions | undefined, iconv: WebIconv) { return new DBCSDecoder(this, iconv.backend) }

  // Decoder helpers
  _getDecodeTrieNode (addr: number) {
    const bytes = []
    for (; addr > 0; addr >>>= 8) { bytes.push(addr & 0xFF) }
    if (bytes.length === 0) { bytes.push(0) }

    let node = this.decodeTables[0]
    for (let i = bytes.length - 1; i > 0; i--) { // Traverse nodes deeper into the trie.
      const val = node[bytes[i]]

      if (val === UNASSIGNED) { // Create new node.
        node[bytes[i]] = NODE_START - this.decodeTables.length
        this.decodeTables.push(node = UNASSIGNED_NODE.slice(0))
      } else if (val <= NODE_START) { // Existing node.
        node = this.decodeTables[NODE_START - val]
      } else { throw new Error("Overwrite byte in " + this.encodingName + ", addr: " + addr.toString(16)) }
    }
    return node
  }

  // Accept a VLQ payload, a legacy chunk row, or a list of either format.
  _addMappingTable (table: MappingTable) {
    if (typeof table === "string") {
      forEachVlqRun(table, this._addVlqRun.bind(this))
    } else if (typeof table[0] === "string" && /^[0-9a-f]+$/i.test(table[0])) {
      this._addDecodeChunk(table as [string, ...(string | number)[]])
    } else {
      for (const part of table) this._addMappingTable(part as MappingTable)
    }
  }

  // Writes one VLQ payload run into the decode trie directly.
  _addVlqRun (dbcs: number, uCode: number, length: number) {
    while (length > 0) {
      if ((dbcs & ~0xFF) !== this._vlqRunBlockAddr) {
        this._vlqRunNode = this._getDecodeTrieNode(dbcs)
        this._vlqRunBlockAddr = dbcs & ~0xFF
      }
      // node is cached per 256-address block.
      // Consecutive runs usually land in the same block, and the block-to-node mapping is stable for this codec.
      const node = this._vlqRunNode!
      const offset = dbcs & 0xFF
      const count = Math.min(length, 0x100 - offset)
      for (let i = 0; i < count; i++) { node[offset + i] = uCode + i }
      dbcs += count
      uCode += count
      length -= count
    }
  }

  _addDecodeChunk (chunk: [string, ...(string | number)[]]) {
    // First element of chunk is the hex mbcs code where we start.
    let curAddr = parseInt(chunk[0], 16)

    // Choose the decoding node where we'll write our chars.
    const writeTable = this._getDecodeTrieNode(curAddr)
    curAddr = curAddr & 0xFF

    // Write all other elements of the chunk to the table.
    for (let k = 1; k < chunk.length; k++) {
      const part = chunk[k]
      if (typeof part === "string") { // String, write as-is.
        for (let l = 0; l < part.length;) {
          const code = part.charCodeAt(l++)
          if (code >= 0xD800 && code < 0xDC00) { // Decode surrogate
            const codeTrail = part.charCodeAt(l++)
            if (codeTrail >= 0xDC00 && codeTrail < 0xE000) { writeTable[curAddr++] = 0x10000 + (code - 0xD800) * 0x400 + (codeTrail - 0xDC00) } else { throw new Error("Incorrect surrogate pair in " + this.encodingName + " at chunk " + chunk[0]) }
          } else if (code > 0x0FF0 && code <= 0x0FFF) { // Character sequence (our own encoding used)
            const len = 0xFFF - code + 2
            const seq = []
            for (let m = 0; m < len; m++) { seq.push(part.charCodeAt(l++)) } // Simple variation: don't support surrogates or subsequences in seq.

            writeTable[curAddr++] = SEQ_START - this.decodeTableSeq.length
            this.decodeTableSeq.push(seq)
          } else { writeTable[curAddr++] = code } // Basic char
        }
      } else if (typeof part === "number") { // Integer, meaning increasing sequence starting with prev character.
        let charCode = writeTable[curAddr - 1] + 1
        for (let l = 0; l < part; l++) { writeTable[curAddr++] = charCode++ }
      } else { throw new Error("Incorrect type '" + typeof part + "' given in " + this.encodingName + " at chunk " + chunk[0]) }
    }
    if (curAddr > 0xFF) { throw new Error("Incorrect chunk in " + this.encodingName + " at addr " + chunk[0] + ": too long" + curAddr) }
  }

  // Encoder helpers
  _getEncodeBucket (uCode: number) {
    const high = uCode >> 8 // This could be > 0xFF because of astral characters.
    if (this.encodeTable[high] === undefined) {
      this.encodeTable[high] = UNASSIGNED_NODE.slice(0)
    } // Create bucket on demand.
    return this.encodeTable[high]
  }

  _setEncodeChar (uCode: number, dbcsCode: number) {
    const bucket = this._getEncodeBucket(uCode)
    const low = uCode & 0xFF
    if (bucket[low] <= SEQ_START) {
      // There's already a sequence, set a single-char subsequence of it.
      this.encodeTableSeq[SEQ_START - bucket[low]][DEF_CHAR] = dbcsCode
    } else if (bucket[low] === UNASSIGNED) { bucket[low] = dbcsCode }
  }

  _setEncodeSequence (seq: number[], dbcsCode: number) {
    // Get the root of character tree according to first character of the sequence.
    let uCode = seq[0]
    const bucket = this._getEncodeBucket(uCode)
    const low = uCode & 0xFF

    let node: EncodeSequence
    if (bucket[low] <= SEQ_START) {
      // There's already a sequence with  - use it.
      node = this.encodeTableSeq[SEQ_START - bucket[low]]
    } else {
      // There was no sequence object - allocate a new one.
      node = {}
      if (bucket[low] !== UNASSIGNED) node[DEF_CHAR] = bucket[low] // If a char was set before - make it a single-char subsequence.
      bucket[low] = SEQ_START - this.encodeTableSeq.length
      this.encodeTableSeq.push(node)
    }

    // Traverse the character tree, allocating new nodes as needed.
    for (let j = 1; j < seq.length - 1; j++) {
      const oldVal = node[uCode]
      if (typeof oldVal === "object") { node = oldVal } else {
        node = node[uCode] = {}
        if (oldVal !== undefined) { node[DEF_CHAR] = oldVal }
      }
    }

    // Set the leaf to given dbcsCode.
    uCode = seq[seq.length - 1]
    node[uCode] = dbcsCode
  }

  _fillEncodeTable (nodeIdx: number, prefix: number, skipEncodeChars: Record<number, boolean>) {
    const node = this.decodeTables[nodeIdx]
    let hasValues = false
    const subNodeEmpty: Record<number, boolean> = {}
    for (let i = 0; i < 0x100; i++) {
      const uCode = node[i]
      const mbCode = prefix + i
      if (skipEncodeChars[mbCode]) { continue }

      if (uCode >= 0) {
        this._setEncodeChar(uCode, mbCode)
        hasValues = true
      } else if (uCode <= NODE_START) {
        const subNodeIdx = NODE_START - uCode
        if (!subNodeEmpty[subNodeIdx]) {  // Skip empty subtrees (they are too large in gb18030).
          const newPrefix = (mbCode << 8) >>> 0  // NOTE: '>>> 0' keeps 32-bit num positive.
          if (this._fillEncodeTable(subNodeIdx, newPrefix, skipEncodeChars)) { hasValues = true } else { subNodeEmpty[subNodeIdx] = true }
        }
      } else if (uCode <= SEQ_START) {
        this._setEncodeSequence(this.decodeTableSeq[SEQ_START - uCode], mbCode)
        hasValues = true
      }
    }
    return hasValues
  }
}

// == Encoder ==================================================================

class DBCSEncoder<Bytes extends Uint8Array> {
  declare backend: Backend<Bytes>
  declare leadSurrogate: number
  declare seqObj: EncodeSequence | undefined
  declare encodeTable: number[][]
  declare encodeTableSeq: EncodeSequence[]
  declare defaultCharSingleByte: number
  declare gb18030: GB18030Ranges | undefined
  declare gb18030EncoderTable: Record<number, number | null> | undefined

  constructor (codec: DBCSCodec, backend: Backend<Bytes>) {
    this.backend = backend
    // Encoder state
    this.leadSurrogate = -1
    this.seqObj = undefined

    // Static data
    this.encodeTable = codec.encodeTable
    this.encodeTableSeq = codec.encodeTableSeq
    this.defaultCharSingleByte = codec.defCharSB
    this.gb18030 = codec.gb18030
    this.gb18030EncoderTable = codec.gb18030EncoderTable
  }

  write (str: string) {
    // A pending surrogate or sequence may emit output before the new input.
    const pendingChars = (this.leadSurrogate === -1 ? 0 : 1) + (this.seqObj === undefined ? 0 : 1)
    const newBuf = this.backend.allocBytes((str.length + pendingChars) * (this.gb18030 ? 4 : 3))
    let leadSurrogate = this.leadSurrogate
    let seqObj = this.seqObj
    let nextChar = -1
    let i = 0; let j = 0

    while (true) {
      // 0. Get next character.
      let uCode
      if (nextChar === -1) {
        if (i === str.length) break
        uCode = str.charCodeAt(i++)
      } else {
        uCode = nextChar
        nextChar = -1
      }

      // 1. Handle surrogates.
      if (uCode >= 0xD800 && uCode < 0xE000) { // Char is one of surrogates.
        if (uCode < 0xDC00) { // We've got lead surrogate.
          if (leadSurrogate === -1) {
            leadSurrogate = uCode
            continue
          } else {
            leadSurrogate = uCode
            // Double lead surrogate found.
            uCode = UNASSIGNED
          }
        } else { // We've got trail surrogate.
          if (leadSurrogate !== -1) {
            uCode = 0x10000 + (leadSurrogate - 0xD800) * 0x400 + (uCode - 0xDC00)
            leadSurrogate = -1
          } else {
            // Incomplete surrogate pair - only trail surrogate found.
            uCode = UNASSIGNED
          }
        }
      } else if (leadSurrogate !== -1) {
        // Incomplete surrogate pair - only lead surrogate found.
        nextChar = uCode; uCode = UNASSIGNED // Write an error, then current char.
        leadSurrogate = -1
      }

      // 2. Convert uCode character.
      let dbcsCode = UNASSIGNED
      if (seqObj !== undefined && uCode !== UNASSIGNED) { // We are in the middle of the sequence
        let resCode = seqObj[uCode]
        if (typeof resCode === "object") { // Sequence continues.
          seqObj = resCode
          continue
        } else if (typeof resCode === "number") { // Sequence finished. Write it.
          dbcsCode = resCode
        } else if (resCode == null) { // Current character is not part of the sequence.
          // Try default character for this sequence
          resCode = seqObj[DEF_CHAR]
          if (resCode !== undefined) {
            dbcsCode = resCode // Found. Write it.
            nextChar = uCode // Current character will be written too in the next iteration.
          } else {
            // TODO: What if we have no default? (resCode == null)
            // Then, we should write first char of the sequence as-is and try the rest recursively.
            // Didn't do it for now because no encoding has this situation yet.
            // Currently, just skip the sequence and write current char.
          }
        }
        seqObj = undefined
      } else if (uCode >= 0) {  // Regular character
        const subtable = this.encodeTable[uCode >> 8]
        if (subtable !== undefined) { dbcsCode = subtable[uCode & 0xFF] }

        if (dbcsCode <= SEQ_START) { // Sequence start
          seqObj = this.encodeTableSeq[SEQ_START - dbcsCode]
          continue
        }

        if (dbcsCode === UNASSIGNED && this.gb18030) {
          // The WHATWG encoder side table overrides the ranges algorithm.
          const tableCode = this.gb18030EncoderTable?.[uCode]
          if (tableCode !== undefined) {
            // A null entry uses the configured fallback in the common writer.
            dbcsCode = tableCode ?? UNASSIGNED
          } else {
            // Use GB18030 algorithm to find character(s) to write.
            const idx = findIdx(this.gb18030!.uChars, uCode)
            if (idx !== -1) {
              dbcsCode = this.gb18030!.gbChars[idx] + (uCode - this.gb18030!.uChars[idx])
              newBuf[j++] = 0x81 + Math.floor(dbcsCode / 12600); dbcsCode = dbcsCode % 12600
              newBuf[j++] = 0x30 + Math.floor(dbcsCode / 1260); dbcsCode = dbcsCode % 1260
              newBuf[j++] = 0x81 + Math.floor(dbcsCode / 10); dbcsCode = dbcsCode % 10
              newBuf[j++] = 0x30 + dbcsCode
              continue
            }
          }
        }
      }

      // 3. Write dbcsCode character.
      if (dbcsCode === UNASSIGNED) { dbcsCode = this.defaultCharSingleByte }

      if (dbcsCode < 0x100) {
        newBuf[j++] = dbcsCode
      } else if (dbcsCode < 0x10000) {
        newBuf[j++] = dbcsCode >> 8   // high byte
        newBuf[j++] = dbcsCode & 0xFF // low byte
      } else if (dbcsCode < 0x1000000) {
        newBuf[j++] = dbcsCode >> 16
        newBuf[j++] = (dbcsCode >> 8) & 0xFF
        newBuf[j++] = dbcsCode & 0xFF
      } else {
        newBuf[j++] = dbcsCode >>> 24
        newBuf[j++] = (dbcsCode >>> 16) & 0xFF
        newBuf[j++] = (dbcsCode >>> 8) & 0xFF
        newBuf[j++] = dbcsCode & 0xFF
      }
    }

    this.seqObj = seqObj
    this.leadSurrogate = leadSurrogate
    return this.backend.bytesToResult(newBuf, j)
  }

  end () {
    if (this.leadSurrogate === -1 && this.seqObj === undefined) { return } // All clean. Most often case.

    const newBuf = this.backend.allocBytes(10); let j = 0

    if (this.seqObj) { // We're in the sequence.
      const dbcsCode = this.seqObj[DEF_CHAR]
      if (dbcsCode !== undefined) { // Write beginning of the sequence.
        if (dbcsCode < 0x100) {
          newBuf[j++] = dbcsCode
        } else {
          newBuf[j++] = dbcsCode >> 8   // high byte
          newBuf[j++] = dbcsCode & 0xFF // low byte
        }
      } else {
        // See todo above.
      }
      this.seqObj = undefined
    }

    if (this.leadSurrogate !== -1) {
      // Incomplete surrogate pair - only lead surrogate found.
      newBuf[j++] = this.defaultCharSingleByte
      this.leadSurrogate = -1
    }

    return this.backend.bytesToResult(newBuf, j)
  }

  // Export for testing
  findIdx (table: number[], val: number) { return findIdx(table, val) }
}

// The opt-in path retains source positions and sequence tokens so replacements can
// participate in the same Big5/DBCS sequence as the surrounding input.
class DBCSHandlerEncoder<Bytes extends Uint8Array> {
  #codec: DBCSCodec
  #backend: Backend<Bytes>
  #handler: EncodingHandler
  #sequence: EncodingToken[] = []
  #node: EncodeSequence | null = null

  constructor (codec: DBCSCodec, backend: Backend<Bytes>, callback: NonNullable<EncodeOptions["invalidCharHandler"]>) {
    this.#codec = codec
    this.#backend = backend
    this.#handler = new EncodingHandler(callback, codec.encodingName)
  }

  #mapping (char: string) {
    const code = char.codePointAt(0)!
    if (code >= 0xD800 && code <= 0xDFFF) return UNASSIGNED
    const mapped = this.#codec.encodeTable[code >> 8]?.[code & 0xFF] ?? UNASSIGNED
    if (mapped !== UNASSIGNED || !this.#codec.gb18030) return mapped
    const tableCode = this.#codec.gb18030EncoderTable?.[code]
    if (tableCode !== undefined) return tableCode ?? UNASSIGNED
    const ranges = this.#codec.gb18030
    const index = findIdx(ranges.uChars, code)
    if (index === -1) return UNASSIGNED
    const pointer = ranges.gbChars[index] + code - ranges.uChars[index]
    return (0x81 + Math.floor(pointer / 12600)) * 0x1000000 +
      (0x30 + Math.floor(pointer / 1260) % 10) * 0x10000 +
      (0x81 + Math.floor(pointer / 10) % 126) * 0x100 + 0x30 + pointer % 10
  }

  #invalid (token: EncodingToken, output: EncodingBuffer<Bytes>): boolean {
    if (token.replacement) throw this.#handler.replacementError(token.char, token.index)
    const replacement = this.#handler.resolve(token.char, token.index)
    if (replacement === null) return false
    if (replacement === undefined) {
      if (!this.#flushSequence(output)) return false
      output.writeCode(this.#codec.defCharSB)
    } else {
      for (const char of replacement) {
        if (!this.#emit({ char, index: token.index, replacement: true }, output)) return false
      }
    }
    return true
  }

  #flushSequence (output: EncodingBuffer<Bytes>): boolean {
    if (!this.#node) return true
    const code = this.#node[DEF_CHAR]
    const sequence = this.#sequence
    this.#node = null
    this.#sequence = []
    if (code !== undefined) {
      output.writeCode(code)
      return true
    }
    // A sequence prefix without its own mapping must not disappear silently.
    if (!this.#invalid(sequence[0], output)) return false
    for (const token of sequence.slice(1)) {
      if (!this.#emit(token, output)) return false
    }
    return true
  }

  #emit (token: EncodingToken, output: EncodingBuffer<Bytes>): boolean {
    const mapped = this.#mapping(token.char)
    if (this.#node) {
      const next = this.#node[token.char.codePointAt(0)!]
      if (typeof next === "object") {
        this.#sequence.push(token)
        this.#node = next
        return true
      }
      if (typeof next === "number") {
        output.writeCode(next)
        this.#node = null
        this.#sequence = []
        return true
      }
      // Resolve an invalid character before closing the preceding sequence: its
      // replacement may finish that sequence, or an empty replacement may skip it.
      if (mapped === UNASSIGNED) return this.#invalid(token, output)
      if (!this.#flushSequence(output)) return false
      return this.#emit(token, output)
    }
    if (mapped === UNASSIGNED) return this.#invalid(token, output)
    if (mapped <= SEQ_START) {
      this.#node = this.#codec.encodeTableSeq[SEQ_START - mapped]
      this.#sequence = [token]
    } else {
      output.writeCode(mapped)
    }
    return true
  }

  #reset () {
    this.#handler.clear()
    this.#node = null
    this.#sequence = []
  }

  #write (str: string, final: boolean) {
    const output = new EncodingBuffer(this.#backend, str.length * 3)
    try {
      for (const token of this.#handler.read(str, final)) {
        if (!this.#emit(token, output)) {
          this.#reset()
          return null
        }
      }
      if (final) {
        while (this.#node) {
          if (!this.#flushSequence(output)) {
            this.#reset()
            return null
          }
        }
      }
      return output.finish()
    } catch (error) {
      this.#reset()
      throw error
    }
  }

  write (str: string) { return this.#write(str, false) }

  end () {
    if (this.#handler.hasPending || this.#node) return this.#write("", true)
  }
}

// == Decoder ==================================================================

class DBCSDecoder {
  declare backend: Backend
  declare nodeIdx: number
  declare prevBytes: number[]
  declare decodeTables: number[][]
  declare decodeTableSeq: number[][]
  declare defaultCharUnicode: string
  declare gb18030: GB18030Ranges | undefined
  declare eucjp: boolean

  constructor (codec: DBCSCodec, backend: Backend) {
    this.backend = backend
    // Decoder state
    this.nodeIdx = 0
    this.prevBytes = []

    // Static data
    this.decodeTables = codec.decodeTables
    this.decodeTableSeq = codec.decodeTableSeq
    this.defaultCharUnicode = codec.defaultCharUnicode
    this.gb18030 = codec.gb18030Decode
    this.eucjp = codec.eucjp
  }

  write (buf: Uint8Array | number[]) {
    if (buf.length === 0) return ""
    // Buffered bytes can complete a surrogate pair/sequence or need reprocessing.
    const newBuf = this.backend.allocRawChars(buf.length + this.prevBytes.length)
    let nodeIdx = this.nodeIdx
    const prevBytes = this.prevBytes; const prevOffset = this.prevBytes.length
    let seqStart = -this.prevBytes.length // idx of the start of current parsed sequence.
    let j = 0

    for (let i = 0; i < buf.length; i++) {
      const curByte = (i >= 0) ? buf[i] : prevBytes[i + prevOffset]

      // Lookup in current trie node.
      let uCode = this.decodeTables[nodeIdx][curByte]

      if (uCode >= 0) {
        // Normal character, just use it.
      } else if (uCode === UNASSIGNED) { // Unknown char.
        // TODO: Callback with seq.
        uCode = this.defaultCharUnicode.charCodeAt(0)
        // EUC-JP consumes a JIS X 0212 prefix together with an invalid third
        // byte, restoring only an ASCII byte to the input queue.
        if (this.eucjp && i - seqStart === 2) {
          if (curByte < 0x80) i--
        } else if (i - seqStart !== 1 || curByte < 0x80) {
          // Other invalid pairs consume a non-ASCII second byte with the lead.
          // Later errors in GB18030 retry after the first byte.
          // seqStart is negative when the sequence began in a previous chunk,
          // so i - seqStart === 1 also detects a second byte across chunks.
          i = seqStart
        }
      } else if (uCode === GB18030_CODE) {
        let ptr
        if (i >= 3) {
          ptr = (buf[i - 3] - 0x81) * 12600 + (buf[i - 2] - 0x30) * 1260 + (buf[i - 1] - 0x81) * 10 + (curByte - 0x30)
        } else {
          ptr = (prevBytes[i - 3 + prevOffset] - 0x81) * 12600 +
                            (((i - 2 >= 0) ? buf[i - 2] : prevBytes[i - 2 + prevOffset]) - 0x30) * 1260 +
                            (((i - 1 >= 0) ? buf[i - 1] : prevBytes[i - 1 + prevOffset]) - 0x81) * 10 +
                            (curByte - 0x30)
        }
        if (ptr < GB18030_GAP_START) {
          const idx = findIdx(this.gb18030!.gbChars, ptr)
          uCode = this.gb18030!.uChars[idx] + ptr - this.gb18030!.gbChars[idx]
        } else if (ptr >= GB18030_SUPPLEMENTARY_START && ptr <= GB18030_MAX_POINTER) {
          // The supplementary range maps linearly to U+10000..U+10FFFF.
          uCode = 0x10000 + ptr - GB18030_SUPPLEMENTARY_START
        } else {
          uCode = this.defaultCharUnicode.charCodeAt(0)
        }
      } else if (uCode <= NODE_START) { // Go to next trie node.
        nodeIdx = NODE_START - uCode
        continue
      } else if (uCode <= SEQ_START) { // Output a sequence of chars.
        const seq = this.decodeTableSeq[SEQ_START - uCode]
        for (let k = 0; k < seq.length - 1; k++) {
          uCode = seq[k]
          newBuf[j++] = uCode
        }
        uCode = seq[seq.length - 1]
      } else { throw new Error("iconv-lite internal error: invalid decoding table value " + uCode + " at " + nodeIdx + "/" + curByte) }

      // Write the character to buffer, handling higher planes using surrogate pair.
      if (uCode >= 0x10000) {
        uCode -= 0x10000
        const uCodeLead = 0xD800 | (uCode >> 10)
        newBuf[j++] = uCodeLead

        uCode = 0xDC00 | (uCode & 0x3FF)
      }
      newBuf[j++] = uCode

      // Reset trie node.
      nodeIdx = 0; seqStart = i + 1
    }

    this.nodeIdx = nodeIdx
    // Keep only the unfinished sequence, reusing the small pending-byte array.
    if (seqStart >= 0) {
      prevBytes.length = buf.length - seqStart
      for (let i = seqStart; i < buf.length; i++) prevBytes[i - seqStart] = buf[i]
    } else {
      let retained = 0
      for (let i = seqStart + prevOffset; i < prevOffset; i++) prevBytes[retained++] = prevBytes[i]
      for (let i = 0; i < buf.length; i++) prevBytes[retained++] = buf[i]
      prevBytes.length = retained
    }

    return this.backend.rawCharsToResult(newBuf, j)
  }

  end () {
    if (this.prevBytes.length === 0) return ""
    if (this.gb18030 || this.eucjp) {
      // End-of-input consumes the entire incomplete sequence as one error.
      this.prevBytes.length = 0
      this.nodeIdx = 0
      return this.defaultCharUnicode
    }
    let ret = ""

    // Try to parse all remaining chars.
    while (this.prevBytes.length > 0) {
      // Skip 1 character in the buffer.
      ret += this.defaultCharUnicode
      const bytesArr = this.prevBytes.slice(1)

      // Parse remaining as usual.
      this.prevBytes.length = 0
      this.nodeIdx = 0
      if (bytesArr.length > 0) { ret += this.write(bytesArr) }
    }

    this.prevBytes.length = 0
    this.nodeIdx = 0
    return ret
  }
}

// Binary search for GB18030. Returns largest i such that table[i] <= val.
function findIdx (table: number[], val: number) {
  if (table[0] > val) { return -1 }

  let l = 0; let r = table.length
  while (l < r - 1) { // always table[l] <= val < table[r]
    const mid = l + ((r - l + 1) >> 1)
    if (table[mid] <= val) { l = mid } else { r = mid }
  }
  return l
}

export const _dbcs = DBCSCodec
