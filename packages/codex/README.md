# @rafime/codex

**Iron-gall ink on laid paper.** Codex is the design system behind Rafime's
apps (Notebook, Tide, Compass, Grow Journal, ISO Coach): warm paper, a serif
voice, hand-drawn lines and hatched shadows — instruments instead of
interfaces.

It is framework-free. You get CSS variables and `cx-` classes for the look,
plus a handful of tiny JS helpers for icons, colours, dials and the
trembling ink line. It works in plain HTML, any framework, a Vite app or a
Home Assistant card, and it runs offline (fonts are self-hosted).

```sh
npm install @rafime/codex
```

```ts
import '@rafime/codex/all.css';
```

```html
<body class="cx">
  <article class="cx-sheet cx-sheet--phone">
    <div class="cx-sheet__head">
      <span class="cx-eyebrow">Today</span>
      <span class="cx-meta">Week 38 · Thursday</span>
    </div>
    <div class="cx-display">
      <span class="cx-display__value">7,5</span>
      <span class="cx-display__unit">hours of sleep</span>
    </div>
    <button class="cx-btn cx-btn--solid cx-btn--block">Add check-in</button>
  </article>
</body>
```

That's a finished, themed card — light and dark included. Everything below
is about going further.

**See it all live:** `npm run example -w @rafime/codex` opens the specimen
([`examples/specimen`](examples/specimen)) — every building block, all
icons and colours, with switches for variant, theme and ink. The journal
wheel has its own page: `npm run example -w @rafime/wheel`.

