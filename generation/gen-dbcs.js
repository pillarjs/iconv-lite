"use strict";

const utils = require("./utils"),
    errTo = require("errto"),
    async = require("async");

async.parallel({
    $big5: utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-big5.txt"), // Encodings with $ are not saved. They are used to calculate other encs.
    $gbk:  utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-gb18030.txt"),
    $gbRanges: utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-gb18030-ranges.txt"),
    $eucKr: utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-euc-kr.txt"),
    $jis0208: utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-jis0208.txt"),
    $jis0212: utils.getFile.bind(null, "http://encoding.spec.whatwg.org/index-jis0212.txt"),
    $cp932: utils.getFile.bind(null, "http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP932.TXT"),
    cp936: utils.getFile.bind(null, "http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP936.TXT"),
    cp949: utils.getFile.bind(null, "http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP949.TXT"),
    cp950: utils.getFile.bind(null, "http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP950.TXT"),
}, errTo(console.log, function(data) {
    // First, parse all files.
    for (var enc in data) {
        var dbcs = {};
        utils.parseText(data[enc]).map(function(a) {
            var dbcsCode = parseInt(a[0]);
            var unicode = parseInt(a[1]);
            if (!isNaN(unicode))
                dbcs[dbcsCode] = unicode;
        });
        data[enc] = dbcs;
    }

    // Calculate difference between big5 and cp950, and write it to a file.
    // See http://encoding.spec.whatwg.org/#big5
    var big5add = {}
    for (var i = 0x8100; i < 0x10000; i++) { // Lead byte is 0x81 .. 0xFE
        var trail = i & 0xFF;
        if (trail < 0x40 || (0x7E < trail && trail < 0xA1) || trail > 0xFE) continue;
        var lead = i >> 8;
        var offset = (trail < 0x7F) ? 0x40 : 0x62;
        var pointer = (lead - 0x81) * 157 + (trail - offset); 
        var cpChar = data.cp950[i];
        var big5Char = data.$big5[pointer];
        if (big5Char !== undefined && cpChar != big5Char)
            big5add[i] = big5Char;
    }

    // Calculate HKSCS codes that are duplicates of big5 codes and need to be skipped when encoding.
    console.log("Duplicate HKSCS codes that need to be skipped when encoded (see encodeSkipVals in big5hkscs): ")
    var big5codes = {};
    for (var i = 0xA100; i < 0x10000; i++) {
        var uCharCode = (big5add[i] !== undefined) ? big5add[i] : data.cp950[i];
        if (uCharCode !== undefined) {
            big5codes[uCharCode] = true;
        }
    }
    for (var i = 0x8100; i < 0xA100; i++) {
        var uCharCode = (big5add[i] !== undefined) ? big5add[i] : data.cp950[i];
        if (uCharCode !== undefined && big5codes[uCharCode]) {
            console.log("0x"+i.toString(16));
        }
    }

    if (big5Char !== undefined) {
        if (lead < 0xA1) {
            if (d[big5Char] !== undefined) {
                console.log("duplicate in first: "+ pointer + " char " + big5Char);
            }
            d[big5Char] = i;
        } else if (d[big5Char] !== undefined) {
            console.log("dup 0x"+d[big5Char].toString(16) + " -> " + i.toString(16))
        }

    }

    // Add char sequences that are not in the index file (as given in http://encoding.spec.whatwg.org/#big5-decoder)
    function toIdx(pointer) { var trail = pointer % 157; var lead = Math.floor(pointer / 157) + 0x81; return (lead << 8) + (trail + (trail < 0x3F ? 0x40 : 0x62))}
    big5add[toIdx(1133)] = [0x00CA, 0x0304];
    big5add[toIdx(1135)] = [0x00CA, 0x030C];
    big5add[toIdx(1164)] = [0x00EA, 0x0304];
    big5add[toIdx(1166)] = [0x00EA, 0x030C];

    utils.writeTable("big5-added", utils.generateTable(big5add));

    // Calculate difference between GB18030 encoding and cp936.
    // See http://encoding.spec.whatwg.org/#gb18030-encoder
    var gbkadd = {}
    for (var i = 0x8100; i < 0x10000; i++) { // Lead byte is 0x81 .. 0xFE
        var trail = i & 0xFF;
        if (trail < 0x40 || trail === 0x7F || trail > 0xFE) continue;
        var lead = i >> 8;
        var offset = (trail < 0x7F) ? 0x40 : 0x41;
        var gbAddr = (lead - 0x81) * 190 + (trail - offset); 
        var cpChar = data.cp936[i];
        var gbChar = data.$gbk[gbAddr];
        if ((cpChar !== undefined) && (cpChar != gbChar))
            console.log("Dont match: ", i.toString(16), gbAddr.toString(16), gbChar, cpChar);

        if (gbChar !== undefined && cpChar != gbChar)
            gbkadd[i] = gbChar;
    }

    // GB18030:2005 addition
    var gbk2005add = [['8135f437', '']];

    utils.writeTable("gbk-added", utils.generateTable(gbkadd).concat(gbk2005add));

    // Write GB18030 ranges
    var ranges = { uChars: [], gbChars: [] };
    for (var k in data.$gbRanges) {
        ranges.uChars.push(data.$gbRanges[k]);
        ranges.gbChars.push(+k);
    }
    utils.writeFile("gb18030-ranges", JSON.stringify(ranges));


    // Use http://encoding.spec.whatwg.org/#shift_jis-decoder
    var shiftjis = {};
    for (var i = 0; i <= 0x80; i++)
        shiftjis[i] = i;
    for (var i = 0xA1; i <= 0xDF; i++)
        shiftjis[i] = 0xFF61 + i - 0xA1;

    for (var lead = 0x81; lead < 0xFF; lead++)
        if (lead < 0xA1 || lead > 0xDF)
            for (var byte = 0; byte < 0xFF; byte++) {
                var offset = (byte < 0x7F) ? 0x40 : 0x41;
                var leadOffset = (lead < 0xA0) ? 0x81 : 0xC1;
                if ((0x40 <= byte && byte <= 0x7E) || (0x80 <= byte && byte <= 0xFC)) {
                    var pointer = (lead - leadOffset) * 188 + byte - offset;
                    if (data.$jis0208[pointer])
                        shiftjis[(lead << 8) + byte] = data.$jis0208[pointer];
                    else if (8836 <= pointer && pointer <= 10528)
                        shiftjis[(lead << 8) + byte] = 0xE000 + pointer - 8836; // Interoperable legacy from Windows known as EUDC
                }
            }

    utils.writeTable("shiftjis", utils.generateTable(shiftjis));

    // Fill out EUC-JP table according to http://encoding.spec.whatwg.org/#euc-jp
    var eucJp = {};
    for (var i = 0; i < 0x80; i++)
        eucJp[i] = i;
    for (var i = 0xA1; i <= 0xDF; i++)
        eucJp[(0x8E << 8) + i] = 0xFF61 + i - 0xA1;
    for (var i = 0xA1; i <= 0xFE; i++)
        for (var j = 0xA1; j <= 0xFE; j++) {
            eucJp[               (i << 8) + j] = data.$jis0208[(i - 0xA1) * 94 + (j - 0xA1)];
            eucJp[(0x8F << 16) + (i << 8) + j] = data.$jis0212[(i - 0xA1) * 94 + (j - 0xA1)];
        }
            
    utils.writeTable("eucjp", utils.generateTable(eucJp, 3));


    // Fill out EUC-KR Table and check that it is the same as cp949.
    var eucKr = {};
    for (var i = 0; i < 0x80; i++)
        eucKr[i] = i;
    for (var i = 0x8100; i < 0xFF00; i++) {
        var lead = i >> 8, byte = i & 0xFF, ptr = null, t;
        if (0x41 <= byte && byte <= 0xFE)
            ptr = (lead-0x81) * 190 + (byte-0x41);
        if (ptr !== null)
            eucKr[i] = data.$eucKr[ptr];

        // Compare with cp949
        if (data.cp949[i] !== eucKr[i])
            console.log("Warning: EUC-KR from Encoding Standard doesn't match with CP949 from Unicode.com: ", i, data.cp949[i], eucKr[i]);
    }


    // Write all plain tables as-is.
    for (var enc in data)
        if (enc[0] != "$") 
            utils.writeTable(enc, utils.generateTable(data[enc]));


    console.log("DBCS encodings regenerated.");
}));


