# Performance

`npm run test:performance` runs Vitest benchmarks, comparing
iconv-lite with its published npm release, native iconv, native TextDecoder,
`@exodus/bytes` and `iconv-nano`.
Each encoding, size and operation has one comparison table with
`iconv-lite (node)`, `iconv-lite (web)`, `iconv-lite (npm)` and each supported competitor.
Cases include small and large inputs, six DBCS families, ASCII through GBK, and
Big5/GB18030 decoding one byte per chunk.
`x-user-defined` cases mix ASCII controls and private-use characters.
GB18030 cases also cover four-byte BMP and supplementary characters, unassigned
pointers and pointers beyond the Unicode limit.

Use the latest Node.js LTS and the current Vitest from `package.json` for
benchmarks. The Vitest 3 override in CI is only for the compatibility test jobs.
The compared versions of `iconv-lite-npm`, `@exodus/bytes` and `iconv-nano` are pinned in
`devDependencies` and printed alongside the iconv-lite version and checkout path.

`iconv-lite-npm` is an npm alias for the latest stable release at the time it was
added (`0.7.3`, from the `latest` tag). It stays separate from the local package,
so the same command compares a PR or master with that published version. Update
the pinned baseline deliberately with:

```sh
npm install --save-dev --save-exact iconv-lite-npm@npm:iconv-lite@latest
```

To run both backends against an earlier checkout:

```sh
ICONV_LITE_BENCH_ROOT=/path/to/baseline npm run test:performance
```

To validate every comparison without collecting timings:

```sh
npm run test:performance:check
```

Use Vitest's filters to select a case:

```sh
npm run test:performance -- -t 'gb18030/small/decode'
```

Run both versions on the same machine. The Web backend runs inside Node; these
commands do not launch a browser. Code runs as native ESM without Vite transforms.
Each measurement uses 100 ms of warmup and at least 500 ms of sampling.

## Comparable operations

Every implementation receives the same strings and encoded bytes for each case.
Decode fixtures are prepared once with iconv-lite before timing. The Node backend,
published iconv-lite and native iconv receive Buffer inputs; the Web backend and
other competitors receive Uint8Array inputs. Copies are prepared outside the timed call.
The backends have separate instances and codec caches; competitors run once per case.
The small and large sizes retain the existing repeat counts of 1 and 100.

Before registering a measurement, the script checks that encoding produces the
same bytes as iconv-lite and decoding recovers the original string. Invalid
GB18030 cases must produce one replacement character per four-byte sequence.
Validation happens outside the timed operation. Unsupported competitor operations,
exceptions and differing output are reported as skips; iconv-lite failures fail
the run. Byte differences can also reflect valid alternative encodings; this is a
comparison against these fixtures, not a full conformance test.

`@exodus/bytes` uses its public UTF-8/UTF-16 functions and single-byte/multibyte
codec factories. Factories are initialized before timing; streaming decoders
are created fresh for every byte-chunk operation. Its legacy encoders only
offer fatal mode, so inputs they cannot represent are reported as skips.
UTF-7 and UTF-32 are not supported by these APIs.

`iconv-nano` uses its public codec `encode` and `decode` functions. Its UTF-32
encoder receives `addBOM: true` to match iconv-lite's default. It has no UTF-7
codec or public incremental decoder API; the byte-chunk cases are skipped for
this implementation.

`iconv-lite (npm)` uses the published package's public `encode`, `decode` and
`getDecoder` APIs, including a fresh decoder for each byte-chunk operation.
Its unsupported encodings and output differences are reported as skips, just
like the other competitors; the local Node and Web backends must still pass.

Aliases map `big5hkscs` to `big5`, `eucjp` to `euc-jp` and `cp949` to `euc-kr` for
the new implementations and native TextDecoder. The existing native iconv and
TextDecoder comparisons still include converter construction in each timed
call. Library module initialization and fixture preparation are not measured.
