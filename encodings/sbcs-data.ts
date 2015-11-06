// Manually added data to be used by sbcs codec in addition to generated one.

export default {
  // https://encoding.spec.whatwg.org/#x-user-defined
  xuserdefined: {
    type: "_sbcs",
    chars: Array.from({ length: 128 }, (_, i) => String.fromCharCode(0xF780 + i)).join("")
  },

  // Not supported by iconv, not sure why.
  10029: "maccenteuro",
  maccenteuro: {
    type: "_sbcs",
    chars: "ÄĀāÉĄÖÜáąČäčĆćéŹźĎíďĒēĖóėôöõúĚěü†°Ę£§•¶ß®©™ę¨≠ģĮįĪ≤≥īĶ∂∑łĻļĽľĹĺŅņŃ¬√ńŇ∆«»… ňŐÕőŌ–—“”‘’÷◊ōŔŕŘ‹›řŖŗŠ‚„šŚśÁŤťÍŽžŪÓÔūŮÚůŰűŲųÝýķŻŁżĢˇ"
  },

  808: "cp808",
  ibm808: "cp808",
  cp808: {
    type: "_sbcs",
    chars: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёЄєЇїЎў°∙·√№€■ "
  },

  mik: {
    type: "_sbcs",
    chars: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя└┴┬├─┼╣║╚╔╩╦╠═╬┐░▒▓│┤№§╗╝┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },

  cp720: {
    type: "_sbcs",
    chars: "\x80\x81éâ\x84à\x86çêëèïî\x8d\x8e\x8f\x90\u0651\u0652ô¤ـûùءآأؤ£إئابةتثجحخدذرزسشص«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀ضطظعغفµقكلمنهوىي≡\u064b\u064c\u064d\u064e\u064f\u0650≈°∙·√ⁿ²■\u00a0"
  },

  "037": "ebcdic037",
  ebcdic37: "ebcdic037",
  ebcdic037: {
    type: "_sbcs",
    chars: "\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A\u0020\u00A0\u00E2\u00E4\u00E0\u00E1\u00E3\u00E5\u00E7\u00F1\u00A2\u002E\u003C\u0028\u002B\u007C\u0026\u00E9\u00EA\u00EB\u00E8\u00ED\u00EE\u00EF\u00EC\u00DF\u0021\u0024\u002A\u0029\u003B\u00AC\u002D\u002F\u00C2\u00C4\u00C0\u00C1\u00C3\u00C5\u00C7\u00D1\u00A6\u002C\u0025\u005F\u003E\u003F\u00F8\u00C9\u00CA\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u0060\u003A\u0023\u0040\u0027\u003D\u0022\u00D8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00AB\u00BB\u00F0\u00FD\u00FE\u00B1\u00B0\u006A\u006B\u006C\u006D\u006E\u006F\u0070\u0071\u0072\u00AA\u00BA\u00E6\u00B8\u00C6\u00A4\u00B5\u007E\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007A\u00A1\u00BF\u00D0\u00DD\u00DE\u00AE\u005E\u00A3\u00A5\u00B7\u00A9\u00A7\u00B6\u00BC\u00BD\u00BE\u005B\u005D\u00AF\u00A8\u00B4\u00D7\u007B\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00AD\u00F4\u00F6\u00F2\u00F3\u00F5\u007D\u004A\u004B\u004C\u004D\u004E\u004F\u0050\u0051\u0052\u00B9\u00FB\u00FC\u00F9\u00FA\u00FF\u005C\u00F7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005A\u00B2\u00D4\u00D6\u00D2\u00D3\u00D5\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00B3\u00DB\u00DC\u00D9\u00DA\u009F"
  },

  1140: "ebcdic1140",
  ebcdic1140: {
    type: "_sbcs",
    chars: "\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A\u0020\u00A0\u00E2\u00E4\u00E0\u00E1\u00E3\u00E5\u00E7\u00F1\u00A2\u002E\u003C\u0028\u002B\u007C\u0026\u00E9\u00EA\u00EB\u00E8\u00ED\u00EE\u00EF\u00EC\u00DF\u0021\u0024\u002A\u0029\u003B\u00AC\u002D\u002F\u00C2\u00C4\u00C0\u00C1\u00C3\u00C5\u00C7\u00D1\u00A6\u002C\u0025\u005F\u003E\u003F\u00F8\u00C9\u00CA\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u0060\u003A\u0023\u0040\u0027\u003D\u0022\u00D8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00AB\u00BB\u00F0\u00FD\u00FE\u00B1\u00B0\u006A\u006B\u006C\u006D\u006E\u006F\u0070\u0071\u0072\u00AA\u00BA\u00E6\u00B8\u00C6\u20AC\u00B5\u007E\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007A\u00A1\u00BF\u00D0\u00DD\u00DE\u00AE\u005E\u00A3\u00A5\u00B7\u00A9\u00A7\u00B6\u00BC\u00BD\u00BE\u005B\u005D\u00AF\u00A8\u00B4\u00D7\u007B\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00AD\u00F4\u00F6\u00F2\u00F3\u00F5\u007D\u004A\u004B\u004C\u004D\u004E\u004F\u0050\u0051\u0052\u00B9\u00FB\u00FC\u00F9\u00FA\u00FF\u005C\u00F7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005A\u00B2\u00D4\u00D6\u00D2\u00D3\u00D5\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00B3\u00DB\u00DC\u00D9\u00DA\u009F"
  },

  500: "ebcdic500",
  cp500: "ebcdic500",
  ebcdic500: {
    type: "_sbcs",
    chars: "\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A\u0020\u00A0\u00E2\u00E4\u00E0\u00E1\u00E3\u00E5\u00E7\u00F1\u005B\u002E\u003C\u0028\u002B\u0021\u0026\u00E9\u00EA\u00EB\u00E8\u00ED\u00EE\u00EF\u00EC\u00DF\u005D\u0024\u002A\u0029\u003B\u005E\u002D\u002F\u00C2\u00C4\u00C0\u00C1\u00C3\u00C5\u00C7\u00D1\u00A6\u002C\u0025\u005F\u003E\u003F\u00F8\u00C9\u00CA\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u0060\u003A\u0023\u0040\u0027\u003D\u0022\u00D8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00AB\u00BB\u00F0\u00FD\u00FE\u00B1\u00B0\u006A\u006B\u006C\u006D\u006E\u006F\u0070\u0071\u0072\u00AA\u00BA\u00E6\u00B8\u00C6\u00A4\u00B5\u007E\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007A\u00A1\u00BF\u00D0\u00DD\u00DE\u00AE\u00A2\u00A3\u00A5\u00B7\u00A9\u00A7\u00B6\u00BC\u00BD\u00BE\u00AC\u007C\u00AF\u00A8\u00B4\u00D7\u007B\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00AD\u00F4\u00F6\u00F2\u00F3\u00F5\u007D\u004A\u004B\u004C\u004D\u004E\u004F\u0050\u0051\u0052\u00B9\u00FB\u00FC\u00F9\u00FA\u00FF\u005C\u00F7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005A\u00B2\u00D4\u00D6\u00D2\u00D3\u00D5\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00B3\u00DB\u00DC\u00D9\u00DA\u009F"
  },

  1148: "ebcdic1148",
  cp1148: "ebcdic1148",
  ebcdic1148: {
    type: "_sbcs",
    chars: "\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A\u0020\u00A0\u00E2\u00E4\u00E0\u00E1\u00E3\u00E5\u00E7\u00F1\u005B\u002E\u003C\u0028\u002B\u0021\u0026\u00E9\u00EA\u00EB\u00E8\u00ED\u00EE\u00EF\u00EC\u00DF\u005D\u0024\u002A\u0029\u003B\u005E\u002D\u002F\u00C2\u00C4\u00C0\u00C1\u00C3\u00C5\u00C7\u00D1\u00A6\u002C\u0025\u005F\u003E\u003F\u00F8\u00C9\u00CA\u00CB\u00C8\u00CD\u00CE\u00CF\u00CC\u0060\u003A\u0023\u0040\u0027\u003D\u0022\u00D8\u0061\u0062\u0063\u0064\u0065\u0066\u0067\u0068\u0069\u00AB\u00BB\u00F0\u00FD\u00FE\u00B1\u00B0\u006A\u006B\u006C\u006D\u006E\u006F\u0070\u0071\u0072\u00AA\u00BA\u00E6\u00B8\u00C6\u20AC\u00B5\u007E\u0073\u0074\u0075\u0076\u0077\u0078\u0079\u007A\u00A1\u00BF\u00D0\u00DD\u00DE\u00AE\u00A2\u00A3\u00A5\u00B7\u00A9\u00A7\u00B6\u00BC\u00BD\u00BE\u00AC\u007C\u00AF\u00A8\u00B4\u00D7\u007B\u0041\u0042\u0043\u0044\u0045\u0046\u0047\u0048\u0049\u00AD\u00F4\u00F6\u00F2\u00F3\u00F5\u007D\u004A\u004B\u004C\u004D\u004E\u004F\u0050\u0051\u0052\u00B9\u00FB\u00FC\u00F9\u00FA\u00FF\u005C\u00F7\u0053\u0054\u0055\u0056\u0057\u0058\u0059\u005A\u00B2\u00D4\u00D6\u00D2\u00D3\u00D5\u0030\u0031\u0032\u0033\u0034\u0035\u0036\u0037\u0038\u0039\u00B3\u00DB\u00DC\u00D9\u00DA\u009F"
  },

  // Aliases of generated encodings.
  ascii8bit: "ascii",
  usascii: "ascii",
  ansix34: "ascii",
  ansix341968: "ascii",
  ansix341986: "ascii",
  csascii: "ascii",
  cp367: "ascii",
  ibm367: "ascii",
  isoir6: "ascii",
  iso646us: "ascii",
  iso646irv: "ascii",
  us: "ascii",

  latin1: "iso88591",
  latin2: "iso88592",
  latin3: "iso88593",
  latin4: "iso88594",
  latin5: "iso88599",
  latin6: "iso885910",
  latin7: "iso885913",
  latin8: "iso885914",
  latin9: "iso885915",
  latin10: "iso885916",

  csisolatin1: "iso88591",
  csisolatin2: "iso88592",
  csisolatin3: "iso88593",
  csisolatin4: "iso88594",
  csisolatincyrillic: "iso88595",
  csisolatinarabic: "iso88596",
  csisolatingreek: "iso88597",
  csisolatinhebrew: "iso88598",
  csisolatin5: "iso88599",
  csisolatin6: "iso885910",

  l1: "iso88591",
  l2: "iso88592",
  l3: "iso88593",
  l4: "iso88594",
  l5: "iso88599",
  l6: "iso885910",
  l7: "iso885913",
  l8: "iso885914",
  l9: "iso885915",
  l10: "iso885916",

  isoir14: "iso646jp",
  isoir57: "iso646cn",
  isoir100: "iso88591",
  isoir101: "iso88592",
  isoir109: "iso88593",
  isoir110: "iso88594",
  isoir144: "iso88595",
  isoir127: "iso88596",
  isoir126: "iso88597",
  isoir138: "iso88598",
  isoir148: "iso88599",
  isoir157: "iso885910",
  isoir166: "tis620",
  isoir179: "iso885913",
  isoir199: "iso885914",
  isoir203: "iso885915",
  isoir226: "iso885916",

  cp819: "iso88591",
  ibm819: "iso88591",

  cyrillic: "iso88595",

  arabic: "iso88596",
  arabic8: "iso88596",
  ecma114: "iso88596",
  asmo708: "iso88596",

  greek: "iso88597",
  greek8: "iso88597",
  ecma118: "iso88597",
  elot928: "iso88597",

  hebrew: "iso88598",
  hebrew8: "iso88598",

  turkish: "iso88599",
  turkish8: "iso88599",

  thai: "iso885911",
  thai8: "iso885911",

  celtic: "iso885914",
  celtic8: "iso885914",
  isoceltic: "iso885914",

  tis6200: "tis620",
  tis62025291: "tis620",
  tis62025330: "tis620",

  10000: "macroman",
  10006: "macgreek",
  10007: "maccyrillic",
  10079: "maciceland",
  10081: "macturkish",

  cspc8codepage437: "cp437",
  cspc775baltic: "cp775",
  cspc850multilingual: "cp850",
  cspcp852: "cp852",
  cspc862latinhebrew: "cp862",
  cpgr: "cp869",

  msee: "cp1250",
  mscyrl: "cp1251",
  msansi: "cp1252",
  msgreek: "cp1253",
  msturk: "cp1254",
  mshebr: "cp1255",
  msarab: "cp1256",
  winbaltrim: "cp1257",

  cp20866: "koi8r",
  20866: "koi8r",
  ibm878: "koi8r",
  cskoi8r: "koi8r",

  cp21866: "koi8u",
  21866: "koi8u",
  ibm1168: "koi8u",

  strk10482002: "rk1048",

  tcvn5712: "tcvn",
  tcvn57121: "tcvn",

  gb198880: "iso646cn",
  cn: "iso646cn",

  csiso14jisc6220ro: "iso646jp",
  jisc62201969ro: "iso646jp",
  jp: "iso646jp",

  cshproman8: "hproman8",
  r8: "hproman8",
  roman8: "hproman8",
  xroman8: "hproman8",
  ibm1051: "hproman8",

  mac: "macintosh",
  csmacintosh: "macintosh"
}
