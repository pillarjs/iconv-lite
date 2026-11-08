# Web Platform Tests

Checks iconv-lite against the [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/)
using unmodified [WPT tests](https://github.com/web-platform-tests/wpt) and an
iconv-lite-backed [`TextDecoder` / `TextEncoder` shim](./shim.ts).

Use the current Node.js LTS from the repository root:

```sh
npm run build
npm run test:wpt                                  # Run supported tests
node test/wpt/run.ts textdecoder-mistakes --strict # Filter by filename
node test/wpt/run.ts "" --strict                   # Fail on any assertion failure
node test/wpt/report.ts                           # Markdown conformance report
```

API and mapping checks run in Node. Browser/XHR and iframe variants are not covered.
CI enforces selected files with `--strict` and generates the conformance report.

To refresh tests and mapping tables:

```sh
node test/wpt/update.ts
node test/wpt/gen-indexes.ts
```

Vendored tests live in [`upstream/`](./upstream); their source revision is recorded
in [`UPSTREAM_COMMIT`](./UPSTREAM_COMMIT). CI checks for updates weekly.