- [Recipes: the things people usually need](#recipes)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference): files, building blocks, icons, tokens, rules
- [Developing Codex](#developing-codex)

---

## Recipes

### 1. Style a whole page or app

Load `all.css` (fonts + tokens + base + components) and put `class="cx"` on
`<body>`. Then compose sheets:

```html
<article class="cx-sheet">
  <div class="cx-sheet__head">
    <span class="cx-eyebrow">Plan</span>
    <span class="cx-meta">updated 09:40</span>
  </div>

  <h2 class="cx-title">Evening routine</h2>
  <p class="cx-body">Three small steps, in this order.</p>

  <ol class="cx-steps">
    <li class="is-done">Lights down</li>
    <li>Phone in the other room</li>
    <li>Ten pages of a book</li>
  </ol>

  <div class="cx-btn-row">
    <button class="cx-btn cx-btn--solid">Start</button>
    <button class="cx-btn cx-btn--quiet">Later</button>
  </div>
</article>
```

Every sheet follows one rule: **the answer on top, the controls below.**
Start with the one number or sentence someone acts on (`cx-display`,
`cx-title`, `cx-band`), then the details.

### 2. Light and dark mode

Nothing to do: without a `data-theme`, Codex follows the operating system.
To give people a switch, set the attribute on `<html>`:

```ts
const setTheme = (t: 'light' | 'dark' | null) =>
  t ? (document.documentElement.dataset.theme = t) : delete document.documentElement.dataset.theme;
```

Need a paper card inside a dark page (or the other way round)? Put
`cx-theme-paper` or `cx-theme-dark` on the container.

### 3. Show the number that matters

```html
<!-- one big answer -->
<div class="cx-display">
  <span class="cx-display__value cx-num">45</span>
  <span class="cx-display__unit">days to go<br>around 11 October</span>
</div>
<div class="cx-progress" style="--cx-value: .46" role="progressbar"
     aria-valuenow="46" aria-valuemin="0" aria-valuemax="100" aria-label="Progress"></div>
<div class="cx-progress__scale"><span>Day 1</span><span>46 %</span><span>Day 83</span></div>

<!-- target vs. actual -->
<div class="cx-figures">
  <div class="cx-figure cx-figure--target"><span class="cx-figure__value">24,0 °</span><span class="cx-label">target</span></div>
  <div class="cx-figure"><span class="cx-figure__value">26,4 °</span><span class="cx-label">now</span></div>
</div>

<!-- label ········ value -->
<ul class="cx-leaders">
  <li class="cx-leader"><span class="cx-leader__label">Last check-in</span><span class="cx-leader__value">2 days ago</span></li>
  <li class="cx-leader cx-leader--attention"><span class="cx-leader__label">Streak broken</span><span class="cx-leader__value">day 9</span></li>
</ul>

<!-- a status box -->
<div class="cx-band cx-band--ok">
  <div class="cx-band__head"><span>Big tent</span><span class="cx-band__status">in range</span></div>
  <div class="cx-band__value">1,18 <small>kPa · target 1,0–1,3</small></div>
</div>
```

`cx-band--offline` for "no data" (dashed — a missing sensor never shows
"0"), `cx-band--attention` for "act now".

### 4. Buttons, chips and a colour for one element

```html
<div class="cx-btn-row">
  <button class="cx-btn cx-btn--solid">Save</button>          <!-- one per sheet -->
  <button class="cx-btn">Export</button>
  <button class="cx-btn cx-btn--attention">Delete</button>
  <button class="cx-btn cx-btn--quiet">Cancel</button>        <!-- no fill, no shadow -->
</div>

<div class="cx-chips" role="group" aria-label="Filter">
  <button class="cx-chip" aria-pressed="true">all</button>
  <button class="cx-chip" aria-pressed="false">sleep</button>
  <span class="cx-chip">a label, not clickable</span>
</div>
```

Buttons and chips are little cards with a **hatched shadow** offset to the
bottom right; hover lifts them, pressing sinks them into it. To colour one,
set variables instead of `background` (a plain `background` sits square
inside the hand-drawn edge):

```css
.chip-care[aria-pressed='true'] { --cx-fill: var(--tide-care); --cx-edge: var(--tide-care); }
.big-cta { --cx-hatch: color-mix(in srgb, var(--cx-rust) 50%, transparent); --cx-lift: 6px; }
```

`--cx-fill` surface · `--cx-edge` border · `--cx-hatch` shadow hatching ·
`--cx-lift` offset. Give any element of your own the same shadow with
`cx-hatched`; `a.cx-entry` / `button.cx-entry` are clickable cards that lift
on hover.

### 5. Forms

```html
<div class="cx-field">
  <label class="cx-field__label" for="note">Note</label>
  <input class="cx-input" id="note" placeholder="optional">
  <span class="cx-field__hint">Only you can read this.</span>
</div>

<div class="cx-field cx-field--error">
  <label class="cx-field__label" for="hours">Hours slept</label>
  <input class="cx-input cx-num" id="hours" inputmode="decimal" value="25">
  <span class="cx-field__hint">Between 0 and 24.</span>
</div>

<input class="cx-range" type="range" min="-3" max="3" aria-label="Mood">
```

Inputs are a line on the sheet, not a box.

### 6. Icons next to words

```ts
import { icon, withIcon } from '@rafime/codex';

button.innerHTML = `${icon('plus')}Add stage`;              // decorative, aria-hidden
button.innerHTML = withIcon('download', userProvidedLabel); // the text is escaped
gear.innerHTML = icon('settings', { label: 'Settings' });   // icon alone → give it a name
```

In static HTML, write placeholders and swap them once:

```html
<button class="cx-btn"><i data-icon="calendar"></i><span>Pick dates</span></button>
```

```ts
// in the page's entry script
import { applyIcons } from '@rafime/codex';
applyIcons(document); // every <i data-icon="…"> becomes its SVG
```

Keep the placeholder *beside* a translated `<span>`, never inside it, so
swapping the text doesn't wipe the icon.

Icons are 24×24 line drawings in `currentColor`, so they follow the text
colour and the theme. They sit **beside** words and never replace them.
All names are listed under [Icons](#icons).

### 7. Give your app its own look

Apps share Codex and differ by two stylesheets, loaded after `codex.css`:

- a **variant** swaps the base colours (paper, ink, accent, all pigments)
  *and* the typefaces;
- a **palette** adds your app's own colour roles (`--tide-mood-low`,
  `--compass-area-work` …).

```ts
import '@rafime/codex/codex.css';
import '@rafime/codex/base.css';
import '@rafime/codex/variants/compass.css';  // sage paper, forest ink, copper accent
import '@rafime/codex/palettes/compass.css';
```

| Variant | Mood | Typefaces |
| --- | --- | --- |
| *(default)* | warm parchment, iron-gall ink, rust | EB Garamond |
| `tide` | cool grey linen, blue-black ink, mulberry | Literata |
| `compass` | sage paper, forest-green ink, copper-coral | Newsreader |
| `grow` | hemp paper & chlorophyll | Fraunces + Hanken Grotesk |
| `atelier` | apricot paper, umber-violet ink, ultramarine | Fraunces + Literata |
| `launchpad` | star-chart blue paper, indigo ink, gold leaf; night-blue sky | EB Garamond + Hanken Grotesk |

A variant brings its own fonts, so you don't need `fonts.css` with it.

**A palette of your own** – in `src/tokens.json` under `palettes`, map roles
onto pigments, then `npm run build`:

```json
"sleeplog": { "prefix": "sleep", "deep": "pigment.plum", "light": "pigment.slate", "awake": "pigment.amber" }
```

That produces `dist/palettes/sleeplog.css` with `--sleep-deep` and friends.
Because roles point at pigments, they are correct in both themes and every
variant.

**A variant of your own** – add `variants.<name>` to `src/tokens.json`
(`paper` and `dark`, each with the full `color` set and all 13 `pigment`s;
`rust` is the accent) and optionally a `font`. Check contrast against the
paper in both themes: ink ≥ 7, text pigments ≥ 4.5, marks and lines ≥ 3.
Or mix one in the Atelier app (`apps/atelier` in rafime-apps): it derives
the pigments from paper, ink and accent, checks every contrast and exports
the result as one compiled CSS file.

**The drawn shadow** – buttons, chips and `.cx-hatched` cards cast pen
hatching. Its ink is `--cx-shade` / `--cx-shade-strong` (per theme); its
lines come from the `hatch` tokens (`--cx-hatch-angle`, `--cx-hatch-width`,
`--cx-hatch-gap`) and how far it falls from `--cx-size-shadow` /
`--cx-size-shadow-sm`. Override them on any element to change the hatching
there.

**The pen** – `@rafime/codex/pen` draws every edge and every hatched
shadow with a seeded hand (SVG, CSP-safe). Import `pen.css` and run it over
a container; the CSS hatching stays as the fallback:

```ts
import { createPen } from '@rafime/codex/pen';
import '@rafime/codex/pen.css';

const pen = createPen(document.body, { hatch: 'cross', tremble: 'sketch', amount: 1, density: 1, angle: -45, seed: 42 });
pen.set({ angle: 30 }); pen.boil(true); pen.activate(false);
```

Every variant has its own hand in `tokens.json` (`pen` for the default,
`variants.<name>.pen`), read with `variantPen()`; the variant CSS sets the
matching CSS hatching, so the page looks right before the pen runs:

```ts
import { variantPen } from '@rafime/codex';
createPen(document.body, variantPen('tide'));   // apps: createApp({ pen: variantPen('tide') })
```

| Variant | Hatching | Edges | amount · density · angle | lift | Wheel periods |
| --- | --- | --- | --- | --- | --- |
| *(default)* | diagonal | quill | 1 · 1 · −45° | 4 px | diagonal + quill, current |
| `tide` | waves | quill | 0.7 · 1.15 · −30° | 4 px | waves + quill, all |
| `compass` | engrave | sketch | 0.85 · 1.2 · −40° | 5 px | engrave + sketch, current |
| `grow` | diagonal | brush | 0.8 · 1.1 · −60° | 4 px | engrave + quill, current |
| `atelier` | cross | sketch | 1.1 · 1 · −45° | 5 px | cross + sketch, current |
| `launchpad` | stipple | tremor | 0.55 · 1.35 · −45° | 4 px | stipple + tremor, current |

The last column is `pen.wheel` (hatch, density, angle, amount, `rim`, `tremble` for its lines): how
[`@rafime/wheel`](../wheel/README.md) hatches periods, read with
`variantWheelHatch()`.

A variant's `pen` takes `hatch`, `tremble`, `amount`, `density`, `angle`,
`seed` and, for the CSS side, `width`, `lift`, `liftSm` (px).

`strokeSvg(style, points, { seed, amount, closed, dashed })` trembles any
polyline (arcs, circles) in one of the trembling styles.

Hatching: `diagonal cross stipple scribble engrave contour hachure waves mixed`;
trembling: `steady quill sketch tremor brush dry mixed`. Per element,
`data-pen-hatch` / `data-pen-tremble` / `data-pen-amp` override, `data-pen-fill`
hatches the face, `data-pen-always` draws even while the pen is off.
Each element's hand follows its place under the root, so an element that is
re-rendered in place keeps its drawing; `data-pen-seed="…"` pins it.
`createPen(root, settings, { shadows: '.my-btn, .my-card' })` also draws the
hatched shadow of an app's own raised elements (face and edge stay theirs;
hide their CSS shadow under `.cx-pen`).

**Compiling in code** – `@rafime/codex/compile` holds the pure functions
`scripts/build.mjs` uses (`tokensCss`, `variantCss`, `themeBlocks`,
`fontFaceCss`, `contrast` …). They run in Node and in the browser, so a
custom theme compiles to exactly what the build would produce:

```ts
import tokens from '@rafime/codex/tokens.json';
import { tokensCss, contrast } from '@rafime/codex/compile';

const css = tokensCss(tokens, { paper: myPaperSheet, dark: myNightSheet });
contrast('#2f47a0', '#e6ccb0');             // 5.39
```

### 8. Colours in JavaScript, canvas and SVG

```ts
import { color, paletteColor, cssVar } from '@rafime/codex';

color('rust');                              // "#9c4a2f"
color('ink-muted', 'dark');                 // "rgba(230, 216, 184, 0.7)"
color('rust', 'dark', 'tide');              // accent of the Tide variant at night
paletteColor('tide', 'mood-low');           // a role, resolved to a colour
cssVar('rust');                             // "var(--cx-rust)" – for SVG attributes
```

Use `cssVar()` whenever the result lives in the DOM (it keeps following the
theme); use `color()` for canvas, exported images and anything without CSS.

### 9. Hand-drawn lines

```ts
import { installInk } from '@rafime/codex';
installInk(); // once per page
```

From then on the edges of sheets, buttons, chips, tiles, bands and callouts
tremble slightly, like ink on paper — fill, edge and hatching move together.
Your own elements join in with `class="cx-drawn"` (edge colour from
`--cx-edge`). Without `installInk()` the lines stay straight.

### 10. Draw a dial, a ring or a gauge

```ts
import { inkSprite, arcPath, labelArcPath, ringSegmentPath, valueToAngle, roman } from '@rafime/codex/ink';

document.body.insertAdjacentHTML('afterbegin', inkSprite()); // once per page: ink filter + hatch
const a = (day: number) => valueToAngle(day - 1, 0, 83);      // day → degrees

svg.classList.add('cx-diagram');
svg.innerHTML = `
  <path d="${ringSegmentPath(160, 160, 128, 150, a(36), a(50))}" fill="url(#cx-hatch)" class="cx-ink"/>
  <path id="stretch" d="${labelArcPath(160, 160, 136, a(36), a(50))}" fill="none"/>
  <text><textPath href="#stretch" startOffset="50%" text-anchor="middle">STRETCH</textPath></text>
  <text x="160" y="170" text-anchor="middle">${roman(6)}</text>`;
```

0° is twelve o'clock, angles run clockwise. `class="cx-ink"` inside an
`svg.cx-diagram` applies the ink filter. For a full calendar wheel with
lanes, dragging and periods, use **[`@rafime/wheel`](../wheel/README.md)**.

### 11. Add Codex to an app that already has its own CSS

`codex.css` never styles bare elements — everything hangs on `cx-` classes
or sits under `.cx`. So load it without `base.css` and move over one view at
a time:

```ts
import '@rafime/codex/fonts.css';
import '@rafime/codex/codex.css';
```

```html
<section class="cx"> …new view in Codex… </section>
```

### 12. Inside a Shadow DOM (web components, Home Assistant cards)

`:root` rules don't reach into a shadow root, so inline the CSS and let a
theme class set the variables on the container:

```ts
import css from '@rafime/codex/codex.css?inline';  // Vite
shadow.innerHTML = `<style>${css}</style><div class="cx cx-theme-paper">…</div>`;
```

Load `fonts.css` once in the outer document (`@font-face` doesn't work in a
shadow root). Use `cx-theme-dark` for the night sheet.

### 13. Numbers that read well

```ts
import { formatNumber } from '@rafime/codex';
formatNumber(1.18, 2);             // "1,18"
formatNumber(-3);                  // "−3"   (a real minus sign)
formatNumber(2, 0, { sign: true }); // "+2"
```

Set figures in `cx-num` (tabular digits) and always with their unit.
`formatNumber` uses a decimal comma; for an English UI use
`toLocaleString(locale)` and keep `cx-num`.

---

## Troubleshooting

**Fonts fall back to Georgia / Times.** The `@font-face` rules point at
`dist/fonts/…` relative to the CSS file. Import the CSS through your
bundler (not by copying it somewhere else), or copy `dist/fonts` next to it.
Never load the fonts from a CDN — it breaks offline use and a strict CSP.

**A coloured button looks like a square inside a wobbly edge.** You set
`background`. Use `--cx-fill` (and `--cx-edge`) instead — see recipe 4.

**Shadows disappear under a tinted box.** A tinted container of your own
needs `isolation: isolate` so the hatched shadows stack above its tint
(`cx-band`, `cx-callout`, `cx-entry` and `cx-tile` already do this).

**Dark mode doesn't switch.** Check that `data-theme` is on `<html>` (not
`<body>`), and inside a shadow root use `cx-theme-dark` on the container.

