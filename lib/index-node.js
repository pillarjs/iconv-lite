"use strict"

const Iconv = require("./index")

const iconv = new Iconv()

iconv.setBackend(require("../backends/node"))

module.exports = iconv
