import type { SizeLimitConfig } from "size-limit"

export default [
  {
    name: "Web bundle (Brotli)",
    path: "dist/lib/index-web.js",
    limit: "90 kB"
  },
  {
    name: "Node bundle (Brotli)",
    path: "dist/lib/index-node.js",
    limit: "90 kB",
    // Select the Node backend and leave Node's built-in modules external.
    modifyRolldownConfig: config => ({ ...config, platform: "node" })
  },
  {
    name: "All encodings bundle (Brotli)",
    path: "dist/encodings/index.js",
    limit: "85 kB"
  },
  {
    name: "Published encodings and declarations",
    path: "dist/encodings/**/*",
    rolldown: false,
    brotli: false,
    limit: "420 kB"
  },
  {
    name: "Published JavaScript and declarations",
    path: "dist/**/*",
    rolldown: false,
    brotli: false,
    limit: "480 kB"
  }
] satisfies SizeLimitConfig