**A colour looks wrong in the dark theme.** You probably used a raw hex
value. Use the token (`var(--cx-moss)`, `var(--tide-care)`) — every pigment
is lightened for the night sheet.

**An icon name isn't there.** Add it to `src/icons.js` (24×24, stroke,
same style) and rebuild; don't inline SVG in an app.

**`npm test` fails with "dist is out of date".** You edited `src/` without
building. Run `npm run build`.

---

## Reference

### Files

```
dist/
  all.css              fonts + tokens + base + components – one import, done
  codex.css            tokens + components, no global styles
  tokens.css           only the variables
  components.css       only the cx- classes
  base.css             optional: body, selection, color-scheme
  fonts.css            EB Garamond, self-hosted – the default typeface
  typefaces/*.css      further typefaces (@font-face), imported by variants
  variants/*.css       colour + type variants: tide, compass, grow, atelier, launchpad
  palettes/*.css       app colour roles: grow, iso, tide, compass, atelier, launchpad
  compile.js / .d.ts   token data → CSS (shared by the build and Atelier), contrast()
  pen.js / .d.ts       the seeded pen: createPen(), hatchSvg(), outlineSvg()
  pen.css              styles for .cx-pen and the drawn SVG
  tokens.js / .d.ts    the same tokens as a JS object, color(), paletteColor(), cssVar()
  ink.js / .d.ts       SVG helpers: ink filter, arcs, ring segments, roman numerals, installInk()
  icons.js / .d.ts     icon(), withIcon(), applyIcons(), ICON_NAMES
```

