export function canonicalizeEncoding (encoding) {
  // WHATWG: trim only ASCII whitespace; labels with other control/separator chars are invalid.
  encoding = "" + encoding
  let start = 0
  let end = encoding.length
  while (start < end && isAsciiWhitespace(encoding.charCodeAt(start))) start++
  while (end > start && isAsciiWhitespace(encoding.charCodeAt(end - 1))) end--
  const label = encoding.slice(start, end).toLowerCase()
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i)
    // Reject chars that never appear in a valid label: C0 controls (except ASCII whitespace
    // tab/LF/FF/CR), DEL + C1 controls, NBSP, and the line/paragraph separators. Kept in the
    // result so the lookup misses. (ASCII whitespace and other punctuation are normalized below.)
    if (code <= 0x08 || code === 0x0b || (code >= 0x0e && code <= 0x1f) ||
        (code >= 0x7f && code <= 0xa0) || code === 0x2028 || code === 0x2029) {
      return label
    }
  }
  // Lenient normalization: strip an appended year and non-alphanumerics.
  return label.replace(/:\d{4}$|[^0-9a-z]/g, "")
}

function isAsciiWhitespace (code) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d
}
