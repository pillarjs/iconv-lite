"use strict"

const webpack = require("webpack")

// Karma configuration
// Generated on Sat May 23 2020 18:02:48 GMT-0400 (Eastern Daylight Time)
// CHROME_BIN is provided by the `test` script (via `puppeteer browsers install chrome`),
// since puppeteer's executablePath() is now async and can't be awaited in a sync config file.

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: "",

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ["mocha", "webpack"],

    plugins: [
      "karma-webpack",
      "karma-mocha",
      "karma-chrome-launcher",
      "karma-mocha-reporter"
    ],

    // list of files / patterns to load in the browser
    files: [
      { pattern: "*.test.js", watched: false }
    ],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      "*.test.js": ["webpack"]
    },

    webpack: {
      mode: "development",
      target: ["web"],
      resolve: {
        alias: {
          // The native `iconv` binding is used only by the Node-only libiconv cross-checks. Force it
          // to an empty module in the browser bundle (exact match, so `iconv-lite` is unaffected).
          // `resolve.fallback` does not work here because `iconv` IS installed, so webpack would
          // otherwise resolve it and fail trying to bundle its .node binary.
          iconv$: false
        },
        fallback: {
          stream: require.resolve("stream-browserify"),
          assert: require.resolve("assert/"),
          util: require.resolve("util/"),
          buffer: require.resolve("buffer") // This should't be needed, need work in remove this.
        }
      },
      node: {
        global: true
      },
      plugins: [
        new webpack.ProvidePlugin({
          process: require.resolve("process/browser.js")
        })
      ]
      // karma watches the test entry points
      // (you don't need to specify the entry option)
      // webpack watches dependencies
      // webpack configuration
    },

    webpackMiddleware: {
      // Don't watch.
      watchOptions: {
        ignored: ["**/*"]
      }
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ["mocha"],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ["ChromeHeadless", "ChromeHeadlessCI"],

    customLaunchers: {
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox"]
      }
    },

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  })
}
