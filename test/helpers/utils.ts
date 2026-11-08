import type { Backend, Iconv, Encoding } from "iconv-lite"
import rle from "../../generation/rle.js"
import iconv from "iconv-lite"

type DecoderCase = { inputs: (ArrayLike<number> | string)[], outputs: string[] }

const utils = {
  iconv: undefined as Iconv<Uint8Array> | undefined,
  backend: undefined as unknown as Backend,
  BytesType: undefined as unknown as Uint8ArrayConstructor,
  setIconvLite (iconv: Iconv<Uint8Array>) {
    utils.iconv = iconv
    utils.backend = iconv.backend
    utils.BytesType = utils.backend.bytesToResult(utils.backend.allocBytes(0), 0).constructor as Uint8ArrayConstructor
  },

  requireIconv () {
    if (!utils.iconv) {
      utils.setIconvLite(iconv as unknown as Iconv<Uint8Array>)
    }
    return utils.iconv!
  },

  // Returns backend 'bytes' types from an array of ints or a hex string.
  bytes (arr: ArrayLike<number> | string) {
    if (typeof arr === "string") {
      // Hex string - convert to array
      const str = arr.replace(/[\s_:.]/g, "") // Remove potential separators
      if (str.length % 2 !== 0) throw new Error("Expected an even-length hex string")
      const values = []
      for (let i = 0; i < str.length - 1; i += 2) {
        values.push(parseInt(str.slice(i, i + 2), 16))
      }
      arr = values
    }

    const bytes = utils.backend.allocBytes(arr.length)
    bytes.set(arr)
    return utils.backend.bytesToResult(bytes, bytes.length)
  },

  concatBufs (bufs: (Uint8Array | null | undefined)[]) {
    if (bufs.some(bytes => bytes == null)) throw new TypeError("Expected encoded bytes")
    return utils.backend.concatByteResults(bufs as Uint8Array[])
  },

  hex (bytes: ArrayLike<number> | null | undefined, nonStrict = false) {
    if (bytes == null || (!nonStrict && !(bytes instanceof utils.BytesType))) throw new TypeError("Expected bytes from the selected backend")
    return Array.prototype.map
      .call(bytes, (byte: number) => ("0" + (byte & 0xff).toString(16)).slice(-2))
      .join(" ")
  },

  // output hex-encoded characters from string str, in groups of 4 hex chars.
  strToHex (str: string) {
    return Array.prototype.map
      .call(str, (ch: string) => ("000" + ch.charCodeAt(0).toString(16)).slice(-4))
      .join(" ")
  },

  checkDecoderChunks (encoding: Encoding, cases: DecoderCase | DecoderCase[]) {
    return () => {
      const decoder = utils.requireIconv().getDecoder(encoding)
      if (!Array.isArray(cases)) {
        cases = [cases]
      }

      for (let idx = 0; idx < cases.length; idx++) {
        const inputs = cases[idx].inputs
        const outputs = cases[idx].outputs
        for (let i = 0; i < inputs.length; i++) {
          const actual = decoder.write(utils.bytes(inputs[i]))
          if (actual !== outputs[i]) {
            throw new Error(`position ${i} in case ${idx}: expected ${JSON.stringify(outputs[i])}, got ${JSON.stringify(actual)}`)
          }
        }

        if (outputs.length === inputs.length) {
          if (decoder.end()) throw new Error(`end is not empty in case ${idx}`)
        } else if (outputs.length === inputs.length + 1) {
          const actual = decoder.end()
          const expected = outputs[outputs.length - 1]
          if (actual !== expected) {
            throw new Error(`end result in case ${idx}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
          }
        } else {
          throw new Error(`invalid outputs array size in case ${idx}`)
        }
      }
    }
  },

  ...rle
}

export default utils
