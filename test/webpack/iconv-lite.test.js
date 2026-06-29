"use strict"

const iconv = require("iconv-lite")
iconv.setBackend(require("iconv-lite/backends/web"))
require("../helpers/utils").setIconvLite(iconv)

// List of test files that are ready to be run in web environment.
require("../cyrillic.test")
require("../greek.test")
require("../sbcs.test")
require("../turkish.test")
require("../utf16.test")
require("../utf32.test")
require("../utf7.test")
require("../utils.test")
