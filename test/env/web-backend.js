"use strict"

// Loaded via mocha's `--require` so the web backend is selected before the test
// files call utils.requireIconv(). Using a preload (instead of inline shell env
// like `ICONV_BACKEND=web`) keeps it working cross-platform, including Windows.
process.env.ICONV_BACKEND = "web"
