"use strict"

const assert = require("assert")
const utils = require("./helpers/utils")
const iconv = utils.requireIconv()

// UTF-7 output is pure ASCII; turn the backend bytes into a string for readable assertions
// (works with both the Node Buffer and the Web Uint8Array backends).
function enc (str, encoding) {
  return Array.prototype.map.call(iconv.encode(str, encoding), (b) => String.fromCharCode(b)).join("")
}

// ASCII string -> backend bytes (Buffer in Node, Uint8Array in the browser).
function buf (ascii) {
  const arr = []
  for (let i = 0; i < ascii.length; i++) { arr.push(ascii.charCodeAt(i)) }
  return utils.bytes(arr)
}

// These tests are mostly from https://github.com/kkaefer/utf7
// In case of ambiguity, we do the same as iconv. For example, we encode "optional direct" characters, but leave spaces and \n\r\t as-is.

describe("UTF-7 codec #node-web", function () {
  it("encodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(enc("A\u2262\u0391.", "utf-7"), "A+ImIDkQ-.")
    assert.equal(enc("\u65E5\u672C\u8A9E", "utf-7"), "+ZeVnLIqe-")

    // Set O characters ('!', '"', ...) are left direct, per RFC 2152.
    assert.equal(enc("Hi Mom -\u263A-!", "utf-7"), "Hi Mom -+Jjo--!")

    assert.equal(enc("Item 3 is \u00A31.", "utf-7"), "Item 3 is +AKM-1.")

    // Custom examples that contain more than one mode shift.
    assert.equal(enc("Jyv\u00E4skyl\u00E4", "utf-7"), "Jyv+AOQ-skyl+AOQ-")
    assert.equal(enc("'\u4F60\u597D' hei\u00DFt \"Hallo\"", "utf-7"), "'+T2BZfQ-' hei+AN8-t \"Hallo\"")

    // The plus sign is represented as +-.
    assert.equal(enc("Hot + Spicy + Fruity", "utf-7"), "Hot +- Spicy +- Fruity")

    // Slashes in the beginning.
    assert.equal(enc("\uFFFF\uEDCA\u9876\u5432\u1FED", "utf-7"), "+///typh2VDIf7Q-")

    // + sign around non-ASCII chars
    assert.equal(enc("\u00E4+\u00E4+\u00E4", "utf-7"), "+AOQAKwDkACsA5A-")
  })

  it("decodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.decode(buf("A+ImIDkQ-."), "utf-7"), "A\u2262\u0391.")
    assert.equal(iconv.decode(buf("A+ImIDkQ."), "utf-7"), "A\u2262\u0391.")

    assert.equal(iconv.decode(buf("+ZeVnLIqe-"), "utf-7"), "\u65E5\u672C\u8A9E")
    assert.equal(iconv.decode(buf("+ZeVnLIqe"), "utf-7"), "\u65E5\u672C\u8A9E")

    assert.equal(iconv.decode(buf("Hi Mom -+Jjo--!"), "utf-7"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(buf("Hi+ACA-Mom+ACA--+Jjo--+ACE-"), "utf-7"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(buf("Item 3 is +AKM-1."), "utf-7"), "Item 3 is \u00A31.")
    assert.equal(iconv.decode(buf("Item+ACA-3+ACA-is+ACAAow-1."), "utf-7"), "Item 3 is \u00A31.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.decode(buf("Jyv+AOQ-skyl+AOQ-"), "utf-7"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(buf("Jyv+AOQ-skyl+AOQ"), "utf-7"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(buf("'+T2BZfQ-' hei+AN8-t \"Hallo\""), "utf-7"), "'\u4F60\u597D' hei\u00DFt \"Hallo\"")
    assert.equal(iconv.decode(buf("'+T2BZfQ' hei+AN8-t \"Hallo\""), "utf-7"), "'\u4F60\u597D' hei\u00DFt \"Hallo\"")
    assert.equal(iconv.decode(buf("'+T2BZfQ-'+ACA-hei+AN8-t+ACAAIg-Hallo+ACI-"), "utf-7"), "'\u4F60\u597D' hei\u00DFt \"Hallo\"")
    assert.equal(iconv.decode(buf("'+T2BZfQ-'+ACA-hei+AN8-t+ACAAIg-Hallo+ACI"), "utf-7"), "'\u4F60\u597D' hei\u00DFt \"Hallo\"")

    // The plus sign is represented by +-.
    assert.equal(iconv.decode(buf("Hot +- Spicy +- Fruity"), "utf-7"), "Hot + Spicy + Fruity")
    assert.equal(iconv.decode(buf("Hot+ACAAKwAg-Spicy+ACAAKwAg-Fruity"), "utf-7"), "Hot + Spicy + Fruity")

    // Slashes in the beginning.
    assert.equal(iconv.decode(buf("+///typh2VDIf7Q-"), "utf-7"), "\uFFFF\uEDCA\u9876\u5432\u1FED")
    assert.equal(iconv.decode(buf("+///typh2VDIf7Q"), "utf-7"), "\uFFFF\uEDCA\u9876\u5432\u1FED")

    // + sign around non-ASCII chars
    assert.equal(iconv.decode(buf("+AOQ-+-+AOQ-+-+AOQ-"), "utf-7"), "\u00E4+\u00E4+\u00E4")
    assert.equal(iconv.decode(buf("+AOQAKwDkACsA5A-"), "utf-7"), "\u00E4+\u00E4+\u00E4")
    assert.equal(iconv.decode(buf("+AOQAKwDkACsA5A"), "utf-7"), "\u00E4+\u00E4+\u00E4")

    // Tests from https://gist.github.com/peteroupc/08c5ecc8131a76062ffe
    assert.equal(iconv.decode(buf("\r\n\t '!\"#'(),$-%@[]^&=<>;*_`{}./:|?"), "utf-7"), "\r\n\t '!\"#'(),$-%@[]^&=<>;*_`{}./:|?")
    assert.equal(iconv.decode(buf("x+--"), "utf-7"), "x+-")
    assert.equal(iconv.decode(buf("x+-y"), "utf-7"), "x+y")

    // UTF-16 code unit
    assert.equal(iconv.decode(buf("+DEE?"), "utf-7"), "\u0C41?")
    assert.equal(iconv.decode(buf("+DEE"), "utf-7"), "\u0C41")

    // Surrogate pair
    assert.equal(iconv.decode(buf("+2ADcAA?"), "utf-7"), "\uD800\uDC00?")
    assert.equal(iconv.decode(buf("+2ADcAA"), "utf-7"), "\uD800\uDC00")

    // Two UTF-16 code units
    assert.equal(iconv.decode(buf("+AMAA4A?"), "utf-7"), "\u00C0\u00E0?")
    assert.equal(iconv.decode(buf("+AMAA4A"), "utf-7"), "\u00C0\u00E0")
    assert.equal(iconv.decode(buf("+AMAA4A-Next"), "utf-7"), "\u00C0\u00E0Next")
    assert.equal(iconv.decode(buf("+AMAA4A!Next"), "utf-7"), "\u00C0\u00E0!Next")
  })

  it("replaces ill-formed sequences with U+FFFD (RFC 2152)", function () {
    // Incomplete code unit: a single Base64 char carries only 6 bits, not a full 16-bit unit.
    assert.equal(iconv.decode(buf("+D-"), "utf-7"), "\uFFFD")
    // Truncated Base64 at end of stream (no terminator), still an incomplete code unit.
    assert.equal(iconv.decode(buf("+DE"), "utf-7"), "\uFFFD")
    // A complete code unit followed by non-zero padding bits.
    assert.equal(iconv.decode(buf("+DEH-"), "utf-7"), "\u0C41\uFFFD")
    // Non-ASCII byte while unshifted (only ASCII is valid in direct mode).
    assert.equal(iconv.decode(utils.bytes([0x41, 0x80, 0x42]), "utf-7"), "A\uFFFDB")
  })

  it("handles edge cases", function () {
    // Empty input.
    assert.equal(enc("", "utf-7"), "")
    assert.equal(iconv.decode(buf(""), "utf-7"), "")

    // Non-BMP character (surrogate pair) round-trips through Base64.
    assert.equal(enc("\uD83D\uDE00", "utf-7"), "+2D3eAA-")
    assert.equal(iconv.decode(buf("+2D3eAA-"), "utf-7"), "\uD83D\uDE00")

    // '&' is an ordinary Set O direct char in plain UTF-7 (unlike UTF-7-IMAP, where it shifts).
    assert.equal(enc("a&b", "utf-7"), "a&b")
    assert.equal(iconv.decode(buf("a&b"), "utf-7"), "a&b")

    // '\' and '~' are not direct, so they are Base64-encoded.
    assert.equal(enc("\\~", "utf-7"), "+AFwAfg-")
    assert.equal(iconv.decode(buf("+AFwAfg-"), "utf-7"), "\\~")

    // A trailing lone '+' becomes "+-".
    assert.equal(enc("a+", "utf-7"), "a+-")
  })

  it("decodes across streaming chunk boundaries", function () {
    function decodeChunks (chunks, encoding) {
      const decoder = iconv.getDecoder(encoding)
      let res = ""
      for (let i = 0; i < chunks.length; i++) {
        res += decoder.write(buf(chunks[i]))
      }
      const trail = decoder.end()
      return trail ? res + trail : res
    }

    // Base64 run split mid-run (between code units of "ImIDkQ").
    assert.equal(decodeChunks(["A+ImI", "DkQ-."], "utf-7"), "A\u2262\u0391.")
    // Split at the shift-in boundary, run ends via end() with no trailing '-'.
    assert.equal(decodeChunks(["abc+", "ZeVnLIqe"], "utf-7"), "abc\u65E5\u672C\u8A9E")
    // The "+-" -> "+" escape split across chunks.
    assert.equal(decodeChunks(["x+", "-y"], "utf-7"), "x+y")
  })
})

