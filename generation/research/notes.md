
### TODO:
 * Deprecate string input in decoding (with tests).

 * keep internal state in encoders/decoders
 * streaming suport

Later:
 * browser support through ArrayBuffer
   -> table support via utf-8 strings with ranges.



### Other projects
http://code.google.com/p/stringencoding/
http://encoding.spec.whatwg.org

### Browser alternatives of Buffer
http://www.khronos.org/registry/typedarray/specs/latest/
https://developer.mozilla.org/en-US/docs/JavaScript_typed_arrays
ArrayBuffer polyfill http://www.calormen.com/polyfill/ https://bitbucket.org/lindenlab/llsd/src/7d2646cd3f9b/js/typedarray.js


### Streaming hurdles
http://userguide.icu-project.org/conversion/converters

 * BOM in UTF-8/16
 * Surrogate chars
    UTF-16BE/16LE: Surrogate chars not streamable.
    CESU-8: Surrogate chars from UTF-8
 * Combining characters (see normalization.txt): both when encoding and decoding.


### General

Everything goes to native javascript UTF16 (with surrogate pairs) and from it.
We try to match what browsers do with encodings (as they have the most exposure).
We ignore all non-alphanumeric chars in encoding aliases.

Codec interface:
  encodings._codec = function(<codec options>) -> (cached) {
    <static codec data>
    encoder(options) -> (encoder obj) {
      <stream data>,
      write(str) -> buf,
      end() -> buf, (optional)
    }, 
    decoder(options) -> (decoder obj) {
      <stream data>,
      write(buf) -> str,
      end() -> str, (optional)
    }
  }


### Edge cases

 * Browser support (see https://github.com/inexorabletash/text-encoding)
   -> Slow conversion between strings and ArrayBuffers.
   -> AMD/Require.js to load tables? Currently its 221k / 135k compressed.
 * Codecs should be able to share tables.

 * BOM for UTF-8/16/32 to determine endianness.
 * Surrogate chars: can be in different chunks.
 * Combining characters in input -> different combining chars in output.
 * Callback to decide what to do with unconvertable chars.
 * Ambiguous encoding names (Shift_JIS?)
 * Save memory by clearing the cache / read tables?
 * Stateful encodings ftw
 * Set substitute characters when no mapping is found, in addition to defaults, f.ex.
   in ISO-8859-1 it's 0x1A, in Unicode its U+FFFD. Both for encoding and decoding.
   In stateful encodings should be encoded every time depending on states.
 * When no mapping is found and we have substitution char, then it would still be better to
   skip it when the char has Default_Ignorable_Code_Point Unicode property, f.ex. Soft Hyphen, Combining Grapheme Joiner etc.
   http://unicode.org/cldr/utility/list-unicodeset.jsp?a=%5B:DI:%5D

We don't deal with:
 * Bidirectional reordering
 * Arabic shaping

### Error conditions
 * No mapping for a char is available -> callback that can consume data, write data, throw exception
    * substitute character
    * skip
    * throw exception
    * escape - replace by f.ex. \u1234 or &#x1234;
 * Character sequence is incomplete (at the end of source data)
 * Illegal char sequence found

### General structure
iconv.encodings = {} all encodings, aliases, tables.

Encoding = 
 1. Name + aliases (small, manual+generated)
 2. Codec (med, manual)
 3. Data/Table (large, generated)

/encodings/index.js - loads all needed files to fill iconv.encodings.
/encodings/sbcs-codec.js, dbcs-codec.js - code to convert.
/encodings/sbcs-data.js, .. - aliases/tables to use.
/encodings/tables/cp950.js - generated DBCS table factory; initializes and caches its data on first use.

