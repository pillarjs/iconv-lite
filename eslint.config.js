import neostandard from "neostandard"

export default [
  ...neostandard({
    ignores: [
      "encodings/tables/*.js", // Generated lazy table factories
      "encodings/sbcs-data-generated.js", // This a generate file
      "test/wpt/upstream", // Vendored upstream Web Platform Tests
      "test/webpack/dist" // Compiled browser tests
    ],
    ts: true,
    filesTs: ["**/*.mts"]
  }),
  {
    files: ["test/**/*.test.js"],
    languageOptions: {
      globals: { describe: "readonly", it: "readonly", beforeEach: "readonly", afterEach: "readonly" }
    }
  },
  {
    languageOptions: { ecmaVersion: "latest" },
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
