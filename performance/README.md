# Performance

`npm run test:performance` compares iconv-lite with native iconv and TextDecoder.

To compare DBCS changes with an earlier checkout:

```sh
git worktree add --detach /tmp/iconv-dbcs-before <baseline-commit>
node performance/compare-dbcs.js /tmp/iconv-dbcs-before node
node performance/compare-dbcs.js /tmp/iconv-dbcs-before web
```

The DBCS comparison covers six encoding families, ASCII input, small strings and
strings repeated 100 times, plus decoding one byte per chunk. It warms each case,
alternates before/after ordering and reports the median of seven rounds. Positive
percentages mean more operations per second. Small differences can be measurement
noise; compare repeated runs on the same machine.

Use `--json` after the backend argument to save raw samples. `BENCH_ROUNDS` and
`BENCH_MS` override the round count and duration. The `web` argument selects the
Web backend **inside Node**; it does not launch a browser. For browser measurements,
`dbcs.js` exports the same `compare(before, after, options)` workloads and timer
without Node dependencies, so both checkouts can be bundled into a browser harness.
