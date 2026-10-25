import fs from "fs";
import path from "path";
import { Iconv } from "iconv";
import { Buffer } from "buffer";

// Generate encoding families using original iconv.
var destFileName = "encodings/sbcs-data-generated.js";


var encodingFamilies = [
    {
        // Windows code pages http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/ (+932, 936, 949, 950)
        encodings: [874, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258],
        convert: function(cp) {
            return {
                name: "windows-"+cp,
                aliases: ["win"+cp, "cp"+cp, ""+cp],
            }
        }
    },
    {
        // ISO-8859 code pages http://www.unicode.org/Public/MAPPINGS/ISO8859/
        encodings: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16],
        convert: function(i) {
            return {
                name: "iso-8859-"+i,
                aliases: ["cp"+(28590+i), (28590+i)],
            }
        }
    },
    {
        // IBM/DOS code pages http://www-01.ibm.com/software/globalization/cp/cp_cpgid.html  http://download.boulder.ibm.com/ibmdl/pub/software/dw/java/cdctables.zip
        // GCGID <-> GCUID (unicode) http://www-01.ibm.com/software/globalization/gcgid/gcgid.html
        encodings: [437, 737, 775, 850, 852, 855, 856, 857, 858, 860, 861, 862, 863, 864, 865, 866, 869,
                    922, 1046, 1124, 1125, 1129, 1133, 1161, 1162, 1163],
        convert: function(cp) {
            return {
                name: "CP"+cp,
                aliases: ["ibm"+cp, "csibm"+cp, ""+cp],
            }
        }
    },
    {
        // Macintosh code pages http://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/
        encodings: ["macCroatian", "macCyrillic", "macGreek", 
                    "macIceland", "macRoman", "macRomania", 
                    "macThai", "macTurkish", "macUkraine"],
    },
    {
        // Additional code pages http://www.unicode.org/Public/MAPPINGS/VENDORS/MISC/ and others.
        encodings: ["KOI8-R", "KOI8-U", "KOI8-RU", "KOI8-T", "ARMSCII-8", "RK1048", "TCVN", 
                    "GEORGIAN-ACADEMY", "GEORGIAN-PS", "PT154", "VISCII", "ISO646-CN", "ISO646-JP",
                    "HP-ROMAN8", "MACINTOSH", "ASCII", "TIS620"],
    },
];


var encodings = {};

// Add all encodings from encodingFamilies.
encodingFamilies.forEach(function(family){
    family.encodings.forEach(function(encoding){
        if (family.convert)
            encoding = family.convert(encoding);

        var encodingIconvName = encoding.name ? encoding.name : encoding; 
        var encodingName = encodingIconvName.replace(/[-_]/g, "").toLowerCase();

        encodings[encodingName] = {
            type: "_sbcs",
            chars: generateCharsString(encodingIconvName)
        };

        if (encoding.aliases)
            encoding.aliases.forEach(function(alias){
                encodings[alias] = encodingName;
            });
    });
});

// Write encodings.
fs.writeFileSync(path.join(import.meta.dirname, "..", destFileName),
    "// Generated data for sbcs codec. Don't edit manually. Regenerate using generation/gen-sbcs.js script.\n"+
    "export default "+JSON.stringify(encodings, undefined, "  "));


