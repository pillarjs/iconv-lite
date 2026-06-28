"use strict"

// Additional encoding-label aliases from the WHATWG Encoding Standard (https://encoding.spec.whatwg.org/).
// Keys are canonicalized labels (lowercase, separators stripped); values are existing iconv-lite
// encoding names. Labels whose target encoding iconv-lite does not implement (e.g. iso-2022-jp,
// x-user-defined) are intentionally omitted.

module.exports = {
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

  // Mac
  xmaccyrillic: "maccyrillic",
  xmacukrainian: "maccyrillic",
  xmacroman: "macintosh",

  // EUC-JP
  xeucjp: "eucjp",
  cseucpkdfmtjapanese: "eucjp",

  // UTF-8
  unicode20utf8: "utf8",
  xunicode20utf8: "utf8"
}
