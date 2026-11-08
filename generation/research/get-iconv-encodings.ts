// Prints out information about all iconv encodings.
// Usage:
// > iconv --list | node get-iconv-encodings.ts > iconv-data.json

import iconv from "iconv"
import crypto from "crypto"
import { Buffer } from "buffer"

const skipEncodings: Record<string, boolean> = {}

let input = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", function (data) { input += data })

process.stdin.on("end", function () {
  input = input.replace(/\s|\n/g, " ")
  let encodings = input.split(" ").map(function (s) { return s.trim() }).filter(Boolean)
  encodings = encodings.filter(function (enc) {
    try {
      new iconv.Iconv("utf-8", enc).convert(Buffer.from("hello!"))
      if (skipEncodings[enc]) {
        console.log("Encoding skipped: ", enc)
        return false
      }
    } catch (e) {
      console.log("Encoding not supported: ", enc)
      return false
    }
    return true
  })

  const hashes: Record<string, EncodingInfo> = {}

  encodings.forEach(function (enc) {
    process.stderr.write("Checking " + enc + ": ")
    const hash = crypto.createHash("sha1")

    const converter = new iconv.Iconv(enc, "utf-8"); const buf = Buffer.alloc(10)
    const res: EncodingInfo = {
      enc: [enc],
      isDBCS: true,
      isSBCS: true,
      isASCII: true,
      maxChars: 0,
      valid: 0,
      invalid: 0,
      hash: ""
    }

    try {
      forAllChars(converter, function (valid, inp, outp) {
        res.isASCII = res.isASCII && (inp[0] >= 0x80 || (valid && (inp[0] === outp![0])))
        res.isSBCS = res.isSBCS && (inp.length === 1)
        res.isDBCS = res.isDBCS && (((inp.length === 1) && (inp[0] < 0x80 || !valid)) || ((inp.length === 2) && inp[0] >= 0x80))
        res.maxChars = Math.max(res.maxChars, inp.length)
        hash.update(inp)
        if (valid) {
          res.valid++
          hash.update(outp!)
        } else {
          res.invalid++
        }
        if (res.valid + res.invalid > 1000000) { throw new Error("Too long") }
      }, buf, 1)
    } catch (e) {
      res.bad = true
    }

    res.hash = hash.digest("hex")
    if (hashes[res.hash]) {
      hashes[res.hash].enc.push(enc)
    } else {
      hashes[res.hash] = res
    }

    process.stderr.write(JSON.stringify(res) + "\n")
  })

  console.log(JSON.stringify(Object.values(hashes), undefined, 2))
})
process.stdin.resume()

interface EncodingInfo {
  enc: string[]
  isDBCS: boolean
  isSBCS: boolean
  isASCII: boolean
  maxChars: number
  valid: number
  invalid: number
  hash: string
  bad?: boolean
}

// Make all valid input combinations for a given encoding and call fn with it.
// fn(valid, input, output)
function forAllChars (converter: iconv.Iconv, fn: (valid: boolean, input: Buffer, output: Buffer | undefined) => void, origbuf: Buffer, len: number) {
  const buf = origbuf.slice(0, len)
  for (let i = 0; i < 0x100; i++) {
    buf[len - 1] = i
    let res
    try {
      res = converter.convert(buf)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EILSEQ") { // Invalid character sequence.
        // Notify that this sequence is invalid.
        // fn(false, buf);
      } else if ((e as NodeJS.ErrnoException).code === "EINVAL") { // Partial character sequence.
        // Recurse deeper.
        forAllChars(converter, fn, origbuf, len + 1)
      } else { throw e }
    }

    // buf contains correct input combination. Run fn with input and converter output.
    fn(res != null, buf, res)
  }
}
