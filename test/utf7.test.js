"use strict"

var assert = require("assert")
var Buffer = require("buffer").Buffer
var iconv = require("../")

// These tests are mostly from https://github.com/kkaefer/utf7
// In case of ambiguity, we do the same as iconv. For example, we encode "optional direct" characters, but leave spaces and \n\r\t as-is.

describe("UTF-7 codec", function () {
  it("encodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.encode("A\u2262\u0391.", "utf-7").toString(), "A+ImIDkQ-.")
    assert.equal(iconv.encode("\u65E5\u672C\u8A9E", "utf-7").toString(), "+ZeVnLIqe-")

    // Set O characters ('!', '"', ...) are left direct, per RFC 2152.
    assert.equal(iconv.encode("Hi Mom -\u263A-!", "utf-7").toString(), "Hi Mom -+Jjo--!")

    assert.equal(iconv.encode("Item 3 is \u00A31.", "utf-7").toString(), "Item 3 is +AKM-1.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.encode("Jyv\u00E4skyl\u00E4", "utf-7").toString(), "Jyv+AOQ-skyl+AOQ-")
    assert.equal(iconv.encode("'\u4F60\u597D' heißt \"Hallo\"", "utf-7").toString(), "'+T2BZfQ-' hei+AN8-t \"Hallo\"")

    // The plus sign is represented as +-.
    assert.equal(iconv.encode("Hot + Spicy + Fruity", "utf-7").toString(), "Hot +- Spicy +- Fruity")

    // Slashes in the beginning.
    assert.equal(iconv.encode("\uffff\uedca\u9876\u5432\u1fed", "utf-7").toString(), "+///typh2VDIf7Q-")

    // + sign around non-ASCII chars
    assert.equal(iconv.encode("\u00E4+\u00E4+\u00E4", "utf-7").toString(), "+AOQAKwDkACsA5A-")
  })

  it("decodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.decode(Buffer.from("A+ImIDkQ-."), "utf-7"), "A\u2262\u0391.")
    assert.equal(iconv.decode(Buffer.from("A+ImIDkQ."), "utf-7"), "A\u2262\u0391.")

    assert.equal(iconv.decode(Buffer.from("+ZeVnLIqe-"), "utf-7"), "\u65E5\u672C\u8A9E")
    assert.equal(iconv.decode(Buffer.from("+ZeVnLIqe"), "utf-7"), "\u65E5\u672C\u8A9E")

    assert.equal(iconv.decode(Buffer.from("Hi Mom -+Jjo--!"), "utf-7"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(Buffer.from("Hi+ACA-Mom+ACA--+Jjo--+ACE-"), "utf-7"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(Buffer.from("Item 3 is +AKM-1."), "utf-7"), "Item 3 is \u00A31.")
    assert.equal(iconv.decode(Buffer.from("Item+ACA-3+ACA-is+ACAAow-1."), "utf-7"), "Item 3 is \u00A31.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.decode(Buffer.from("Jyv+AOQ-skyl+AOQ-"), "utf-7"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(Buffer.from("Jyv+AOQ-skyl+AOQ"), "utf-7"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(Buffer.from("'+T2BZfQ-' hei+AN8-t \"Hallo\""), "utf-7"), "'\u4F60\u597D' heißt \"Hallo\"")
    assert.equal(iconv.decode(Buffer.from("'+T2BZfQ' hei+AN8-t \"Hallo\""), "utf-7"), "'\u4F60\u597D' heißt \"Hallo\"")
    assert.equal(iconv.decode(Buffer.from("'+T2BZfQ-'+ACA-hei+AN8-t+ACAAIg-Hallo+ACI-"), "utf-7"), "'\u4F60\u597D' heißt \"Hallo\"")
    assert.equal(iconv.decode(Buffer.from("'+T2BZfQ-'+ACA-hei+AN8-t+ACAAIg-Hallo+ACI"), "utf-7"), "'\u4F60\u597D' heißt \"Hallo\"")

    // The plus sign is represented by +-.
    assert.equal(iconv.decode(Buffer.from("Hot +- Spicy +- Fruity"), "utf-7"), "Hot + Spicy + Fruity")
    assert.equal(iconv.decode(Buffer.from("Hot+ACAAKwAg-Spicy+ACAAKwAg-Fruity"), "utf-7"), "Hot + Spicy + Fruity")

    // Slashes in the beginning.
    assert.equal(iconv.decode(Buffer.from("+///typh2VDIf7Q-"), "utf-7"), "\uffff\uedca\u9876\u5432\u1fed")
    assert.equal(iconv.decode(Buffer.from("+///typh2VDIf7Q"), "utf-7"), "\uffff\uedca\u9876\u5432\u1fed")

    // + sign around non-ASCII chars
    assert.equal(iconv.decode(Buffer.from("+AOQ-+-+AOQ-+-+AOQ-"), "utf-7"), "\u00E4+\u00E4+\u00E4")
    // assert.equal(iconv.decode(Buffer.from('+AOQ++AOQ+-+AOQ'), 'utf-7'), '\u00E4+\u00E4+\u00E4');
    assert.equal(iconv.decode(Buffer.from("+AOQAKwDkACsA5A-"), "utf-7"), "\u00E4+\u00E4+\u00E4")
    assert.equal(iconv.decode(Buffer.from("+AOQAKwDkACsA5A"), "utf-7"), "\u00E4+\u00E4+\u00E4")

    // Tests from https://gist.github.com/peteroupc/08c5ecc8131a76062ffe

    assert.equal(iconv.decode(Buffer.from("\r\n\t '!\"#'(),$-%@[]^&=<>;*_`{}./:|?"), "utf-7"), "\r\n\t '!\"#'(),$-%@[]^&=<>;*_`{}./:|?")
    assert.equal(iconv.decode(Buffer.from("x+--"), "utf-7"), "x+-")
    assert.equal(iconv.decode(Buffer.from("x+-y"), "utf-7"), "x+y")

    // UTF-16 code unit
    assert.equal(iconv.decode(Buffer.from("+DEE?"), "utf-7"), "\u0c41?")
    assert.equal(iconv.decode(Buffer.from("+DEE"), "utf-7"), "\u0c41")

    // Surrogate pair
    assert.equal(iconv.decode(Buffer.from("+2ADcAA?"), "utf-7"), "\ud800\udc00?")
    assert.equal(iconv.decode(Buffer.from("+2ADcAA"), "utf-7"), "\ud800\udc00")

    // Two UTF-16 code units
    assert.equal(iconv.decode(Buffer.from("+AMAA4A?"), "utf-7"), "\u00c0\u00e0?")
    assert.equal(iconv.decode(Buffer.from("+AMAA4A"), "utf-7"), "\u00c0\u00e0")
    assert.equal(iconv.decode(Buffer.from("+AMAA4A-Next"), "utf-7"), "\u00c0\u00e0Next")
    assert.equal(iconv.decode(Buffer.from("+AMAA4A!Next"), "utf-7"), "\u00c0\u00e0!Next")
  })

  it("replaces ill-formed sequences with U+FFFD (RFC 2152)", function () {
    // Incomplete code unit: a single Base64 char carries only 6 bits, not a full 16-bit unit.
    assert.equal(iconv.decode(Buffer.from("+D-"), "utf-7"), "\ufffd")
    // Truncated Base64 at end of stream (no terminator), still an incomplete code unit.
    assert.equal(iconv.decode(Buffer.from("+DE"), "utf-7"), "\ufffd")
    // A complete code unit followed by non-zero padding bits.
    assert.equal(iconv.decode(Buffer.from("+DEH-"), "utf-7"), "\u0c41\ufffd")
    // Non-ASCII byte while unshifted (only ASCII is valid in direct mode).
    assert.equal(iconv.decode(Buffer.from([0x41, 0x80, 0x42]), "utf-7"), "A\ufffdB")
  })

  it("handles edge cases", function () {
    // Empty input.
    assert.equal(iconv.encode("", "utf-7").toString(), "")
    assert.equal(iconv.decode(Buffer.from(""), "utf-7"), "")

    // Non-BMP character (surrogate pair) round-trips through Base64.
    assert.equal(iconv.encode("\ud83d\ude00", "utf-7").toString(), "+2D3eAA-")
    assert.equal(iconv.decode(Buffer.from("+2D3eAA-"), "utf-7"), "\ud83d\ude00")

    // '&' is an ordinary Set O direct char in plain UTF-7 (unlike UTF-7-IMAP, where it shifts).
    assert.equal(iconv.encode("a&b", "utf-7").toString(), "a&b")
    assert.equal(iconv.decode(Buffer.from("a&b"), "utf-7"), "a&b")

    // '\' and '~' are not direct, so they are Base64-encoded.
    assert.equal(iconv.encode("\\~", "utf-7").toString(), "+AFwAfg-")
    assert.equal(iconv.decode(Buffer.from("+AFwAfg-"), "utf-7"), "\\~")

    // A trailing lone '+' becomes "+-".
    assert.equal(iconv.encode("a+", "utf-7").toString(), "a+-")
  })

  it("decodes across streaming chunk boundaries", function () {
    function decodeChunks (chunks, encoding) {
      var decoder = iconv.getDecoder(encoding)
      var res = ""
      for (var i = 0; i < chunks.length; i++) {
        res += decoder.write(Buffer.from(chunks[i]))
      }
      var trail = decoder.end()
      return trail ? res + trail : res
    }

    // Base64 run split mid-run (between code units of "ImIDkQ").
    assert.equal(decodeChunks(["A+ImI", "DkQ-."], "utf-7"), "A\u2262\u0391.")
    // Split at the shift-in boundary, run ends via end() with no trailing '-'.
    assert.equal(decodeChunks(["abc+", "ZeVnLIqe"], "utf-7"), "abc\u65e5\u672c\u8a9e")
    // The "+-" -> "+" escape split across chunks.
    assert.equal(decodeChunks(["x+", "-y"], "utf-7"), "x+y")
  })
})

