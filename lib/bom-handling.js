var BOMChar = "\uFEFF"

export class PrependBOM {
  constructor (encoder) {
    this.encoder = encoder
    this.addBOM = true
  }

  write (str) {
    const res = this.addBOM && this.encoder.writeWithBOM
      ? this.encoder.writeWithBOM(str)
      : this.encoder.write(this.addBOM ? BOMChar + str : str)
    if (res !== null) this.addBOM = false
    return res
  }

  end () {
    return this.encoder.end()
  }
}

export class StripBOM {
  constructor (decoder, options) {
    this.decoder = decoder
    this.pass = false
    this.options = options || {}
  }

  write (buf) {
    var res = this.decoder.write(buf)
    if (this.pass || !res)
    { return res }

    if (res[0] === BOMChar) {
      res = res.slice(1)
      if (typeof this.options.stripBOM === "function")
      { this.options.stripBOM() }
    }

    this.pass = true
    return res
  }

  end () {
    return this.decoder.end()
  }
}
