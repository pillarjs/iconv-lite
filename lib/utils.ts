export function canonicalizeEncoding (encoding: string | number) {
  // WHATWG: trim only ASCII whitespace and match ASCII letters case-insensitively.
  encoding = "" + encoding
  let start = 0
  let end = encoding.length
  while (start < end && isAsciiWhitespace(encoding.charCodeAt(start))) start++
  while (end > start && isAsciiWhitespace(encoding.charCodeAt(end - 1))) end--
  const label = encoding.slice(start, end)
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i)
    // Preserve invalid characters so lookup fails. Check before lowercasing:
    // Unicode case folding can turn non-ASCII characters (e.g. U+212A) into ASCII.
    if (code <= 0x08 || code === 0x0b || (code >= 0x0e && code <= 0x1f) || code >= 0x7f) {
      return label
    }
  }
  // Retain iconv-lite's lenient ASCII separator and appended-year normalization.
  return label.toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "")
}

function isAsciiWhitespace (code: number) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d
}
