import { createRequire } from "node:module"
import path from "node:path"
import webpack from "webpack"

const require = createRequire(import.meta.url)

export default {
  mode: "development",
  target: "web",
  entry: ["./basic.test.js", "./stream.test.js", "./iconv-lite.test.js"],
  output: { path: path.join(import.meta.dirname, "dist"), filename: "suite.js" },
  devtool: "source-map",
  resolve: {
    alias: { "iconv-lite": path.dirname(path.dirname(require.resolve("iconv-lite"))) },
    fallback: {
      stream: require.resolve("stream-browserify"),
      assert: require.resolve("assert/"),
      util: require.resolve("util/"),
      buffer: require.resolve("buffer")
    }
  },
  node: { global: true },
  plugins: [new webpack.ProvidePlugin({ process: require.resolve("process/browser.js") })]
}
