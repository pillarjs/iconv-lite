import sbcsData from "./sbcs-data-generated.js"

// Numeric Windows code pages are distinct from WHATWG's web labels.
// https://learn.microsoft.com/windows/win32/intl/code-page-identifiers
export default {
  1200: "utf16le",
  cp1200: "utf16le",
  1201: "utf16be",
  cp1201: "utf16be",
  12000: "utf32le",
  cp12000: "utf32le",
  12001: "utf32be",
  cp12001: "utf32be",
  65000: "utf7",
  cp65000: "utf7",
  65001: "utf8",
  cp65001: "utf8",

  // Keep the original tables, rather than following ASCII/ISO web aliases to
  // Windows-1252/1254/874. 28601 is an existing iconv-lite ISO-8859-11 alias.
  20127: "cp20127",
  cp20127: sbcsData.ascii,
  cp367: "cp20127",
  ibm367: "cp20127",
  28591: "cp28591",
  cp28591: sbcsData.iso88591,
  28599: "cp28599",
  cp28599: sbcsData.iso88599,
  28601: "cp28601",
  cp28601: sbcsData.iso885911
}
