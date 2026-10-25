// NOTE: Due to 'stream' module being pretty large (~100Kb, significant in browser environments),
// we opt to dependency-inject it instead of creating a hard dependency.
export default function (streamModule) {
  class IconvLiteEncoderStream extends streamModule.Transform {
    constructor (conv, options, iconv) {
      options = options || {}
      options.decodeStrings = false // We accept only strings, so we don't need to decode them.
      super(options)
      this.conv = conv
      this.iconv = iconv
    }

    _transform (chunk, encoding, done) {
      if (typeof chunk !== "string") { return done(new Error("Iconv encoding stream needs strings as its input.")) }
      try {
        const res = this.conv.write(chunk)
        if (res && res.length) this.push(res)
        done()
      }
      catch (e) {
        done(e)
      }
    }

    _flush (done) {
      try {
        const res = this.conv.end()
        if (res && res.length) this.push(res)
        done()
      }
      catch (e) {
        done(e)
      }
    }

    collect (cb) {
      const chunks = []
      this.on("error", cb)
      this.on("data", (chunk) => chunks.push(chunk))
      this.on("end", () => cb(null, this.iconv.backend.concatByteResults(chunks)))
      return this
    }
  }

  class IconvLiteDecoderStream extends streamModule.Transform {
    constructor (conv, options) {
      options = options || {}
      options.encoding = "utf8" // We output strings.
      super(options)
      this.conv = conv
      this.encoding = options.encoding
    }

    _transform (chunk, encoding, done) {
      if (!(chunk instanceof Uint8Array)) { return done(new Error("Iconv decoding stream needs Uint8Array-s or Buffers as its input.")) }
      try {
        const res = this.conv.write(chunk)
        if (res && res.length) this.push(res, this.encoding)
        done()
      }
      catch (e) {
        done(e)
      }
    }

    _flush (done) {
      try {
        const res = this.conv.end()
        if (res && res.length) this.push(res, this.encoding)
        done()
      }
      catch (e) {
        done(e)
      }
    }

    collect (cb) {
      let res = ""
      this.on("error", cb)
      this.on("data", (chunk) => { res += chunk })
      this.on("end", () => cb(null, res))
      return this
    }
  }

  return {
    IconvLiteEncoderStream,
    IconvLiteDecoderStream
  }
}