function generateCharsString(encoding) {
    console.log("Generate encoding for " + encoding);
    var iconvToUtf8 = new Iconv(encoding, "UTF-8");
    var iconvFromUtf8 = new Iconv("UTF-8", encoding);
    var chars = "", needReverse = false, containsDiacritics = [];

    for (var b = 0x0; b < 0x100; b++) {
        try {
            var convertedChar = iconvToUtf8.convert(Buffer.from([b])).toString();
            
            if (convertedChar.length != 1)
                throw new Error("Single-byte encoding error: Must return single char.");

            var convertedBackBuf = iconvFromUtf8.convert(Buffer.from(convertedChar));
            if (convertedBackBuf.length != 1)
                throw new Error("Single-byte encoding error: Cannot decode back.");

            if (convertedBackBuf[0] != b)
                needReverse = true; // We've got non 1:1 corresponding.

            var c = convertedChar.charCodeAt(0);
            var diacritics = {"768":true,"769":true,"770":true,"771":true,"772":true,"773":true,"774":true,"775":true,"776":true,"777":true,"778":true,"779":true,"780":true,"781":true,"782":true,"783":true,"784":true,"785":true,"786":true,"787":true,"788":true,"789":true,"790":true,"791":true,"792":true,"793":true,"794":true,"795":true,"796":true,"797":true,"798":true,"799":true,"800":true,"801":true,"802":true,"803":true,"804":true,"805":true,"806":true,"807":true,"808":true,"809":true,"810":true,"811":true,"812":true,"813":true,"814":true,"815":true,"816":true,"817":true,"818":true,"819":true,"820":true,"821":true,"822":true,"823":true,"824":true,"825":true,"826":true,"827":true,"828":true,"829":true,"830":true,"831":true,"832":true,"833":true,"834":true,"835":true,"836":true,"837":true,"838":true,"839":true,"840":true,"841":true,"842":true,"843":true,"844":true,"845":true,"846":true,"848":true,"849":true,"850":true,"851":true,"852":true,"853":true,"854":true,"855":true,"856":true,"857":true,"858":true,"859":true,"860":true,"861":true,"862":true,"863":true,"864":true,"865":true,"866":true,"867":true,"868":true,"869":true,"870":true,"871":true,"872":true,"873":true,"874":true,"875":true,"876":true,"877":true,"878":true,"879":true,"1155":true,"1156":true,"1157":true,"1158":true,"1159":true,"1425":true,"1426":true,"1427":true,"1428":true,"1429":true,"1430":true,"1431":true,"1432":true,"1433":true,"1434":true,"1435":true,"1436":true,"1437":true,"1438":true,"1439":true,"1440":true,"1441":true,"1442":true,"1443":true,"1444":true,"1445":true,"1446":true,"1447":true,"1448":true,"1449":true,"1450":true,"1451":true,"1452":true,"1453":true,"1454":true,"1455":true,"1456":true,"1457":true,"1458":true,"1459":true,"1460":true,"1461":true,"1462":true,"1463":true,"1464":true,"1465":true,"1466":true,"1467":true,"1468":true,"1469":true,"1471":true,"1473":true,"1474":true,"1476":true,"1477":true,"1479":true,"1552":true,"1553":true,"1554":true,"1555":true,"1556":true,"1557":true,"1558":true,"1559":true,"1560":true,"1561":true,"1562":true,"1611":true,"1612":true,"1613":true,"1614":true,"1615":true,"1616":true,"1617":true,"1618":true,"1619":true,"1620":true,"1621":true,"1622":true,"1623":true,"1624":true,"1625":true,"1626":true,"1627":true,"1628":true,"1629":true,"1630":true,"1631":true,"1648":true,"1750":true,"1751":true,"1752":true,"1753":true,"1754":true,"1755":true,"1756":true,"1759":true,"1760":true,"1761":true,"1762":true,"1763":true,"1764":true,"1767":true,"1768":true,"1770":true,"1771":true,"1772":true,"1773":true,"1809":true,"1840":true,"1841":true,"1842":true,"1843":true,"1844":true,"1845":true,"1846":true,"1847":true,"1848":true,"1849":true,"1850":true,"1851":true,"1852":true,"1853":true,"1854":true,"1855":true,"1856":true,"1857":true,"1858":true,"1859":true,"1860":true,"1861":true,"1862":true,"1863":true,"1864":true,"1865":true,"1866":true,"2027":true,"2028":true,"2029":true,"2030":true,"2031":true,"2032":true,"2033":true,"2034":true,"2035":true,"2070":true,"2071":true,"2072":true,"2073":true,"2075":true,"2076":true,"2077":true,"2078":true,"2079":true,"2080":true,"2081":true,"2082":true,"2083":true,"2085":true,"2086":true,"2087":true,"2089":true,"2090":true,"2091":true,"2092":true,"2093":true,"2137":true,"2138":true,"2139":true,"2276":true,"2277":true,"2278":true,"2279":true,"2280":true,"2281":true,"2282":true,"2283":true,"2284":true,"2285":true,"2286":true,"2287":true,"2288":true,"2289":true,"2290":true,"2291":true,"2292":true,"2293":true,"2294":true,"2295":true,"2296":true,"2297":true,"2298":true,"2299":true,"2300":true,"2301":true,"2302":true,"2364":true,"2381":true,"2385":true,"2386":true,"2387":true,"2388":true,"2492":true,"2509":true,"2620":true,"2637":true,"2748":true,"2765":true,"2876":true,"2893":true,"3021":true,"3149":true,"3157":true,"3158":true,"3260":true,"3277":true,"3405":true,"3530":true,"3640":true,"3641":true,"3642":true,"3656":true,"3657":true,"3658":true,"3659":true,"3768":true,"3769":true,"3784":true,"3785":true,"3786":true,"3787":true,"3864":true,"3865":true,"3893":true,"3895":true,"3897":true,"3953":true,"3954":true,"3956":true,"3962":true,"3963":true,"3964":true,"3965":true,"3968":true,"3970":true,"3971":true,"3972":true,"3974":true,"3975":true,"4038":true,"4151":true,"4153":true,"4154":true,"4237":true,"4957":true,"4958":true,"4959":true,"5908":true,"5940":true,"6098":true,"6109":true,"6313":true,"6457":true,"6458":true,"6459":true,"6679":true,"6680":true,"6752":true,"6773":true,"6774":true,"6775":true,"6776":true,"6777":true,"6778":true,"6779":true,"6780":true,"6783":true,"6964":true,"6980":true,"7019":true,"7020":true,"7021":true,"7022":true,"7023":true,"7024":true,"7025":true,"7026":true,"7027":true,"7082":true,"7083":true,"7142":true,"7154":true,"7155":true,"7223":true,"7376":true,"7377":true,"7378":true,"7380":true,"7381":true,"7382":true,"7383":true,"7384":true,"7385":true,"7386":true,"7387":true,"7388":true,"7389":true,"7390":true,"7391":true,"7392":true,"7394":true,"7395":true,"7396":true,"7397":true,"7398":true,"7399":true,"7400":true,"7405":true,"7412":true,"7616":true,"7617":true,"7618":true,"7619":true,"7620":true,"7621":true,"7622":true,"7623":true,"7624":true,"7625":true,"7626":true,"7627":true,"7628":true,"7629":true,"7630":true,"7631":true,"7632":true,"7633":true,"7634":true,"7635":true,"7636":true,"7637":true,"7638":true,"7639":true,"7640":true,"7641":true,"7642":true,"7643":true,"7644":true,"7645":true,"7646":true,"7647":true,"7648":true,"7649":true,"7650":true,"7651":true,"7652":true,"7653":true,"7654":true,"7676":true,"7677":true,"7678":true,"7679":true,"8400":true,"8401":true,"8402":true,"8403":true,"8404":true,"8405":true,"8406":true,"8407":true,"8408":true,"8409":true,"8410":true,"8411":true,"8412":true,"8417":true,"8421":true,"8422":true,"8423":true,"8424":true,"8425":true,"8426":true,"8427":true,"8428":true,"8429":true,"8430":true,"8431":true,"8432":true,"11503":true,"11504":true,"11505":true,"11647":true,"11744":true,"11745":true,"11746":true,"11747":true,"11748":true,"11749":true,"11750":true,"11751":true,"11752":true,"11753":true,"11754":true,"11755":true,"11756":true,"11757":true,"11758":true,"11759":true,"11760":true,"11761":true,"11762":true,"11763":true,"11764":true,"11765":true,"11766":true,"11767":true,"11768":true,"11769":true,"11770":true,"11771":true,"11772":true,"11773":true,"11774":true,"11775":true,"12330":true,"12331":true,"12332":true,"12333":true,"12334":true,"12335":true,"12441":true,"12442":true,"42607":true,"42612":true,"42613":true,"42614":true,"42615":true,"42616":true,"42617":true,"42618":true,"42619":true,"42620":true,"42621":true,"42655":true,"42736":true,"42737":true,"43014":true,"43204":true,"43232":true,"43233":true,"43234":true,"43235":true,"43236":true,"43237":true,"43238":true,"43239":true,"43240":true,"43241":true,"43242":true,"43243":true,"43244":true,"43245":true,"43246":true,"43247":true,"43248":true,"43249":true,"43307":true,"43308":true,"43309":true,"43347":true,"43443":true,"43456":true,"43696":true,"43698":true,"43699":true,"43700":true,"43703":true,"43704":true,"43710":true,"43711":true,"43713":true,"43766":true,"44013":true,"64286":true,"65056":true,"65057":true,"65058":true,"65059":true,"65060":true,"65061":true,"65062":true,"66045":true,"68109":true,"68111":true,"68152":true,"68153":true,"68154":true,"68159":true,"69702":true,"69817":true,"69818":true,"69888":true,"69889":true,"69890":true,"69939":true,"69940":true,"70080":true,"71350":true,"71351":true,"119141":true,"119142":true,"119143":true,"119144":true,"119145":true,"119149":true,"119150":true,"119151":true,"119152":true,"119153":true,"119154":true,"119163":true,"119164":true,"119165":true,"119166":true,"119167":true,"119168":true,"119169":true,"119170":true,"119173":true,"119174":true,"119175":true,"119176":true,"119177":true,"119178":true,"119179":true,"119210":true,"119211":true,"119212":true,"119213":true,"119362":true,"119363":true,"119364":true};
            if (diacritics[c]) {
                containsDiacritics.push(c);
            }

        } catch (exception) {
            if (exception.code === "EILSEQ") {
                convertedChar = "\ufffd";
            } else {
                throw exception;
            }
        }

        chars += convertedChar;
    }

    if (containsDiacritics.length > 0)
        console.log("Contains Diacritics: ", containsDiacritics.map(function(d) {return d.toString(16)})+"");

    // Check if the first half is standard and cut it if it is.
    var asciiString = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f'+
                  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7f';
    if (chars.slice(0, 0x80) === asciiString)
        chars = chars.slice(0x80);

    return chars;
}


