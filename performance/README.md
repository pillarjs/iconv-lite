# Performance

`npm run test:performance` runs `performance/index.js` with `bench-node`, comparing
iconv-lite with native iconv and TextDecoder. It includes small and large inputs,
six DBCS families, ASCII through GBK, and Big5/GB18030 decoding one byte per chunk.

To run the same suite against an earlier checkout or with the Web backend:

```sh
npm run test:performance -- /path/to/baseline
npm run test:performance -- . web
```

Run both versions on the same machine. Streaming cases that produce incorrect
output are explicitly skipped. The Web backend runs inside Node; these commands
do not launch a browser.
