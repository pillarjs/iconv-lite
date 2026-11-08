import neostandard from "neostandard"

export default [
  ...neostandard({
    ignores: [
      "dist/**",
      "encodings/tables/*.ts", // Generated lazy table factories
      "encodings/sbcs-data-generated.ts", // This a generate file
      "test/wpt/upstream" // Vendored upstream Web Platform Tests
    ],
    ts: true
  }),
  {
    files: ["test/**/*.test.ts"],
    languageOptions: {
      globals: { describe: "readonly", it: "readonly", beforeEach: "readonly", afterEach: "readonly" }
    }
  },
  {
    languageOptions: { ecmaVersion: "latest" },
    rules: {
      "@stylistic/quotes": [2, "double"], // Prevent many change of code
      "comma-dangle": ["error", "never"]
    }
  }
]
