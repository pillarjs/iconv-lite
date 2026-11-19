import type { DecodeOptions } from "./iconv.js"

export function getDefaultCharUnicode (options: DecodeOptions | undefined) {
  const replacement = options?.defaultCharUnicode
  if (replacement === undefined) return "\uFFFD"
  if (typeof replacement !== "string") throw new TypeError("defaultCharUnicode must be a string")
  return replacement
}

// Replace only recorded errors, preserving U+FFFD decoded from valid input.
// Positions refer to UTF-16 code units before inserting replacement text.
export function replaceDecodeErrors (text: string, errors: number[] | undefined, replacement: string) {
  if (!errors?.length) return text
  const parts = []
  let start = 0
  for (const index of errors) {
    parts.push(text.slice(start, index), replacement)
    start = index + 1
  }
  parts.push(text.slice(start))
  return parts.join("")
}

// Reject mixed blocks early; the byte view may have a nonzero offset.
export function asciiPrefixLength (bytes: Uint8Array) {
  let i = 0
  for (; i + 7 < bytes.length; i += 8) {
    if ((bytes[i] | bytes[i + 1] | bytes[i + 2] | bytes[i + 3] |
      bytes[i + 4] | bytes[i + 5] | bytes[i + 6] | bytes[i + 7]) & 0x80) break
  }
  for (; i < bytes.length; i++) if (bytes[i] & 0x80) return i
  return bytes.length
}
