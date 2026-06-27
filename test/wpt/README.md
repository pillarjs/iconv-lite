# Web Platform Tests for iconv-lite

Runs the [Web Platform Tests](https://github.com/web-platform-tests/wpt)
`encoding/` suite against iconv-lite, to track conformance with the
[WHATWG Encoding Standard](https://encoding.spec.whatwg.org/).

The WPT tests target the global `TextDecoder` / `TextEncoder`. [`shim.js`](./shim.js)
installs iconv-lite-backed implementations of those globals, so the **unmodified**
upstream tests exercise iconv-lite via [`wpt-runner`](https://github.com/jsdom/wpt-runner)
(jsdom).

## Running

```sh
npm run test:wpt                       # all vendored encoding/*.any.js
node test/wpt/run.js textdecoder-fatal # filter by filename substring
node test/wpt/run.js "" --strict       # exit non-zero on any failure
```

Many assertions fail on purpose — they document real gaps between iconv-lite and
the WHATWG Encoding Standard, e.g.:

| Test | Why it fails |
| --- | --- |
| `textdecoder-fatal` | iconv-lite has no `{ fatal: true }` mode (it always replaces) |
| `textdecoder-utf16-surrogates` | lone surrogates are passed through, not replaced with U+FFFD |
| `textdecoder-labels` | some WHATWG labels are unrecognized (`x-cp1252`, `visual`, `x-mac-*`, …) |
| `api-invalid-label` | iconv-lite's label matching is too lenient — it accepts labels with embedded junk that WHATWG rejects |
| `textdecoder-eof` | no streaming (`stream: true`) |

## Layout

- [`shim.js`](./shim.js) — iconv-lite-backed `TextDecoder` / `TextEncoder`.
- [`run.js`](./run.js) — entry point. Runs `.any.js` API tests via wpt-runner
  (jsdom) and `.window.js` mapping tests via the vm runner.
- [`run-window.js`](./run-window.js) — a small `vm`-based runner (following the
  approach Node.js's `WPTRunner` uses) for `.window.js` tests that ship multiple
  `// META: variant=` blocks. It pins `location.search` to the TextDecoder
  variant so the mapping assertions run against iconv-lite without a browser.
- [`report.js`](./report.js) — combines both runners into a Markdown report.
- [`update.js`](./update.js) — refreshes `upstream/` from a sparse checkout of
  web-platform-tests. Edit its `FILES` list to add/remove coverage.
- [`upstream/`](./upstream) — **unmodified** vendored WPT files (BSD-3-Clause / W3C
  licensed), curated to the TextDecoder/TextEncoder behaviour relevant to
  iconv-lite. Source commit recorded in [`UPSTREAM`](./UPSTREAM).

## Not yet covered (future work)

- The `.window.js` **non-TextDecoder variants** (`?XMLHttpRequest`, `?document`)
  and the **legacy multi-byte** decode tests (`legacy-mb-*/*.html`,
  shift_jis/euc-jp/euc-kr/big5) are iframe/XHR-based and need the official WPT
  python server (e.g. `wpt serve`). Running those would extend coverage.
- Streaming (`stream: true`) and `{ fatal: true }` — iconv-lite implements
  neither, so those assertions fail by design.

```sh
node test/wpt/update.js   # refresh the vendored tests
```

`.github/workflows/wpt-update.yml` runs the update on a schedule and opens a PR
when the vendored files drift from upstream.