describe("UTF-7-IMAP codec #node-web", function () {
  it("encodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(enc("A\u2262\u0391.", "utf-7-imap"), "A&ImIDkQ-.")
    assert.equal(enc("\u65E5\u672C\u8A9E", "utf-7-imap"), "&ZeVnLIqe-")
    assert.equal(enc("Hi Mom -\u263A-!", "utf-7-imap"), "Hi Mom -&Jjo--!")
    assert.equal(enc("Item 3 is \u00A31.", "utf-7-imap"), "Item 3 is &AKM-1.")

    // Custom examples that contain more than one mode shift.
    assert.equal(enc("Jyv\u00E4skyl\u00E4", "utf-7-imap"), "Jyv&AOQ-skyl&AOQ-")
    assert.equal(enc("'\u4F60\u597D' hei\u00DFt \"Hallo\"", "utf-7-imap"), "'&T2BZfQ-' hei&AN8-t \"Hallo\"")

    // The ampersand sign is represented as &-.
    assert.equal(enc("Hot & Spicy & Fruity", "utf-7-imap"), "Hot &- Spicy &- Fruity")

    // Slashes are converted to commas.
    assert.equal(enc("\uFFFF\uEDCA\u9876\u5432\u1FED", "utf-7-imap"), "&,,,typh2VDIf7Q-")

    // & sign around non-ASCII chars
    assert.equal(enc("\u00E4&\u00E4&\u00E4", "utf-7-imap"), "&AOQ-&-&AOQ-&-&AOQ-")
  })

  it("decodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.decode(buf("A&ImIDkQ-."), "utf-7-imap"), "A\u2262\u0391.")
    assert.equal(iconv.decode(buf("&ZeVnLIqe-"), "utf-7-imap"), "\u65E5\u672C\u8A9E")
    assert.equal(iconv.decode(buf("Hi Mom -&Jjo--!"), "utf-7-imap"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(buf("Item 3 is &AKM-1."), "utf-7-imap"), "Item 3 is \u00A31.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.decode(buf("Jyv&AOQ-skyl&AOQ-"), "utf-7-imap"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(buf("'&T2BZfQ-' hei&AN8-t \"Hallo\""), "utf-7-imap"), "'\u4F60\u597D' hei\u00DFt \"Hallo\"")

    // The ampersand sign is represented by &-.
    assert.equal(iconv.decode(buf("Hot &- Spicy &- Fruity"), "utf-7-imap"), "Hot & Spicy & Fruity")

    // Slashes are converted to commas.
    assert.equal(iconv.decode(buf("&,,,typh2VDIf7Q-"), "utf-7-imap"), "\uFFFF\uEDCA\u9876\u5432\u1FED")

    // & sign around non-ASCII chars
    assert.equal(iconv.decode(buf("&AOQ-&-&AOQ-&-&AOQ-"), "utf-7-imap"), "\u00E4&\u00E4&\u00E4")
  })

  it("decodes across streaming chunk boundaries", function () {
    const decoder = iconv.getDecoder("utf-7-imap")
    // Base64 run ("ImIDkQ") split between two chunks.
    let res = decoder.write(buf("A&ImI"))
    res += decoder.write(buf("DkQ-."))
    const trail = decoder.end()
    assert.equal(trail ? res + trail : res, "A\u2262\u0391.")
  })
})
