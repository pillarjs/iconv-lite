// Encoding-label aliases from the WHATWG Encoding Standard (https://encoding.spec.whatwg.org/).
// Keys are canonicalized labels (lowercase, separators stripped); values are existing iconv-lite
// encoding names. Labels whose target encoding iconv-lite does not implement (e.g. x-user-defined)
// are intentionally omitted.

export default {
  // These legacy labels use the Windows mappings on the web. This registry is
  // applied after the generated tables; explicit numeric code pages keep their
  // original tables in windows-codepages.js.
  ascii: "windows1252",
  iso88591: "windows1252",
  iso88599: "windows1254",
  iso885911: "windows874",
  tis620: "windows874",

  // windows-1250 .. windows-1258
  xcp1250: "windows1250",
  xcp1251: "windows1251",
  xcp1252: "windows1252",
  xcp1253: "windows1253",
  xcp1254: "windows1254",
  xcp1255: "windows1255",
  xcp1256: "windows1256",
  xcp1257: "windows1257",
  xcp1258: "windows1258",
  dos874: "windows874",

  // ISO-8859-* (the -e/-i and visual/logical variants decode identically to the base codec).
  csiso88596e: "iso88596",
  iso88596e: "iso88596",
  csiso88596i: "iso88596",
  iso88596i: "iso88596",
  csiso88598e: "iso88598",
  iso88598e: "iso88598",
  csiso88598i: "iso88598",
  iso88598i: "iso88598",
  visual: "iso88598",
  logical: "iso88598",
  csisolatin9: "iso885915",
  suneugreek: "iso88597",

  // KOI8-R
  koi: "koi8r",
  koi8: "koi8r",

  // WHATWG KOI8-U includes the Belarusian letters from KOI8-RU.
  koi8u: "koi8ru",

  // Mac
  xmacukrainian: "xmaccyrillic",
  xmacroman: "macintosh",

  // EUC-JP
  xeucjp: "eucjp",
  cseucpkdfmtjapanese: "eucjp",

  // UTF-8
  unicode20utf8: "utf8",
  xunicode20utf8: "utf8"
}
