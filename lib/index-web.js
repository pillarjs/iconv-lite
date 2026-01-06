"use strict"

const Iconv = require("./index")

const iconv = new Iconv()

iconv.setBackend(require("../backends/web"))

module.exports = iconv
