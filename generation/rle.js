// Shared by the SBCS fixture generator and its runtime tests.
const rle = {
  // Minimal number of consecutive incremental strings to cause incremental encoding.
  rleMinIncrChunkNum: 3,

  // Encode array of strings into a single string with an efficient representation.
  // This encoding is designed with the following criteria in mind: 1) convenience & looking good in indented JSON representation,
  // 2) minimize overhead due to differing string lengths, 3) efficiently encode a case when strings are incrementing,
  // 4) efficiently encode ranges of empty strings (we're using them to represent invalid chars).
  //
  // Encoding description: Encoded string consists of chunks, joined together without separators.
  // Each chunk consists of a 2 character header and a body. Header characters are:
  //  1. Chunk type T and string length K, encoded as character code (0x22 + T + K*2)). There are 2 types: 0 is incremental, 1 is literal, see below.
  //  2. Number of strings N, encoded as character code (0x22 + N).
  // Both N and (T+K*2) are always > 0, so the usage of base char 0x22 (double quote) is minimized in the encoded string. This is good for JSON representation.
  // Chunk types are:
  //  Literal (type 1): Body directly contains N strings from source array of length K each.
  //  Incremental (type 0): Body contains only the first string of length K. The rest of the N-1 strings are implied and can be calculated by
  //    incrementing the last character.
  // Why literal type is 1 and incremental is 0? To keep T+K*2 != 0. For empty strings (K=0) incremental mode doesn't make sense, while literal does, so
  // to avoid zero we swapped the type ids. No other reason.
  /** @param {string[]} arr */
  rleEncode (arr) {
    const maxChunkNum = 50000 // Limit of N, so that it can be represented as a single char (we're targeting before surrogates, 0xD800=55296).
    let res = "" // Result string.

    // As we encode the input array, we keep 2 chunks in 'assembling' state - one literal and one incremental.
    // Both have the same string length. Each can be empty. Incremental chunk conceptually comes after literal.
    let curStrLen = 0 // Length of strings in current chunks.
    let literalChunkBody = "" // Literal chunk body.
    let literalChunkNum = 0 // Number of strings in literalChunkBody (can't be calculated when curStrLen = literalChunkBody.length = 0).
    let incrChunkBase = "" // Base of incremental sequence.
    let incrChunkNum = 0 // Length of incremental sequence.

    if (arr.length === 0) {
      return ""
    }

    const encodeHeaderChar = (i) => {
      // Check the character is below surrogates.
      if (!(i > 0 && i < 0xd800 - 0x22)) throw new RangeError("Invalid RLE header character")
      return String.fromCharCode(0x22 + i)
    }

    const encodeChunk = (type, strlen, numstr, body) =>
      encodeHeaderChar(type + (strlen << 1)) + encodeHeaderChar(numstr) + body

    const flushChunks = () => {
      if (incrChunkNum < this.rleMinIncrChunkNum) {
        convertIncrChunkToLiteral()
      }

      if (literalChunkNum) {
        res += encodeChunk(1, curStrLen, literalChunkNum, literalChunkBody)
        literalChunkBody = ""
        literalChunkNum = 0
      }

      if (incrChunkNum) {
        res += encodeChunk(0, curStrLen, incrChunkNum, incrChunkBase)
        incrChunkBase = ""
        incrChunkNum = 0
      }
    }

    const convertIncrChunkToLiteral = () => {
      this._forEachIncrementalStr(incrChunkBase, incrChunkNum, (str) => {
        literalChunkBody += str
      })
      literalChunkNum += incrChunkNum
      incrChunkNum = 0
      return true
    }

    const isIncrementalStr = (str, baseStr, diff) =>
      str.length > 0 &&
            baseStr.length === str.length &&
            baseStr.slice(0, -1) === str.slice(0, -1) &&
            baseStr.charCodeAt(baseStr.length - 1) + diff === str.charCodeAt(str.length - 1)

    // Process input array of strings one by one.
    for (let i = 0; i < arr.length; i++) {
      const str = arr[i]
      if (typeof str !== "string") throw new TypeError("Expected an RLE input string")
      if (str.length >= maxChunkNum / 2) throw new RangeError(`Input string is too long: ${str.length}`)

      if (
        str.length !== curStrLen ||
                literalChunkNum > maxChunkNum ||
                incrChunkNum > maxChunkNum
      ) {
        // Flush everything and start anew.
        flushChunks()
        curStrLen = str.length
        incrChunkBase = str
        incrChunkNum = 1
      } else if (isIncrementalStr(str, incrChunkBase, incrChunkNum)) {
        incrChunkNum++
      } else {
        // We can't continue incremental chunk.
        if (incrChunkNum < this.rleMinIncrChunkNum) {
          // Incremental chunk too small - move the data to literal and restart incremental.
          convertIncrChunkToLiteral()
        } else {
          // Incremental chunk is big enough - add both chunks to res and restart both.
          flushChunks()
        }
        incrChunkBase = str
        incrChunkNum = 1
      }
    }
    flushChunks()

    return res
  },

  // Call fn(str) with 'num' incrementing strings, starting from baseStr.
  /** @param {string} baseStr @param {number} num @param {(value: string) => void} fn */
  _forEachIncrementalStr (baseStr, num, fn) {
    if (num === 1) {
      fn(baseStr)
    } else if (num > 1) {
      if (baseStr.length < 1) throw new Error("Expected a non-empty RLE base string")
      const basePrefix = baseStr.slice(0, -1)
      const baseCharCode = baseStr.charCodeAt(baseStr.length - 1)
      for (let i = 0; i < num; i++) {
        fn(basePrefix + String.fromCharCode(baseCharCode + i))
      }
    }
  },

  /** @param {string} str @returns {string[]} */
  rleDecode (str) {
    const res = []
    this.rleDecodeForEach(str, (s) => res.push(s))
    return res
  },

  // Iterator over encoded str; calls fn(str, idx) for each string from original array.
  /** @param {string} str @param {(value: string, index: number) => void} fn */
  rleDecodeForEach (str, fn) {
    let i = 0
    let idx = 0
    while (i < str.length - 1) {
      // 1. Read & decode header.
      const firstNum = str.charCodeAt(i) - 0x22
      const numStr = str.charCodeAt(i + 1) - 0x22
      const chunkType = firstNum & 1
      const strLen = firstNum >> 1
      i += 2

      // 2. Depending on chunk type, extract data and call callback.
      if (chunkType === 1) {
        // Literal chunk
        for (let j = 0; j < numStr; j++) {
          fn(str.slice(i, i + strLen), idx++)
          i += strLen
        }
      } else if (chunkType === 0) {
        // Incremental chunk
        const baseStr = str.slice(i, i + strLen)
        i += strLen
        this._forEachIncrementalStr(baseStr, numStr, (str) => {
          fn(str, idx++)
        })
      } else {
        throw new Error(`Unsupported chunk type: ${chunkType}`)
      }
    }
    if (i !== str.length) throw new Error("Invalid RLE string length")
  }
}

export default rle