Entry points: `@rafime/codex` (everything JS), `@rafime/codex/tokens`,
`/ink`, `/icons`, `/tokens.json`, and each CSS file above.

### Building blocks

All of them live, in both themes: `npm run preview` →
<http://localhost:4178/preview/>.

| Class | What for |
| --- | --- |
| `cx-sheet` (`--phone`, `--folio`, `--plain`) | the paper sheet with grain and vignette |
| `cx-sheet__head`, `cx-eyebrow` (`--accent`), `cx-meta` | head line: small caps left, status right |
| `cx-section`, `cx-rule` | sections with a hairline |
| `cx-folio`, `cx-folio__margin` | diagram left, marginal notes right |
| `cx-title` (`--sm`), `cx-subtitle`, `cx-body`, `cx-note`, `cx-label` | type |
| `cx-display` (`--xl`), `__value`, `__unit` | the one big answer |
| `cx-figures`, `cx-figure` (`--target`), `cx-tile` | values with a caption, tiles |
| `cx-leaders`, `cx-leader` (`--attention`, `--muted`) | label ······ value |
| `cx-band` (`--ok`, `--offline`, `--attention`) | status box |
| `cx-callout` (`--attention`, `--draft`), `cx-marginal` | a decision, a note in the margin |
| `cx-steps` (`li.is-done`) | steps numbered in roman numerals |
| `cx-btn` (`--solid`, `--attention`, `--quiet`, `--lg`, `--block`), `cx-btn__sub`, `cx-btn-row`, `cx-btn-grid` | buttons with a drawn shadow |
| `cx-progress` (`--cx-value: 0.42`), `cx-progress__scale` | a thin progress bar |
| `cx-chips`, `cx-chip[aria-pressed]` | filters; `span.cx-chip` is a label without shadow |
| `cx-hatched`, `a/button.cx-entry` | drawn shadow for your own elements, clickable cards |
| `cx-log`, `cx-log__entry` (`--auto`) | a journal: by hand in ink, automatic in rust |
| `cx-entry` (`--cx-spine`, `--open`), `cx-slot` | a record card with a coloured spine, an empty slot |
| `cx-legend`, `cx-swatch` (`--dot`, `--cx-swatch`) | colour key |
| `cx-table` | a small table of figures |
| `cx-field`, `cx-input`, `cx-range` | inputs as a line on the sheet |
| `cx-struck` | discarded, but still legible |
| `cx-diagram`, `.cx-ink` | SVG diagrams with the ink filter |
| `cx-drawn` | any bordered element, drawn by hand (with `installInk()`) |
| `cx-attention`, `cx-ok`, `cx-muted`, `cx-num` | helpers |
| `cx-theme-paper`, `cx-theme-dark` | force a theme on a container |

