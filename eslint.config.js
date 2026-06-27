"use strict"
const neostandard = require("neostandard")

module.exports = [
  ...neostandard({
    env: ["node"],
    ignores: [
      "encodings/sbcs-data-generated.js", // This a generate file
      // We need work on this
      "generation"
    ],
    ts: true
  }),
  {
    // The webpack tests run in the browser via karma + mocha, so they rely on mocha globals.
    files: ["test/webpack/**"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      }
    }
  },
  {
    rules: {
      "object-shorthand": ["off"], // Compatibility with older code
      "@stylistic/quotes": [2, "double"], // Prevent many change of code
      "new-cap": ["off"], // We need improve this
      "no-labels": ["off"], // Can remove the labels?
      eqeqeq: ["off"], // We need investigate why some conditions are not using strict equality
      "@stylistic/brace-style": ["off"], // Because this rules is flaky?
      "no-var": ["off"], // Compatibility with older code
      "no-redeclare": ["off"], // Because we use var for compatibility with node 0.10
      "comma-dangle": ["error", "never"]
    }
  }
]