describe("UTF-7-IMAP codec", function () {
  it("encodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.encode("A\u2262\u0391.", "utf-7-imap").toString(), "A&ImIDkQ-.")
    assert.equal(iconv.encode("\u65E5\u672C\u8A9E", "utf-7-imap").toString(), "&ZeVnLIqe-")
    assert.equal(iconv.encode("Hi Mom -\u263A-!", "utf-7-imap").toString(), "Hi Mom -&Jjo--!")
    assert.equal(iconv.encode("Item 3 is \u00A31.", "utf-7-imap").toString(), "Item 3 is &AKM-1.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.encode("Jyv\u00E4skyl\u00E4", "utf-7-imap").toString(), "Jyv&AOQ-skyl&AOQ-")
    assert.equal(iconv.encode("'\u4F60\u597D' heißt \"Hallo\"", "utf-7-imap").toString(), "'&T2BZfQ-' hei&AN8-t \"Hallo\"")

    // The ampersand sign is represented as &-.
    assert.equal(iconv.encode("Hot & Spicy & Fruity", "utf-7-imap").toString(), "Hot &- Spicy &- Fruity")

    // Slashes are converted to commas.
    assert.equal(iconv.encode("\uffff\uedca\u9876\u5432\u1fed", "utf-7-imap").toString(), "&,,,typh2VDIf7Q-")

    // & sign around non-ASCII chars
    assert.equal(iconv.encode("\u00E4&\u00E4&\u00E4", "utf-7-imap").toString(), "&AOQ-&-&AOQ-&-&AOQ-")
  })

  it("decodes correctly", function () {
    // Examples from RFC 2152.
    assert.equal(iconv.decode(Buffer.from("A&ImIDkQ-."), "utf-7-imap"), "A\u2262\u0391.")
    assert.equal(iconv.decode(Buffer.from("&ZeVnLIqe-"), "utf-7-imap"), "\u65E5\u672C\u8A9E")
    assert.equal(iconv.decode(Buffer.from("Hi Mom -&Jjo--!"), "utf-7-imap"), "Hi Mom -\u263A-!")
    assert.equal(iconv.decode(Buffer.from("Item 3 is &AKM-1."), "utf-7-imap"), "Item 3 is \u00A31.")

    // Custom examples that contain more than one mode shift.
    assert.equal(iconv.decode(Buffer.from("Jyv&AOQ-skyl&AOQ-"), "utf-7-imap"), "Jyv\u00E4skyl\u00E4")
    assert.equal(iconv.decode(Buffer.from("'&T2BZfQ-' hei&AN8-t \"Hallo\""), "utf-7-imap"), "'\u4F60\u597D' heißt \"Hallo\"")

    // The ampersand sign is represented by &-.
    assert.equal(iconv.decode(Buffer.from("Hot &- Spicy &- Fruity"), "utf-7-imap"), "Hot & Spicy & Fruity")

    // Slashes are converted to commas.
    assert.equal(iconv.decode(Buffer.from("&,,,typh2VDIf7Q-"), "utf-7-imap"), "\uffff\uedca\u9876\u5432\u1fed")

    // & sign around non-ASCII chars
    assert.equal(iconv.decode(Buffer.from("&AOQ-&-&AOQ-&-&AOQ-"), "utf-7-imap"), "\u00E4&\u00E4&\u00E4")
  })

  it("decodes across streaming chunk boundaries", function () {
    var decoder = iconv.getDecoder("utf-7-imap")
    // Base64 run ("ImIDkQ") split between two chunks.
    var res = decoder.write(Buffer.from("A&ImI"))
    res += decoder.write(Buffer.from("DkQ-."))
    var trail = decoder.end()
    assert.equal(trail ? res + trail : res, "A\u2262\u0391.")
  })
})