### Icons

`icon(name, { label?, className?, size? })` returns an SVG string.

- **Actions:** `plus` `check` `close` `edit` `trash` `download` `upload`
  `copy` `settings` `sync` `eye` `undo` `arrow-left` `arrow-right`
- **Things:** `report` `note` `book` `bookmark` `calendar` `clock` `wheel`
  `task` `star` `lock` `shield` `cloud` `device` `globe` `info` `alert`
  `sun` `moon` `image` `camera` `bell` `share` `grid` `help` `play` `pause`
- **Goals:** `target` `flag` `route` `branch` `milestone` `compass`
- **Life:** `heart` `briefcase` `home` `people` `bulb` `sparkle` `leaf`
- **Wellbeing:** `wave` `smile` `bolt` `pill` `cloudrain` `hand` `phone`
- **Growing:** `drop` `flask` `scissors` `ruler` `sprout` `pot` `tent` `flower`

`ICON_NAMES` has the full list at runtime; `IconName` is the TypeScript type.

### Tokens

`src/tokens.json` is the single source. `npm run build` generates everything
in `dist/`.

- **Theme** (`paper`, `dark`): `--cx-paper`, `--cx-ink`, `--cx-ink-line`,
  `--cx-on-ink`, `--cx-ground`, `--cx-shade`, `--cx-paper-raised` and the
  paper texture.
