# Web Platform Tests for iconv-lite

Runs the [Web Platform Tests](https://github.com/web-platform-tests/wpt)
`encoding/` suite against iconv-lite, to track conformance with the
[WHATWG Encoding Standard](https://encoding.spec.whatwg.org/).

The WPT tests target the global `TextDecoder` / `TextEncoder`. [`shim.ts`](./shim.ts)
installs iconv-lite-backed implementations of those globals, so the **unmodified**
upstream tests exercise iconv-lite via [`wpt-runner`](https://github.com/jsdom/wpt-runner)
(jsdom).

The decoder shim uses `getDecoder().write()` across `stream: true` calls and
flushes with `end()` on the final call. This exercises iconv-lite's streaming
state and end-of-input handling, including the `textdecoder-eof` tests.

## Running

Use the current Node.js LTS to execute these TypeScript tools natively.

```sh
npm run test:wpt                       # all vendored encoding/*.any.js
node test/wpt/run.ts textdecoder-fatal # filter by filename substring
node test/wpt/run.ts "" --strict       # exit non-zero on any failure
```

Many assertions fail on purpose — they document real gaps between iconv-lite and
the WHATWG Encoding Standard, e.g.:

| Test | Why it fails |
| --- | --- |
| `textdecoder-labels` | labels for unsupported encodings such as `iso-2022-jp` and `x-user-defined` are unrecognized |
| `textdecoder-mistakes` | unsupported encodings, non-Windows mapping differences and legacy multibyte error handling |

`api-invalid-label` passes, as does the `textdecoder-mistakes` check for invalid
non-ASCII labels. The shim lowercases only ASCII letters so it does not hide
invalid input from iconv-lite. Numeric code pages and lenient ASCII separator
matching remain iconv-lite extensions beyond WHATWG's label table; passing these
tests does not imply identical label acceptance to the native `TextDecoder` API.

`single-byte-decoder` passes all 168 TextDecoder label cases, including Windows,
KOI8-U and Macintosh. CI runs this file in strict mode. The shared Windows and
KOI8/Macintosh suites also check every byte (including `0xFF`, omitted upstream),
encoding, fatal errors, label spelling, codec caching and incremental decoding.

## Layout

- [`shim.ts`](./shim.ts) — iconv-lite-backed `TextDecoder` / `TextEncoder`.
- [`run.ts`](./run.ts) — entry point. Runs `.any.js` API tests via wpt-runner
  (jsdom) and mapping tests with query variants via the vm runner.
- [`run-window.ts`](./run-window.ts) — a small `vm`-based runner (following the
  approach Node.js's `WPTRunner` uses) for tests that ship multiple
  `// META: variant=` blocks. It pins `location.search` to the TextDecoder
  variant so the mapping assertions run against iconv-lite without a browser.
- [`decode-compare.ts`](./decode-compare.ts) — for the legacy multi-byte encodings
  with no upstream TextDecoder test (shift_jis / euc-jp / euc-kr / big5), generates
  the canonical bytes for every assigned pointer from the WHATWG index tables and
  for the 1,880 Shift_JIS EUDC mappings defined by the decoder algorithm, then
  asserts `new TextDecoder(enc).decode(bytes)` against the shim. This is how
  TextDecoder polyfills are compared in practice. (gbk/gb18030 use upstream tests.)
- [`report.ts`](./report.ts) — combines all runners into a Markdown report.
- [`update.ts`](./update.ts) — refreshes `upstream/` from a sparse checkout of
  web-platform-tests. Edit its `FILES` list to add/remove coverage.
- [`gen-indexes.ts`](./gen-indexes.ts) — refreshes `data/whatwg-multibyte-indexes.json`
  (jis0208/jis0212/big5/euc-kr) and `data/whatwg-windows-indexes.json`
  (Windows-874 and Windows-1250–1258) from `encoding.spec.whatwg.org/indexes.json`.
  It also refreshes `data/whatwg-koi8-mac-indexes.json` for KOI8-U, Macintosh and
  x-mac-cyrillic, used by [`../koi8-mac.test.ts`](../koi8-mac.test.ts).
  The Windows indexes also drive [`../windows-sbcs.test.ts`](../windows-sbcs.test.ts)
  in both Node backends and Vitest Browser Mode: all 256 bytes, both decoding error
  modes, every BMP scalar for encoding, aliases and incremental decoding.
- [`upstream/`](./upstream) — **unmodified** vendored WPT files (BSD-3-Clause / W3C
  licensed), curated to the TextDecoder/TextEncoder behaviour relevant to
  iconv-lite. Source commit recorded in [`UPSTREAM_COMMIT`](./UPSTREAM_COMMIT).

## Not yet covered (future work)

- The **non-TextDecoder variants** (`?XMLHttpRequest`, `?document`)
  and the upstream **legacy multi-byte iframe tests** (`legacy-mb-*/*.html`) decode
  in the browser/XHR client, not via `TextDecoder`, so they can't exercise iconv-lite
  through the shim (a `wpt serve` browser run would measure the browser instead).
  Single-byte and all six multi-byte mappings are covered via `single-byte-decoder`
  and `decode-compare.ts`.
- `{ fatal: true }` for legacy multibyte encodings — these decoders still replace
  invalid input; fatal decoding is supported for UTF-8, UTF-16, UTF-32 and
  table-based single-byte encodings.

```sh
node test/wpt/update.ts   # refresh the vendored tests
```

`.github/workflows/wpt-update.yml` runs the update on a schedule and opens a PR
when the vendored files drift from upstream.
