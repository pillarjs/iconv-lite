
// This script generates unicode normalization data.

import { getFile, parseText } from "../utils.js";

var baseUrl = "http://www.unicode.org/Public/6.3.0/ucd/";

async function generate() {
    const [data, exclusions] = await Promise.all([
        getFile(baseUrl + "UnicodeData.txt"),
        getFile(baseUrl + "CompositionExclusions.txt")
    ]);

    var features = {};
    parseText(data, ";").map(function(a) {
        var ch = parseInt(a[0], 16);
        var combiningClass = parseInt(a[3], 10) || 0;
        var decompStr = a[5].trim();
        var canonical, decomp;

        if (decompStr.length > 0) {
            decomp = decompStr.split(" ").map(function(s) {return parseInt(s, 16)});;
            canonical = true;
            if (isNaN(decomp[0])) {  // When first item is a tag (unparsable as int), this is a 'compatibility decomposition'
                canonical = false;
                decomp.shift();
            }
            //console.log(String.fromCharCode(ch), " -> ", decomp.map(function(c) { return String.fromCharCode(c)}).join(" + "), canonical ? "canonical" : "compat");
        }

        if (decomp || combiningClass) {
            features[ch] = {
                decomp: decomp,
                canonical: canonical,
                combiningClass: combiningClass,
            };
        }
    });

    // Process CompositionExclusions.txt
    parseText(exclusions).map(function(a) {
        var ch = parseInt(a[0], 16);
        features[ch].noCompose = true;
    });

    // Exclude Non-Starter Decompositions and Singleton Decompositions (CompositionExclusions.txt parts 3, 4)
    for (var ch in features) {
        var feat = features[ch];
        if (feat.canonical && (feat.decomp.length == 1 || feat.combiningClass || (features[feat.decomp[0]] || {}).combiningClass)) {
            //console.log("Excluded:", (+ch).toString(16));
            feat.noCompose = true;
        }
    }

    // Add Jamo decompositions (see part 3.12 of http://www.unicode.org/versions/Unicode6.3.0/ch03.pdf)
    var LBase = 0x1100, VBase = 0x1161, TBase = 0x11A7, SBase = 0xAC00;
    var LCount = 19, VCount = 21, TCount = 28;

    for (var l = 0; l < LCount; l++)
        for (var v = 0; v < VCount; v++) {
            var lv = l * VCount * TCount + v * TCount + SBase;
            features[lv] = {
                decomp: [l + LBase, v + VBase],
                canonical: true,
                combiningClass: 0
            }

            for (var t = 1; t < TCount; t++)
                features[lv + t] = {
                    decomp: [lv, t + TBase],
                    canonical: true,
                    combiningClass: 0
                };
        }

    // -------------------------------------------------------------------------
    
    function f(ch) { return features[ch] || {combiningClass: 0}; }
    function hex(ch) { return (+ch).toString(16);}

    function decompose(ch, canonical) {
        var feat = f(ch);
        if (feat.decomp && (feat.canonical || !canonical)) {
            return [].concat.apply([], feat.decomp.map(function(c) {return decompose(c, canonical)}));
        } else return [ch];
    }
    /*
    for (var ch in features) {
        [true, false].map(function(can) {
            var arr = decompose(ch, can);
            for (var i = 0; i < arr.length-1; i++)
                if (f(arr[i]).combiningClass > f(arr[i+1]).combiningClass)
                    console.log("Err", (+ch).toString(16), can, arr.map(function(ch) {return hex(ch)+"/"+f(ch).combiningClass;}));


        });
    }
    */
    // var asciiString = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f'+
    //           ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7f';


    // import encodings from "../../encodings/sbcs-data-generated.js";
    // for (var encName in encodings) {
    //     var enc = encodings[encName];
    //     if (enc.chars) {
    //         if (enc.chars.length == 128)
    //             enc.chars = asciiString + enc.chars;

    //         var existChars = {};
    //         for (var i = 0; i < enc.chars.length; i++)
    //             existChars[enc.chars.charCodeAt(i)] = true;

    //         for (var i = 0; i < enc.chars.length; i++) {
    //             var charCode = enc.chars.charCodeAt(i);
    //             var feat = f(charCode);
    //             if (feat.decomp && feat.canonical && feat.decomp.length == 2) {
    //                 if (!existChars[feat.decomp[0]])
    //                     console.log("!!", encName, hex(enc.chars.charCodeAt(i)), "->", feat.decomp.map(hex));    
    //                 if (f(feat.decomp[0]).combiningClass != 0 || f(feat.decomp[1]).combiningClass == 0)
    //                     console.log("!!2", encName, hex(enc.chars.charCodeAt(i)), "->", feat.decomp.map(hex));    
    //             }

    //             var decomp = decompose(charCode, true);
    //             if (decomp.length > 2) {

    //                 console.log("!!3", encName, hex(enc.chars.charCodeAt(i)), "->", decomp.map(hex));

    //             }
    //         }


    //     }

    // }

    for (var charCode in features) {
        var feat = f(charCode);
        if (feat.decomp && feat.canonical) {
            if (feat.decomp.length == 1) {
                if (f(feat.decomp[0]).combiningClass != feat.combiningClass)
                    console.log("!!1", hex(charCode), "->", feat.decomp.map(hex));    

            } else if (feat.decomp.length == 2) {
                if (f(feat.decomp[0]).combiningClass != feat.combiningClass) // || f(feat.decomp[1]).combiningClass == 0)
                    console.log("!!2", hex(charCode), "->", feat.decomp.map(hex));    

            } else {
                console.log("comp - not 1 or 2", hex(charCode))
            }
        }
    }
}

generate().catch(function(err) {
    console.error(err);
    process.exitCode = 1;
});


