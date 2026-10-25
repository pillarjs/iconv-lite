# Performance

`npm run test:performance` runs `performance/index.js` with `bench-node`, comparing
iconv-lite with native iconv and TextDecoder. It runs the Node backend first, then
the Web backend, with separate reports. Both include small and large inputs, six
DBCS families, ASCII through GBK, and Big5/GB18030 decoding one byte per chunk.

To run both backends against an earlier checkout:

```sh
npm run test:performance -- /path/to/baseline
```

Run both versions on the same machine. Streaming cases that produce incorrect
output are explicitly skipped. The Web backend runs inside Node; these commands
do not launch a browser.
