# Performance

`npm run test:performance` runs `performance/index.js` with `bench-node`, comparing
iconv-lite with native iconv, native TextDecoder, `@exodus/bytes` and `iconv-nano`.
It runs the Node backend first, then the Web backend, with separate reports.
Both include small and large inputs, six DBCS families, ASCII through GBK, and
Big5/GB18030 decoding one byte per chunk.
GB18030 cases also cover four-byte BMP and supplementary characters, unassigned
pointers and pointers beyond the Unicode limit.

Use Node.js 24 or newer for the benchmark dependencies. The compared versions of
`@exodus/bytes` and `iconv-nano` are pinned in `devDependencies` and printed in the
report alongside the iconv-lite version and checkout path.

To run both backends against an earlier checkout:

```sh
npm run test:performance -- /path/to/baseline
```

To validate every comparison without collecting timings:

```sh
npm run test:performance -- --check
```

Run both versions on the same machine. The Web backend runs inside Node; these
commands do not launch a browser.

## Comparable operations

Every implementation receives the same strings and encoded bytes for each case.
Decode fixtures are prepared once with iconv-lite before timing. Native iconv
receives a Buffer copy of the same bytes, also prepared outside the timed call.
The small and large sizes retain the existing repeat counts of 1 and 100.

Before registering a measurement, the script checks that encoding produces the
same bytes as iconv-lite and decoding recovers the original string. Invalid
GB18030 cases must produce one replacement character per four-byte sequence.
Validation happens outside the timed operation. Unsupported operations,
exceptions and differing output are reported as skips. Byte differences can
also reflect valid alternative encodings; this is a comparison against these
fixtures, not a full conformance test.

`@exodus/bytes` uses its public UTF-8/UTF-16 functions and single-byte/multibyte
codec factories. Factories are initialized before timing; streaming decoders
are created fresh for every byte-chunk operation. Its legacy encoders only
offer fatal mode, so inputs they cannot represent are reported as skips.
UTF-7 and UTF-32 are not supported by these APIs.

`iconv-nano` uses its public codec `encode` and `decode` functions. Its UTF-32
encoder receives `addBOM: true` to match iconv-lite's default. It has no UTF-7
codec or public incremental decoder API; the byte-chunk cases are skipped for
this implementation.

Aliases map `big5hkscs` to `big5`, `eucjp` to `euc-jp` and `cp949` to `euc-kr` for
the new implementations and native TextDecoder. The existing native iconv and
TextDecoder comparisons still include converter construction in each timed
call. Library module initialization and fixture preparation are not measured.
