// UI tests for Pocket Palette. Headless Chromium over file://.
var pw = require("/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core");
var path = require("path");

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}

(async function () {
  var browser = await pw.chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"]
  });
  var errors = [];
  var page = await browser.newPage();
  page.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });
  page.on("console", function (m) { if (m.type() === "error") errors.push("console: " + m.text()); });

  var file = "file://" + path.join(__dirname, "index.html");
  // Fragment-only goto() is same-document (no reload), so force a full load.
  async function fresh(suffix) {
    await page.goto(file + (suffix || ""));
    await page.reload();
  }
  async function stubClipboard() {
    await page.evaluate(function () {
      window.__copied = null;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: function (t) { window.__copied = t; return Promise.resolve(); } },
        configurable: true
      });
    });
  }
  async function readCopied() {
    await page.waitForFunction(function () { return window.__copied !== null; }, null, { timeout: 3000 });
    return await page.evaluate(function () { return window.__copied; });
  }

  await fresh("");
  // 1. empty state
  check("empty state visible", await page.locator("#empty").isVisible());
  check("no swatches initially", (await page.locator(".swatch").count()) === 0);
  check("matrix placeholder", (await page.locator("#matrix").innerText()).indexOf("Load a palette") !== -1);

  // 2. sample image -> palette
  await page.click("#sample-btn");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  var n = await page.locator(".swatch").count();
  check("sample gives 6 swatches", n === 6);
  var hexes = await page.locator(".swatch .hex").allInnerTexts();
  check("swatch hexes valid", hexes.every(function (h) { return /^#[0-9a-f]{6}$/.test(h); }));
  check("empty state hidden", !(await page.locator("#empty").isVisible()));

  // 3. matrix renders
  await page.waitForSelector("table.matrix td", { timeout: 5000 });
  var cells = await page.locator("table.matrix td").count();
  check("matrix 6x6 cells", cells === 36);
  var firstCell = await page.locator("table.matrix td").first().innerText();
  check("matrix cell has ratio", /[0-9]+\.[0-9]{2}:1/.test(firstCell));
  check("matrix cell has badge", /(AAA|AA|Fail)/.test(firstCell));

  // 4. pair preview: click swatch as bg, another as text
  await page.click("#slot-bg");
  await page.locator(".swatch .chip").nth(0).click();
  await page.click("#slot-fg");
  await page.locator(".swatch .chip").nth(1).click();
  var out = await page.locator("#nudge-out").innerText();
  check("pair preview shows ratio", /Ratio [0-9.]+:1/.test(out));
  check("nudge button enabled", await page.locator("#nudge-btn").isEnabled());

  // 5. deterministic failing pair via hash, then nudge
  await fresh("#p=999999-ffffff");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  check("hash loads 2 colors", (await page.locator(".swatch").count()) === 2);
  await page.click("#slot-bg");
  await page.locator(".swatch .chip").nth(1).click(); // #ffffff bg
  await page.click("#slot-fg");
  await page.locator(".swatch .chip").nth(0).click(); // #999999 text
  var before = await page.locator("#nudge-out").innerText();
  check("failing pair detected", /Fail/.test(before) && /2\.8[0-9]:1/.test(before));
  await page.click("#nudge-btn");
  var after = await page.locator("#nudge-out").innerText();
  check("nudge reports adjusted hex", /Nudged text to #[0-9a-f]{6}/.test(after));
  check("nudge reaches AA", (function () {
    var m = after.match(/now ([0-9.]+):1/);
    return m && parseFloat(m[1]) >= 4.5;
  })());

  // 6. hash state roundtrip
  await fresh("#p=ff0000-00ff00-0000ff");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  var h3 = await page.locator(".swatch .hex").allInnerTexts();
  check("hash loads 3 colors", h3.length === 3 && h3[0] === "#ff0000");
  check("hash synced to URL", (await page.evaluate(function () { return location.hash; })) === "#p=ff0000-00ff00-0000ff");

  // 7. export: PNG download fires
  var dl = page.waitForEvent("download", { timeout: 5000 }).catch(function () { return null; });
  await page.click("#exp-png");
  var d = await dl;
  check("PNG download fires", !!d);
  check("export note set", (await page.locator("#exp-out").innerText()).indexOf("PNG strip") !== -1);

  // 8. export copy buttons with stubbed clipboard
  await stubClipboard();
  await page.click("#exp-css");
  var cssClip = await readCopied();
  check("CSS copied to clipboard", cssClip.indexOf("--palette-1: #ff0000;") !== -1 && cssClip.indexOf(":root {") === 0);
  await page.evaluate(function () { window.__copied = null; });
  await page.click("#exp-tailwind");
  var twClip = await readCopied();
  check("Tailwind copied to clipboard", twClip.indexOf("1: '#ff0000'") !== -1);
  await page.evaluate(function () { window.__copied = null; });
  await page.click("#exp-json");
  var jsonClip = await readCopied();
  check("JSON copied to clipboard", jsonClip.indexOf("#ff0000") !== -1);
  check("copy note set", (await page.locator("#exp-out").innerText()).indexOf("copied") !== -1);

  // 9. dark toggle
  await page.click("#theme-btn");
  check("dark class applied", await page.evaluate(function () { return document.body.classList.contains("dark"); }));
  check("theme button label flips", (await page.locator("#theme-btn").innerText()).indexOf("dark") !== -1);

  // 10. remove swatch
  await fresh("#p=ff0000-00ff00");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  await page.locator(".swatch .mini button").nth(1).click(); // remove on first swatch
  await page.waitForTimeout(300);
  check("remove leaves 1 swatch", (await page.locator(".swatch").count()) === 1);
  check("hash updated after remove", (await page.evaluate(function () { return location.hash; })) === "#p=00ff00");

  // 11. kcount re-extract
  await fresh("");
  await page.click("#sample-btn");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  await page.fill("#kcount", "4");
  await page.click("#reextract-btn");
  await page.waitForTimeout(500);
  check("re-extract to 4 colors", (await page.locator(".swatch").count()) === 4);

  // 12. eyedropper adds a color
  await page.click("#eyedrop-btn");
  check("eyedropper toggles on", (await page.locator("#eyedrop-btn").innerText()).indexOf("on") !== -1);
  var beforeN = await page.locator(".swatch").count();
  await page.locator("#srcimg").click({ position: { x: 40, y: 40 } });
  await page.waitForTimeout(300);
  var afterN = await page.locator(".swatch").count();
  check("eyedropper adds swatch", afterN === beforeN + 1);

  // 13. review fixes: keyboard chips, BG/Text tags, floored ratios, hash cap
  await fresh("#p=ff0000-00ff00");
  await page.waitForSelector(".swatch .chip", { timeout: 5000 });
  check("chips are buttons", await page.evaluate(function () {
    return document.querySelector(".swatch .chip").tagName === "BUTTON";
  }));
  check("chip aria-label has hex and role", await page.evaluate(function () {
    var l = document.querySelector(".swatch .chip").getAttribute("aria-label");
    return /#ff0000/.test(l) && /(background|text)/.test(l);
  }));
  await page.click("#slot-bg");
  await page.locator(".swatch .chip").nth(0).click();
  check("bg chip gets BG tag", await page.evaluate(function () {
    var c = document.querySelectorAll(".swatch .chip")[0];
    return c.classList.contains("is-bg") && c.textContent.indexOf("BG") !== -1;
  }));
  await page.click("#slot-fg");
  await page.locator(".swatch .chip").nth(1).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("keyboard Enter sets fg chip", await page.evaluate(function () {
    var c = document.querySelectorAll(".swatch .chip")[1];
    return c.classList.contains("is-fg") && c.textContent.indexOf("Text") !== -1;
  }));

  // 14. ratios floor instead of rounding up (2.849 must read 2.84, not 2.85)
  await fresh("#p=999999-ffffff");
  await page.waitForSelector("table.matrix td", { timeout: 5000 });
  var ratioCell = await page.locator("table.matrix td").nth(1).innerText();
  check("matrix ratio floored", ratioCell.indexOf("2.84:1") !== -1);

  // 15. long hash capped at 12
  var many = "#p=" + new Array(17).join("ff0000-").slice(0, -1);
  await fresh(many);
  await page.waitForSelector(".swatch", { timeout: 5000 });
  check("long hash capped at 12 swatches", (await page.locator(".swatch").count()) === 12);

  // 16. add nudged color works end to end
  await fresh("#p=999999-ffffff");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  await page.click("#slot-bg");
  await page.locator(".swatch .chip").nth(1).click(); // #ffffff bg
  await page.click("#slot-fg");
  await page.locator(".swatch .chip").nth(0).click(); // #999999 text
  await page.click("#nudge-btn");
  await page.waitForFunction(function () { return !document.getElementById("nudge-add").disabled; }, null, { timeout: 3000 });
  check("no stale text tag after nudge", await page.evaluate(function () {
    return document.querySelectorAll(".swatch .chip.is-fg").length === 0;
  }));
  var beforeAdd = await page.locator(".swatch").count();
  var nudgeTxt = await page.locator("#nudge-out").innerText();
  var nm = nudgeTxt.match(/Nudged text to (#[0-9a-f]{6})/);
  check("nudge produced an adjusted hex", !!nm);
  await page.click("#nudge-add");
  await page.waitForTimeout(300);
  var afterAddHexes = await page.locator(".swatch .hex").allInnerTexts();
  check("add nudged color grows palette", afterAddHexes.length === beforeAdd + 1);
  check("palette contains the nudged hex", nm && afterAddHexes.indexOf(nm[1]) !== -1);

  // 17. keyboard focus survives chip activation
  await fresh("#p=ff0000-00ff00");
  await page.waitForSelector(".swatch .chip", { timeout: 5000 });
  await page.locator(".swatch .chip").nth(0).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("focus stays on a chip after Enter", await page.evaluate(function () {
    var a = document.activeElement;
    return !!(a && a.classList && a.classList.contains("chip"));
  }));

  // 18. editing a swatch to an existing hex is rejected
  await fresh("#p=ff0000-00ff00");
  await page.waitForSelector(".swatch", { timeout: 5000 });
  var seenDialogs = [];
  page.on("dialog", async function (d) {
    seenDialogs.push(d.type());
    if (d.type() === "prompt") await d.accept("00ff00");
    else await d.dismiss();
  });
  await page.locator(".swatch .mini button").nth(0).click(); // edit first swatch
  await page.waitForTimeout(400);
  var hexesDup = await page.locator(".swatch .hex").allInnerTexts();
  check("duplicate edit rejected with alert", seenDialogs.indexOf("alert") !== -1);
  check("palette unchanged after duplicate edit",
    hexesDup.length === 2 && hexesDup[0] === "#ff0000" && hexesDup[1] === "#00ff00");

  check("zero console/page errors", errors.length === 0);
  if (errors.length) console.error(errors.join("\n"));

  await browser.close();
  console.log(pass + "/" + (pass + fail) + " UI checks passed");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error("HARNESS ERROR: " + e.message); process.exit(1); });
