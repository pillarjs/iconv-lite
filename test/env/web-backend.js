"use strict"

// Preloaded via `node --require` so the web backend is selected cross-platform
// (without relying on shell env syntax, which differs on Windows).
// The mutation happens in the parent process before the test runner spawns its
// per-file child processes, which inherit this environment.
process.env.ICONV_BACKEND = "web"
