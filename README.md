## iconv-lite: Pure JS character encoding conversion

[![NPM Version][npm-version-image]][npm-url]
[![NPM Downloads][npm-downloads-image]][npm-downloads-url]
[![License][license-image]][license-url]
[![NPM Install Size][npm-install-size-image]][npm-install-size-url]

* No need for native code compilation. Quick to install, works on Windows, Web, and in sandboxed environments.
* Used in popular projects like [Express.js (body_parser)](https://github.com/expressjs/body-parser), 
  [Grunt](http://gruntjs.com/), [Nodemailer](http://www.nodemailer.com/), [Yeoman](http://yeoman.io/) and others.
* Faster than [node-iconv](https://github.com/bnoordhuis/node-iconv) (see below for performance comparison).
* Intuitive encode/decode API, including Streaming support.
* Native ES modules for Node.js and browsers, with automatic backend selection in compatible bundlers.
* Typescript [type definition file](https://github.com/ashtuchkin/iconv-lite/blob/master/lib/index.d.ts) included.
* React Native is supported (need to install `stream` module to enable Streaming API).

## Usage

This package uses ES modules and requires Node.js 22 or later. CommonJS callers
can use `const { default: iconv } = await import('iconv-lite')` inside an async
function. Direct `require('iconv-lite')` is no longer a supported entry point.
Encoding and decoding remain synchronous once the module has loaded.

Use the default export to change settings such as `defaultCharUnicode`. Functions
are also available as named exports, for example `import { encode, decode } from
'iconv-lite'`.

The public package entry points are `iconv-lite`, `iconv-lite/web`, and
`iconv-lite/encodings/*.js`.

### Basic API

```javascript
import iconv from 'iconv-lite';

// Convert from an encoded buffer to a js string.
const str = iconv.decode(Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]), 'win1251');

// Convert from a js string to an encoded buffer.
const buf = iconv.encode("Sample input string", 'win1251');

// Replace unsupported characters with text in the target encoding.
const replacedBuf = iconv.encode("Hola 🙂", 'latin1', {
    invalidCharHandler: () => ":)"
});
// Encodes "Hola :)"

// Customize handling in case some characters are not representable in the target encoding
try {
    iconv.encode("Hello 世界", 'latin1', {
        invalidCharHandler: function(char, index) {
            throw new Error("Cannot encode character " + char + " at index " + index);
        }
    });
} catch (error) {
    console.warn(error.message);
}

// Stop after first unsupported character (useful to avoid repeated warnings)
const checkedBuf = iconv.encode("Hello 世界", 'latin1', {
    invalidCharHandler: function(char, index) {
        console.warn("Unsupported character " + char + " at index " + index);
        return true;
    }
});
// checkedBuf === null

// Check if encoding is supported
iconv.encodingExists("us-ascii")
```

### Handling unrepresentable characters

`invalidCharHandler(char, index)` runs when encoding would replace or truncate an
input character. Its result controls what happens:

| Handler result | Behavior |
| --- | --- |
| A string | Encode that replacement text; `""` omits the character. |
| `false` or `undefined` | Keep the encoding's default replacement bytes. |
| `true` | Discard the current write and return `null`. |
| Throw an error | Propagate the error to the caller or encoding stream. |

Replacement text must be representable in the target encoding. An invalid
replacement or any other return value throws a `TypeError`, without calling the
handler recursively. Replacements use the same encoding context as surrounding
text, including multicharacter Big5 mappings. Indices refer to the original input,
not the replacement text.

The handler covers unmappable characters in single-byte and multibyte encodings,
unpaired surrogates in UTF-8 and UTF-32, and characters above U+00FF in `binary`.
UTF-16, CESU-8, and UTF-7 preserve UTF-16 code units, including unpaired surrogates,
so they do not invoke the handler. `hex` and `base64` reject this option because
they convert byte representations rather than text. Omitting the handler keeps
the existing encoding behavior.

### Browsers

Bundlers select the Web backend automatically. You can also select it explicitly:

```javascript
import iconv from 'iconv-lite/web';
const bytes = iconv.encode('Hello', 'utf8'); // Uint8Array, without a Buffer polyfill.
```

For native browser modules, import `lib/index-web.js` from a served copy of the
package. `encodeWebStream()` and `decodeWebStream()` use the native
`TransformStream` automatically. `iconv.supportsWebStreams` reports whether it is
available; older environments can supply a global `TransformStream` polyfill.
The Web entry point exposes only Web Streams. `encodeStream()`, `decodeStream()`,
and `supportsStreams` belong to the Node entry point.

DBCS table modules are imported with the library, but their arrays and codec
lookup tables are initialized and cached only when the corresponding encoding is used.

### Streaming API

In Node.js, `encodeStream()` and `decodeStream()` return Node streams.
`encodeWebStream()` and `decodeWebStream()` return Web Streams and are available
in both Node.js and browsers. Both APIs are initialized automatically.

```javascript
// Decode stream (from binary data stream to js strings)
http.createServer(function(req, res) {
    var converterStream = iconv.decodeStream('win1251');
    req.pipe(converterStream);

    converterStream.on('data', function(str) {
        console.log(str); // Do something with decoded strings, chunk-by-chunk.
    });
});

// Convert encoding streaming example
fs.createReadStream('file-in-win1251.txt')
    .pipe(iconv.decodeStream('win1251'))
    .pipe(iconv.encodeStream('ucs2'))
    .pipe(fs.createWriteStream('file-in-ucs2.txt'));

// Sugar: Node encode/decode streams have .collect(cb) to accumulate data.
http.createServer(function(req, res) {
    req.pipe(iconv.decodeStream('win1251')).collect(function(err, body) {
        assert(typeof body == 'string');
        console.log(body); // full request body string
    });
});
```

Web Streams work with `fetch()`, `pipeThrough()`, and `pipeTo()`:

```javascript
import iconv from 'iconv-lite/web'; // Use 'iconv-lite' in Node.js.

const response = await fetch('/file-in-win1251.txt');
const utf8Bytes = response.body
    .pipeThrough(iconv.decodeWebStream('win1251'))
    .pipeThrough(iconv.encodeWebStream('utf8'));

// Consume the stream, or pipe it to a WritableStream destination.
const text = await new Response(utf8Bytes).text();
```

`encodeWebStream(encoding, options)` accepts strings and produces encoded bytes
(`Buffer` with the Node backend, `Uint8Array` with the Web backend).
`decodeWebStream(encoding, options)` accepts `Uint8Array` or `Buffer` chunks and
produces strings. Both accept the same codec options as `encode()` and `decode()`.
Closing the writable side flushes buffered codec output; errors and cancellation
propagate through the native stream pipeline, with native backpressure.
Use a reader or `pipeTo()` to consume output while writing input. Web Streams
expose `.readable` and `.writable`; `.collect()` belongs to the Node stream API.
As with Node streams, `hex` input is parsed per chunk, so keep each pair of hex
digits in the same chunk.

Returning `true` from `invalidCharHandler` discards the entire
current `write()`, including its valid prefix, and returns `null`. Later writes
can still succeed. In `encodeStream()` and `encodeWebStream()`, this drops the
current chunk without ending the stream; throw from the handler to signal a
stream error instead.

With a handler, SBCS, DBCS, UTF-8, UTF-32, and `binary` encoders buffer a trailing
high surrogate until the next nonempty write or `end()`, so a split surrogate
pair is processed as one character. The
callback index counts Unicode code points within the input of the write where
the character starts. A buffered character retains its index from that write.
When using `getEncoder()`, consume the bytes returned by `end()` too; it can
return `null` if the handler cancels the buffered character. A cancellation
during either `write()` or `end()` makes the one-shot `encode()` return `null`.

## Supported encodings

 *  All node.js native encodings: utf8, ucs2 / utf16-le, ascii, binary, base64, hex.
 *  Additional unicode encodings: utf16, utf16-be, utf-7, utf-7-imap, utf32, utf32-le, and utf32-be.
 *  All widespread singlebyte encodings: Windows 125x family, ISO-8859 family, 
    IBM/DOS codepages, Macintosh family, KOI8 family, all others supported by iconv library. 
    Aliases like 'latin1', 'us-ascii' also supported.
 *  All widespread multibyte encodings: CP932, CP936, CP949, CP950, GB2312, GBK, GB18030, Big5, Shift_JIS, EUC-JP.

See [all supported encodings on wiki](https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings).

Most singlebyte encodings are generated automatically from [node-iconv](https://github.com/bnoordhuis/node-iconv). Thank you Ben Noordhuis and libiconv authors!

Multibyte encodings are generated from [Unicode.org mappings](http://www.unicode.org/Public/MAPPINGS/) and [WHATWG Encoding Standard mappings](http://encoding.spec.whatwg.org/). Thank you, respective authors!

## Encoding/decoding speed

Comparison with node-iconv module (1000x256kb, on MacBook Pro, Core i5/2.6 GHz, Node v0.12.0). 
Note: your results may vary, so please always check on your hardware.

    operation             iconv@2.1.4   iconv-lite@0.4.7
    ----------------------------------------------------------
    encode('win1251')     ~96 Mb/s      ~320 Mb/s
    decode('win1251')     ~95 Mb/s      ~246 Mb/s

## BOM handling

 * Decoding: BOM is stripped by default, unless overridden by passing `stripBOM: false` in options
   (f.ex. `iconv.decode(buf, enc, {stripBOM: false})`).
   A callback might also be given as a `stripBOM` parameter - it'll be called if BOM character was actually found.
 * If you want to detect UTF-8 BOM when decoding other encodings, use [node-autodetect-decoder-stream](https://github.com/danielgindi/node-autodetect-decoder-stream) module.
 * Encoding: No BOM added, unless overridden by `addBOM: true` option.

## UTF-16 Encodings

This library supports UTF-16LE, UTF-16BE and UTF-16 encodings. First two are straightforward, but UTF-16 is trying to be
smart about endianness in the following ways:
 * Decoding: uses BOM and 'spaces heuristic' to determine input endianness. Default is UTF-16LE, but can be 
   overridden with `defaultEncoding: 'utf-16be'` option. Strips BOM unless `stripBOM: false`.
 * Encoding: uses UTF-16LE and writes BOM by default. Use `addBOM: false` to override.

## UTF-32 Encodings

This library supports UTF-32LE, UTF-32BE and UTF-32 encodings. Like the UTF-16 encoding above, UTF-32 defaults to UTF-32LE, but uses BOM and 'spaces heuristics' to determine input endianness. 
 * The default of UTF-32LE can be overridden with the `defaultEncoding: 'utf-32be'` option. Strips BOM unless `stripBOM: false`.
 * Encoding: uses UTF-32LE and writes BOM by default. Use `addBOM: false` to override. (`defaultEncoding: 'utf-32be'` can also be used here to change encoding.)
 * Decoding is strict (per the Unicode Standard): a code unit that is a surrogate code point (U+D800–U+DFFF), is above U+10FFFF, or is a truncated trailing code unit is replaced with �. Pass `{ fatal: true }` to throw on such input instead.
 * Encoding replaces a lone (unpaired) surrogate in the input with � so the output is always valid UTF-32.

## UTF-7 Encodings

This library supports UTF-7 (RFC 2152) and UTF-7-IMAP / Modified UTF-7 (RFC 3501).
 * Encoding: for UTF-7, the optional "Set O" punctuation is left as direct ASCII (per RFC 2152), so output stays compact.
 * Decoding follows RFC 2152: ill-formed input — an incomplete code unit, non-zero Base64 padding bits, a shift-in
   not followed by Base64 or "-", or a non-ASCII byte outside a shifted run — is replaced with �. Lone surrogates
   pass through as their raw 16-bit code units.
 * The `fatal` decode option is not supported (RFC 2152 doesn't define it); decoding is always lenient (replacement with �).

UTF-7 is designed for short, 7-bit-safe strings (mail headers, IMAP mailbox names) and is best used that way.
It is not recommended for large or bulk text, where the native `utf8`/`utf16` encodings are faster.

## Other notes

When decoding, be sure to supply a Buffer to decode() method, otherwise [bad things usually happen](https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding).  
Untranslatable characters are set to � or ?. When encoding, `invalidCharHandler` can customize replacements, observe unsupported characters, cancel a write, or throw. Automatic transliteration is not supported.

Node versions 0.10.31 and 0.11.13 are buggy, don't use them (see [#65](https://github.com/ashtuchkin/iconv-lite/issues/65), [#77](https://github.com/ashtuchkin/iconv-lite/issues/77)).  

## Testing

```sh
git clone git@github.com:ashtuchkin/iconv-lite.git
cd iconv-lite
npm install
npm test
    
# To view performance:
npm run test:performance

# To view test coverage: 
npm run test:cov
open coverage/index.html
```

[npm-downloads-image]: https://badgen.net/npm/dm/iconv-lite
[npm-downloads-url]: https://npmcharts.com/compare/iconv-lite?minimal=true
[npm-url]: https://npmjs.org/package/iconv-lite
[npm-version-image]: https://badgen.net/npm/v/iconv-lite
[npm-install-size-image]: https://badgen.net/packagephobia/install/iconv-lite
[npm-install-size-url]: https://packagephobia.com/result?p=iconv-lite
[license-image]: https://img.shields.io/npm/l/iconv-lite.svg
[license-url]: https://github.com/ashtuchkin/iconv-lite/blob/HEAD/LICENSE
