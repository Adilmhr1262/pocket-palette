// Engine tests for Pocket Palette. Loads the <script> block from index.html
// and evals it in node (the script's DOM code is guarded by init()).
var fs = require("fs");
var path = require("path");
var html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
var m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("no script block found"); process.exit(1); }
eval(m[1].replace(/^\s*"use strict";\s*/, "")); // sloppy eval so fn decls land in module scope

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

// --- hexToRgb / rgbToHex ---
check("hexToRgb 6-digit", JSON.stringify(hexToRgb("#ff8800")) === "[255,136,0]");
check("hexToRgb 3-digit", JSON.stringify(hexToRgb("0f0")) === "[0,255,0]");
check("hexToRgb no hash", JSON.stringify(hexToRgb("0000ff")) === "[0,0,255]");
check("rgbToHex roundtrip", rgbToHex(255, 136, 0) === "#ff8800");
check("rgbToHex clamps", rgbToHex(300, -5, 128) === "#ff0080");
var badHex = false;
try { hexToRgb("zzzzzz"); } catch (e) { badHex = true; }
check("hexToRgb rejects garbage", badHex);

// --- luminance ---
check("relLum white = 1", approx(relLum("#ffffff"), 1, 1e-6));
check("relLum black = 0", approx(relLum("#000000"), 0, 1e-6));
check("relLum red", approx(relLum("#ff0000"), 0.2126, 1e-4));
check("relLum green", approx(relLum("#00ff00"), 0.7152, 1e-4));
check("relLum blue", approx(relLum("#0000ff"), 0.0722, 1e-4));

// --- contrast ---
check("black on white = 21", approx(contrast("#000000", "#ffffff"), 21, 1e-9));
check("contrast symmetric", approx(contrast("#123456", "#abcdef"), contrast("#abcdef", "#123456"), 1e-9));
check("same color = 1", approx(contrast("#888888", "#888888"), 1, 1e-9));
check("#777 on white ~4.48", approx(contrast("#777777", "#ffffff"), 4.48, 0.05));

// --- grade ---
check("grade 21 = aaa", grade(21) === "aaa");
check("grade 7 = aaa", grade(7) === "aaa");
check("grade 6.99 = aa", grade(6.99) === "aa");
check("grade 4.5 = aa", grade(4.5) === "aa");
check("grade 4.49 = aa-large", grade(4.49) === "aa-large");
check("grade 3 = aa-large", grade(3) === "aa-large");
check("grade 2.99 = fail", grade(2.99) === "fail");
check("gradeLabel 21", gradeLabel(21) === "AAA");
check("gradeLabel 4.5", gradeLabel(4.5) === "AA");
check("gradeLabel 3.5", gradeLabel(3.5) === "AA large");
check("gradeLabel 2", gradeLabel(2) === "Fail");

// --- hsl roundtrip ---
["#ff0000", "#00ff00", "#0000ff", "#123456", "#abcdef", "#000000", "#ffffff"].forEach(function (h) {
  var hsl = hexToHsl(h);
  check("hsl roundtrip " + h, hslToHex(hsl[0], hsl[1], hsl[2]) === h);
});
check("hsl red", (function () { var h = hexToHsl("#ff0000"); return approx(h[0], 0, 1) && approx(h[1], 100, 1) && approx(h[2], 50, 1); })());

