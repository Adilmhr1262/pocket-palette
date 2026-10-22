# Pocket Palette

A single-file, offline color tool. Drop in any image to pull out its dominant
colors, then check every color pair for readable contrast.

Everything runs in your browser. No libraries, no uploads, no build step.

## What it does

1. **Palette extraction** — Drag, paste, or pick an image. It is drawn to an
   off-screen canvas, downscaled, and clustered with a small k-means routine
   written in plain JavaScript. You get 3 to 10 dominant colors (adjustable,
   default 6); very flat images may yield fewer.
2. **Contrast matrix** — Every color is paired against every other and scored
   with the WCAG contrast ratio, labeled AAA, AA, AA large, or Fail. Each cell shows the
   pair rendered as real text on a real background. Ratios are floored, never
   rounded up. Rows are backgrounds, columns are text.
3. **Pair preview** — Click (or Tab to and press Enter on) any two swatches to preview them in a mini card
   with a headline and body copy; the active background and text swatches are tagged. If the pair fails, the nudge button shifts
   the text color's lightness just far enough to reach AA and shows the
   adjusted hex, which you can add straight into the palette.
4. **Export** — Copy the palette as CSS custom properties, a Tailwind color
   object, or JSON. If the browser blocks the clipboard, the text is shown
   for manual copying instead. A download button saves a PNG swatch strip.
5. **Eyedropper and manual edit** — Click a point on the loaded image to add
   that exact pixel color, edit any hex by hand, or remove a swatch. The
   palette is stored in the URL hash, so it can be bookmarked or shared as a
   link (colors only, never the image).
6. **Light/dark preview** — A toggle flips the page chrome between light and
   dark. The pair colors themselves never change, so it shows the page
   around the palette in both modes.

## How to run

Open `index.html` in any modern browser. That is it.

Or serve it locally:

```
npx serve .
```

then open the printed address.

## How to use

- Click the drop zone (or drag / paste an image) to extract a palette. No
  image handy? Press "Use a sample image".
- Click swatches with the Background / Text slot buttons to set the pair,
  then read the ratio and nudge to AA if needed.
- Export buttons copy to the clipboard; the PNG button downloads a strip.

## Verification

The contrast math is checked against known values (black on white is exactly
21:1). The k-means extraction is seeded, so the same image always gives the
same palette. The test suite covers 109 checks:

```
node engine-tests.js   # color math, k-means, nudge, hash, export builders
node ui-tests.js       # headless Chromium: load, extract, matrix, pair,
                       # nudge, export, eyedropper, hash roundtrip
```

`ui-tests.js` needs the Playwright Chromium build used by the other projects
in this workspace.

## Files

- `index.html` — the whole app: markup, styles, and script
- `engine-tests.js` — pure-function tests run in node
- `ui-tests.js` — browser tests run in headless Chromium
- `screenshot.png` — the app with a sample palette loaded
