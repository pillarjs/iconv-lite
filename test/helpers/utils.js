"use strict"

const assert = require("assert")

const utils = (module.exports = {
  setIconvLite (iconv) {
    utils.iconv = iconv
    utils.backend = iconv.backend
    utils.BytesType = utils.backend.bytesToResult(utils.backend.allocBytes(0), 0).constructor
  },

  requireIconv () {
    if (!utils.iconv) {
      const iconvPath = "../../" // Don't ship this module in the browser environment.
      const iconv = require(iconvPath)
      if (process.env.ICONV_BACKEND) {
        const backendPath = `../../backends/${process.env.ICONV_BACKEND}`
        iconv.setBackend(require(backendPath))
      }
      utils.setIconvLite(iconv)
    }
    return utils.iconv
  },

  // Returns backend 'bytes' types from an array of ints or a hex string.
  bytes (arr) {
    if (typeof arr === "string") {
      // Hex string - convert to array
      const str = arr.replace(/[\s_:.]/g, "") // Remove potential separators
      assert(str.length % 2 === 0)
      arr = []
      for (let i = 0; i < str.length - 1; i += 2) {
        arr.push(parseInt(str.slice(i, i + 2), 16))
      }
    }

    const bytes = utils.backend.allocBytes(arr.length)
    bytes.set(arr)
    return utils.backend.bytesToResult(bytes, bytes.length)
  },

  concatBufs (bufs) {
    return utils.backend.concatByteResults(bufs)
  },

  hex (bytes, nonStrict) {
    assert(nonStrict || bytes instanceof utils.BytesType)
    return Array.prototype.map
      .call(bytes, (byte) => ("0" + (byte & 0xff).toString(16)).slice(-2))
      .join(" ")
  },

  // output hex-encoded characters from string str, in groups of 4 hex chars.
  strToHex (str) {
    return Array.prototype.map
      .call(str, (ch) => ("000" + ch.charCodeAt(0).toString(16)).slice(-4))
      .join(" ")
  },

  checkDecoderChunks (encoding, cases) {
    return () => {
      const decoder = utils.iconv.getDecoder(encoding)
      if (!Array.isArray(cases)) {
        cases = [cases]
      }

      for (let idx = 0; idx < cases.length; idx++) {
        const inputs = cases[idx].inputs
        const outputs = cases[idx].outputs
        for (let i = 0; i < inputs.length; i++) {
          assert.strictEqual(
            decoder.write(utils.bytes(inputs[i])),
            outputs[i],
            `position ${i} in case ${idx}`
          )
        }

        if (outputs.length === inputs.length) {
          assert(!decoder.end(), `end is not empty in case ${idx}`)
        } else if (outputs.length === inputs.length + 1) {
          assert.strictEqual(
            decoder.end(),
            outputs[outputs.length - 1],
                        `end result unexpected in case ${idx}`
          )
        } else {
          assert(false, `invalid outputs array size in case ${idx}`)
        }
      }
    }
  },

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
      assert(i > 0 && i < 0xd800 - 0x22) // Check the character is below surrogates.
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
      assert(typeof str === "string")
      assert(str.length < maxChunkNum / 2, `Input string is too long: ${str.length}`)

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
  _forEachIncrementalStr (baseStr, num, fn) {
    if (num === 1) {
      fn(baseStr)
    } else if (num > 1) {
      assert(baseStr.length >= 1)
      const basePrefix = baseStr.slice(0, -1)
      const baseCharCode = baseStr.charCodeAt(baseStr.length - 1)
      for (let i = 0; i < num; i++) {
        fn(basePrefix + String.fromCharCode(baseCharCode + i))
      }
    }
  },

  rleDecode (str) {
    const res = []
    this.rleDecodeForEach(str, (s) => res.push(s))
    return res
  },

  // Iterator over encoded str; calls fn(str, idx) for each string from original array.
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
        assert.fail(`Unsupported chunk type: ${chunkType}`)
      }
    }
    assert.equal(i, str.length)
  }
})