- **Pigments:** `rust`, `ochre`, `amber`, `ochre-ink`, `moss`, `moss-ink`,
  `olive`, `leaf`, `sap`, `verdigris`, `plum`, `sepia`, `slate` —
  lightened on the night sheet.
- **Ink strengths**, mixed from `--cx-ink`: `ink-strong`, `ink-soft`,
  `ink-muted`, `ink-faint`, `line-strong`, `line`, `rule`, `rule-soft`,
  `track`, `wash`.
- **Roles** — reach for these first: `accent`, `attention`, `today`, `ok`,
  `ok-ink`, `auto`, `progress`, `highlight`, `text`.
- **Type:** `--cx-font-display` (titles, big numbers, the wheel) and
  `--cx-font-text` (everything else); `--cx-text-2xs` … `--cx-text-6xl`.
- **Space and size:** `--cx-space-1` … `-7`, `--cx-size-touch` (44 px),
  `--cx-size-shadow` (4 px) / `-sm` (2 px), `--cx-radius-sheet`,
  `--cx-motion-*`.

#### Typefaces

| Typeface | Character | Used by |
| --- | --- | --- |
| `eb-garamond` | iron-gall ink on hand-made paper, the Codex voice | Notebook (default) |
| `literata` | a calm reading face for long, quiet writing | Tide |
| `newsreader` | editorial, clear as a map legend | Compass |
| `fraunces` + `hanken-grotesk` | soft botanical titles, friendly sans for forms | Grow Journal |

