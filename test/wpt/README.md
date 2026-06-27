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
- [`run.js`](./run.js) — wpt-runner entry point (served from the WPT root so
  `/common/...` and `resources/...` includes resolve).
- [`update.js`](./update.js) — refreshes `upstream/` from a sparse checkout of
  web-platform-tests. Edit its `FILES` list to add/remove coverage.
- [`upstream/`](./upstream) — **unmodified** vendored WPT files (BSD-3-Clause / W3C
  licensed), curated to the TextDecoder/TextEncoder behaviour relevant to
  iconv-lite. Source commit recorded in [`UPSTREAM`](./UPSTREAM).

```sh
node test/wpt/update.js   # refresh the vendored tests
```

`.github/workflows/wpt-update.yml` runs the update on a schedule and opens a PR
when the vendored files drift from upstream.
