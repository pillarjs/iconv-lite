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