A variant picks them in `tokens.json`:
`"font": { "display": "fraunces", "text": "hanken-grotesk", "adjust": "0.45" }`
(`adjust` = `font-size-adjust`, so different faces look the same size).
To add one: the four `woff2` files
(`<name>-latin[-ext]-wght-normal|italic.woff2`, e.g. from
`@fontsource-variable/<name>`) and `OFL-<name>.txt` into `fonts/`, an entry
under `typefaces`, then `npm run build`. SIL OFL fonts only.

### Design rules

1. **The answer on top, the controls below.**
2. **Rust** (`--cx-attention`) means: today, act, off-target, entered
   automatically. Never decoration.
3. **Moss** (`--cx-ok`) means in range. **Dashed** means unknown or still
   open. A missing value never shows "0".
4. **One filled tap target per sheet** (`cx-btn--solid`); everything else is
   outlined.
5. **Numbers** with their unit, a real minus and tabular digits (`cx-num`).
6. **No radius, no soft shadows.** Hierarchy comes from lines, small caps
   and size. What you can touch casts a **drawn shadow**; flat things never do.

---

## Developing Codex

```sh
npm run build     # src/ → dist/
npm test          # node:test, no dependencies; also checks dist/ is up to date
npm run preview   # reference page on http://localhost:4178/preview/
npm run example   # the specimen (examples/specimen), with vite
```

Inside the `rafime-apps` monorepo the package is built on `npm install`.
Versions follow SemVer: new classes or tokens are a minor, renamed or
removed ones a major. Note changes in `CHANGELOG.md`.

## Licences

Code: MIT. Fonts: SIL Open Font License 1.1 — EB Garamond in
`dist/fonts/OFL.txt`; Literata, Newsreader, Fraunces and Hanken Grotesk in
`dist/fonts/OFL-<name>.txt`.