// --- nudge ---
check("nudge already AA returns same", nudgeToAA("#000000", "#ffffff") === "#000000");
var nudged = nudgeToAA("#777777", "#ffffff");
check("nudge #777 on white returns hex", typeof nudged === "string" && /^#[0-9a-f]{6}$/.test(nudged));
check("nudge #777 on white reaches AA", contrast(nudged, "#ffffff") >= 4.5);
check("nudge moves minimally", (function () {
  var l0 = hexToHsl("#777777")[2], l1 = hexToHsl(nudged)[2];
  return Math.abs(l1 - l0) < 8; // should only need a small darkening
})());
var nudged2 = nudgeToAA("#cccccc", "#333333");
check("nudge dark bg works", nudged2 !== null && contrast(nudged2, "#333333") >= 4.5);
check("nudge keeps hue-ish", (function () {
  var h0 = hexToHsl("#c0392b"), h1 = hexToHsl(nudgeToAA("#c0392b", "#f5d547"));
  return Math.abs(h0[0] - h1[0]) < 2 && Math.abs(h0[1] - h1[1]) < 2;
})());

// --- extractPalette ---
function clusterPixels() {
  var px = [];
  var cols = [[230, 30, 30], [30, 200, 60], [40, 80, 230]];
  cols.forEach(function (c) {
    for (var i = 0; i < 60; i++) {
      px.push([
        Math.max(0, Math.min(255, c[0] + (i % 7) - 3)),
        Math.max(0, Math.min(255, c[1] + (i % 5) - 2)),
        Math.max(0, Math.min(255, c[2] + (i % 9) - 4))
      ]);
    }
  });
  return px;
}
var pal1 = extractPalette(clusterPixels(), 3, 42);
check("k-means returns k colors", pal1.length === 3);
check("k-means colors are hex", pal1.every(function (h) { return /^#[0-9a-f]{6}$/.test(h); }));
var pal2 = extractPalette(clusterPixels(), 3, 42);
check("k-means deterministic for seed", JSON.stringify(pal1) === JSON.stringify(pal2));
check("k-means finds red cluster", pal1.some(function (h) { var r = hexToRgb(h); return r[0] > 180 && r[1] < 100 && r[2] < 100; }));
check("k-means finds green cluster", pal1.some(function (h) { var r = hexToRgb(h); return r[1] > 150 && r[0] < 100 && r[2] < 120; }));
check("k-means finds blue cluster", pal1.some(function (h) { var r = hexToRgb(h); return r[2] > 180 && r[0] < 100 && r[1] < 140; }));
check("k-means empty input", JSON.stringify(extractPalette([], 6, 1)) === "[]");
var few = extractPalette([[10, 20, 30], [200, 210, 220]], 6, 7);
check("k-means caps k at pixel count", few.length === 2);

// --- hash roundtrip ---
check("paletteToHash", paletteToHash(["#ff0000", "#00ff00"]) === "#p=ff0000-00ff00");
check("hashToPalette parses", JSON.stringify(hashToPalette("#p=ff0000-00ff00")) === '["#ff0000","#00ff00"]');
check("hashToPalette 3-digit", JSON.stringify(hashToPalette("#p=f00")) === '["#ff0000"]');
check("hashToPalette rejects junk", hashToPalette("#nope") === null);
check("hashToPalette rejects bad seg", hashToPalette("#p=ff0000-zzzzzz") === null);

// --- export builders ---
var css = buildCSS(["#ff0000", "#00ff00"]);
check("buildCSS vars", css.indexOf("--palette-1: #ff0000;") !== -1 && css.indexOf(":root {") === 0);
var tw = buildTailwind(["#ff0000"]);
check("buildTailwind object", tw.indexOf("1: '#ff0000'") !== -1 && tw.indexOf("palette:") !== -1);
var js = buildJSON(["#ff0000"]);
check("buildJSON valid", JSON.parse(js)[0] === "#ff0000");

// --- review fixes: no duplicate swatches, hash cap, floor formatting ---
var twoTone = [];
for (var t = 0; t < 120; t++) twoTone.push(t % 2 ? [200, 200, 200] : [50, 50, 50]);
var flat6 = extractPalette(twoTone, 6, 99);
check("two-color k=6 has no duplicate hexes", (function () {
  var s = {};
  return flat6.every(function (h) { if (s[h]) return false; s[h] = 1; return true; });
})());
check("two-color k=6 returns at most k", flat6.length <= 6 && flat6.length >= 1);
var flat6c = extractPalette(twoTone, 6, 99);
check("two-color dedupe deterministic for seed", JSON.stringify(flat6) === JSON.stringify(flat6c));
var longHash = "#p=" + new Array(17).join("ff0000-").slice(0, -1); // 16 segments
var capped = hashToPalette(longHash);
check("hash longer than 12 colors is truncated", capped !== null && capped.length === 12);
check("fmtRatio floors 4.497", fmtRatio(4.497) === "4.49");
check("fmtRatio floors 2.849", fmtRatio(2.849) === "2.84");
check("fmtRatio exact 21 stays 21.00", fmtRatio(contrast("#000000", "#ffffff")) === "21.00");

// --- mulberry32 determinism ---
var r1 = mulberry32(5)(), r2 = mulberry32(5)(), r3 = mulberry32(6)();
check("mulberry32 deterministic", r1 === r2);
check("mulberry32 seed varies", r1 !== r3);

console.log(pass + "/" + (pass + fail) + " engine checks passed");
process.exit(fail ? 1 : 0);
