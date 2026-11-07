// Include every shared suite, including newly added files. Native bindings,
// Node streams and Node module-loader checks live in *.node.test.js.
const tests = import.meta.webpackContext("..", {
  recursive: false,
  regExp: /^(?!.*\.node\.test\.js$).*test\.js$/
})

tests.keys().sort().forEach(tests)
