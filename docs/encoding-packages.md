# External encoding API

Use `addEncoding(definitions, options)` to register codecs, create aliases, and
configure variants of existing encodings. The registered labels work with the
conversion and streaming APIs.

```js
import iconv from 'iconv-lite'; // Or 'iconv-lite/web'.
import definitions from './custom-encodings.js';

iconv.addEncoding(definitions);

const bytes = iconv.encode('Hello', 'custom-encoding');
const text = iconv.decode(bytes, 'custom-encoding');
const supported = iconv.encodingExists('custom-encoding');
```

Use the same labels with `getEncoder()`, `getDecoder()`, `encodeWebStream()`, and
`decodeWebStream()`. The Node entry point also supports `encodeStream()` and
`decodeStream()`.

Registration is synchronous. Import the definition object before calling
`addEncoding()`, using a static import or `await import()`.

## Defining a codec

An encoding package exports an object whose keys are encoding labels:

```js
// custom-encodings.js: a minimal codec that delegates to UTF-8.
class CustomCodec {
  createEncoder(options, iconv) {
    return iconv.getEncoder('utf8', options);
  }

  createDecoder(options, iconv) {
    return iconv.getDecoder('utf8', options);
  }
}

export default {
  'custom-encoding': CustomCodec,
  'custom-alias': 'custom-encoding'
};
```

Register on `iconv-lite` for Node, or `iconv-lite/web` for the Web backend. Browser
bundlers also select the Web implementation for the root import. Registration is
local to that instance and does not change another instance's definitions or cache.

## Definition map

Each own, enumerable string key maps to one of:

- A codec constructor: `new Codec(codecOptions, iconv)`.
- A string alias pointing to another registered label.
- An options object: `{ type: 'another-label', ...codecOptions }`.

Labels use the same normalization as `encode()` and `decode()`. A configured alias
has its own codec instance; its options override those inherited from its base.
`codecOptions.encodingName` is assigned by iconv-lite to identify the canonical
codec or configured variant. Built-in implementation keys such as `_sbcs` can be
referenced verbatim, but the factory interface below is preferable for an
independent encoding package.

Aliases can reference definitions in the same registration, in any order, or
previously registered definitions. Missing targets and cyclic aliases throw
before any definitions change. Import dependencies before registering a package
that depends on them.

Existing labels cannot be overwritten unless `{ replace: true }` is supplied.
For example, an application can create an alias and later change its target:

```js
iconv.addEncoding({ 'application-text': 'utf8' });
iconv.addEncoding({ 'application-text': 'utf16be' }, { replace: true });
```

Identical constructor references, aliases, and shallowly equal options are
idempotent and preserve the cache. Nested options and tables are shared by
reference; do not mutate them after registration. A changed registration clears
the instance's codec cache, including dependent aliases. Existing encoders,
decoders, and streams keep their original codec and can finish normally.

## Codec interface

A constructor receives `(codecOptions, iconv)` and may build shared lookup tables.
It runs lazily on first use, including an `encodingExists()` check. Its instance
provides:

| Member | Contract |
| --- | --- |
| `createEncoder(options, iconv)` | Return a fresh encoder for each call. |
| `createDecoder(options, iconv)` | Return a fresh decoder for each call. |
| `bomAware` | Optional boolean enabling iconv-lite's BOM wrappers. |

`options` can be `undefined`. The `iconv` argument exposes the owning instance's
backend, replacement characters, and conversion methods. Codec instances are
cached; conversion state belongs in each encoder or decoder, not in the codec.
Changing the backend clears cached codecs while retaining the definitions.

Constructor-based codecs remain supported: expose `encoder` and `decoder`
constructors instead. They receive `(options, codec, backend)`.

An encoder implements `write(string)` and `end()`. `write()` returns backend bytes;
`end()` returns final bytes or `undefined`. An encoder honoring `invalidCharHandler`
can return `null` to discard that write's output. The codec is responsible for
character validity, replacement behavior, and the handler contract; registration
does not add these behaviors automatically.

A decoder implements `write(Uint8Array)` and `end()`, returning strings, with
`undefined` also allowed from `end()`. An optional `decode(Uint8Array)` method is a
complete-input fast path: `iconv.decode()` uses it instead of `write()` and `end()`.

Both directions must preserve incomplete sequences across chunks, tolerate empty
chunks, and flush pending state at end. Copy any input bytes retained after
`write()` returns. Propagate errors by throwing; Node streams and Web Streams
forward them to their consumers. Cancellation does not call `end()`.

## Backend interface

Use `iconv.backend` to preserve the environment's output type: `Buffer` in Node and
`Uint8Array` on the Web. Avoid importing Node modules in a portable codec.

| Method | Contract |
| --- | --- |
| `allocBytes(length, fill?)` | Allocate writable bytes; provide `fill` when contents must be initialized. |
| `bytesToResult(bytes, length)` | Return the written prefix in the backend's public byte type. |
| `concatByteResults(chunks)` | Combine byte results into the backend's public type. |
| `copyBytes(bytes)` | Make an independent copy for retained input. |
| `allocRawChars(length)` | Allocate UTF-16 code-unit storage as a `Uint16Array`. |
| `rawCharsToResult(chars, length)` | Convert its written prefix to a string. For portable results, supply well-formed UTF-16. |
| `encodeString(text, encoding)` | Convert `utf8`, `binary`, `hex`, or `base64` text to backend bytes. |
| `decodeBytes(bytes, encoding)` | Convert bytes to a `binary`, `hex`, or `base64` string. |

Byte views can have nonzero offsets. Treat them as views, not as their entire
backing buffers. Do not assume output allocations are reusable after returning
them to callers.

## TypeScript

The root and Web entry points export `FactoryCodec`, `ConstructorCodec`, `Codec`,
`CodecConstructor`, `CodecOptions`, `EncodingDefinitions`, `AddEncodingOptions`,
and `Backend`. Conversion APIs accept external labels while retaining suggestions
for built-in names; `BuiltinEncoding` describes the built-in label union alone.

For a portable codec, parameterize byte output as `Bytes extends Uint8Array`,
implement `FactoryCodec<Bytes>`, and accept `WebIconv<Bytes>` in factory methods
(`Iconv<Bytes>` when importing the types from `iconv-lite/web`). Return results
through that instance's backend.
