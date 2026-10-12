import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { tokens, color, cssVar, paletteColor } from '../dist/tokens.js';
import { arcPath, labelArcPath, polar, ringSegmentPath, valueToAngle, roman, formatNumber, inkDefs, inkSprite } from '../dist/ink.js';
import * as index from '../dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (p) => readFileSync(join(root, 'dist', p), 'utf8');

test('dist is in sync with src', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), '--check'], { stdio: 'pipe' });
});

test('every file named in package exports exists', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const [key, target] of Object.entries(pkg.exports)) {
    const paths = typeof target === 'string' ? [target] : Object.values(target);
    for (const p of paths) {
      if (p.includes('*')) {
        const dir = join(root, dirname(p));
        assert.ok(existsSync(dir) && readdirSync(dir).length > 0, `${key} → ${p} matches nothing`);
        continue;
      }
      assert.ok(existsSync(join(root, p)), `${key} → ${p} is missing`);
    }
  }
  for (const f of ['palettes/grow.css', 'palettes/iso.css', 'fonts/eb-garamond-latin-wght-normal.woff2']) {
    assert.ok(existsSync(join(root, 'dist', f)), f);
  }
});

test('both themes define the same colour names', () => {
  assert.deepEqual(Object.keys(tokens.themes.dark).sort(), Object.keys(tokens.themes.paper).sort());
});

test('colours from the Claude Design files are the paper theme', () => {
  assert.equal(color('paper'), '#dccfae');
  assert.equal(color('ink'), '#33291c');
  assert.equal(color('rust'), '#9c4a2f');
  assert.equal(color('accent'), '#9c4a2f');
  assert.equal(color('ink-muted'), 'rgba(51, 41, 28, 0.7)');
  assert.equal(color('ink-muted', 'dark'), 'rgba(230, 216, 184, 0.7)');
  assert.throws(() => color('nope'), /Unknown colour token/);
  assert.throws(() => color('ink', 'sepia'), /Unknown theme/);
});

test('variants replace paper, ink and pigments in both themes', () => {
  assert.equal(color('paper', 'paper', 'tide'), '#d9d7cd');
  assert.equal(color('rust', 'dark', 'tide'), '#d3899b');
  assert.equal(color('ink-muted', 'paper', 'tide'), 'rgba(31, 42, 53, 0.7)');
  assert.equal(paletteColor('tide', 'mood-low', 'paper', 'tide'), '#46627f');
  const css = dist('variants/tide.css');
  assert.match(css, /:root,\n\.cx-theme-paper \{[^}]*--cx-paper: #d9d7cd;/);
  assert.match(css, /:root\[data-theme="dark"\],\n\.cx-theme-dark \{[^}]*--cx-paper: #1a2027;/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.throws(() => color('ink', 'paper', 'nope'), /Unknown theme/);
});

test('palettes resolve onto pigments in both themes', () => {
  assert.equal(paletteColor('grow', 'nutrient-bio-grow'), color('leaf'));
  assert.equal(paletteColor('iso', 'zone-tendon', 'dark'), color('amber', 'dark'));
  assert.throws(() => paletteColor('grow', 'prefix'), /Unknown palette role/);
  const growCss = dist('palettes/grow.css');
  assert.match(growCss, /--grow-nutrient-bio-bloom: var\(--cx-rust\);/);
  assert.match(dist('palettes/iso.css'), /--iso-zone-capacity: var\(--cx-olive\);/);
});

test('css: every var(--cx-*) used by components is defined in tokens.css', () => {
  const defined = new Set([...dist('tokens.css').matchAll(/(--cx-[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...dist('components.css').matchAll(/var\((--cx-[\w-]+)/g)].map((m) => m[1]));
  // set per element by the author, with a fallback in the component
  const local = new Set(['--cx-value', '--cx-cols', '--cx-swatch', '--cx-spine', '--cx-highlight', '--cx-edge', '--cx-fill', '--cx-hatch', '--cx-lift', '--cx-btn-room']);
  const missing = [...used].filter((u) => !defined.has(u) && !local.has(u));
  assert.deepEqual(missing, []);
});

test('css: derived tokens are re-declared where the theme can switch', () => {
  const css = dist('tokens.css');
  assert.match(css, /:root,\n\[data-theme\],\n\.cx-theme-paper,\n\.cx-theme-dark \{[^}]*--cx-ink-muted: color-mix/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\)/);
});

test('css: components never style bare elements outside .cx', () => {
  const css = dist('components.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
  for (const sel of selectors) {
    for (const part of splitTopLevel(sel)) {
      if (/^(from|to|\d+%)$/.test(part)) continue;
      assert.match(part, /\.cx|^textarea\.cx-input/, `unscoped selector: ${part}`);
    }
  }
});

test('polar: 0° is 12 o\'clock, clockwise', () => {
  assert.deepEqual(polar(100, 100, 50, 0), { x: 100, y: 50 });
  assert.deepEqual(polar(100, 100, 50, 90), { x: 150, y: 100 });
  assert.deepEqual(polar(100, 100, 50, 180), { x: 100, y: 150 });
});

test('arcPath: large-arc flag and full circle', () => {
  assert.equal(arcPath(0, 0, 10, 0, 90), 'M0 -10 A10 10 0 0 1 10 0');
  assert.match(arcPath(0, 0, 10, 0, 270), / 0 1 1 /);
  const full = arcPath(0, 0, 10, 0, 360);
  assert.equal((full.match(/A/g) || []).length, 2);
});

test('labelArcPath keeps text upright on the lower half', () => {
  assert.equal(labelArcPath(0, 0, 10, 0, 90), arcPath(0, 0, 10, 0, 90));
  assert.equal(labelArcPath(0, 0, 10, 135, 225), 'M-7.07 7.07 A10 10 0 0 0 7.07 7.07');
});

test('ringSegmentPath closes the band', () => {
  const d = ringSegmentPath(0, 0, 8, 10, 0, 90);
  assert.ok(d.startsWith('M0 -10'));
  assert.ok(d.endsWith('Z'));
});

test('valueToAngle maps and clamps', () => {
  assert.equal(valueToAngle(1, 1, 83), 0);
  assert.equal(valueToAngle(83, 1, 83), 360);
  assert.equal(valueToAngle(200, 1, 83), 360);
  assert.equal(valueToAngle(75, 0, 150, -135, 270), 0);
  assert.equal(valueToAngle(5, 5, 5, 12), 12);
});

test('roman numerals', () => {
  assert.equal(roman(1), 'I');
  assert.equal(roman(4), 'IV');
  assert.equal(roman(7), 'VII');
  assert.equal(roman(2026), 'MMXXVI');
  assert.throws(() => roman(0), RangeError);
  assert.throws(() => roman(1.5), RangeError);
});

test('formatNumber: decimal comma, real minus', () => {
  assert.equal(formatNumber(1.18, 2), '1,18');
  assert.equal(formatNumber(-6), '−6');
  assert.equal(formatNumber(4.1, 1, { sign: true }), '+4,1');
  assert.equal(formatNumber(4180), '4.180');
});

test('hand-drawn borders only switch on under .cx-inked and have an edge colour', () => {
  const css = dist('components.css');
  assert.match(css, /\.cx-inked :is\([^)]*\.cx-btn[^)]*\)::after \{[^}]*filter: url\(#cx-ink-line\)/);
  assert.doesNotMatch(css.replace(/\.cx-inked[^{]*\{[^}]*\}/g, ''), /url\(#cx-ink-line\)/);
  assert.match(css, /\.cx-band--ok \{\s*--cx-edge:/);
});

test('ink defs contain filter and hatch with the given ids', () => {
  const d = inkDefs({ id: 'a', hatchId: 'b', seed: 3 });
  assert.match(d, /<filter id="a">/);
  assert.match(d, /seed="3"/);
  assert.match(d, /<pattern id="b"/);
  assert.match(d, /<filter id="a-line"/);
  assert.match(inkSprite(), /^<svg aria-hidden="true"/);
});

test('index re-exports tokens and ink helpers', () => {
  assert.equal(typeof index.color, 'function');
  assert.equal(typeof index.arcPath, 'function');
  assert.equal(cssVar('rust'), 'var(--cx-rust)');
});

function splitTopLevel(selector) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

test('icons: every icon renders as decorative or labelled SVG', async () => {
  const { icon, withIcon, ICON_NAMES, ICONS } = await import('../dist/icons.js');
  assert.ok(ICON_NAMES.length >= 40);
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg class="cx-icon cx-icon--[a-z-]+" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/);
    assert.ok(ICONS[name].length > 10, name);
  }
  assert.match(icon('settings', { label: 'Set "x"' }), /role="img" aria-label="Set &quot;x&quot;"/);
  assert.equal(icon('nope'), '');
  assert.match(withIcon('plus', '<b>'), /<span>&lt;b&gt;<\/span>$/);
  assert.ok(index.icon, 'icon is exported from the package root');
  assert.match(dist('icons.d.ts'), /'arrow-left'/);
  assert.match(dist('components.css'), /\.cx-icon \{/);
});

test('typefaces: every variant brings its own, self-hosted', () => {
  const tokens = JSON.parse(dist('tokens.json'));
  const faces = Object.keys(tokens.typefaces).filter((k) => !k.startsWith('$'));
  for (const f of faces) {
    const css = dist(`typefaces/${f}.css`);
    assert.equal((css.match(/@font-face/g) ?? []).length, 4, f);
    assert.doesNotMatch(css, /https?:/, `${f} must not load from the network`);
  }
  for (const [name, vt] of Object.entries(tokens.variants).filter(([k]) => !k.startsWith('$'))) {
    assert.ok(vt.font, `variant ${name} names its typefaces`);
    const css = dist(`variants/${name}.css`);
    assert.match(css, new RegExp(`@import url\\('\\.\\./typefaces/${vt.font.display}\\.css'\\)`));
    assert.match(css, /--cx-font-display: /);
    assert.match(css, /--cx-font-text: /);
    assert.ok(css.indexOf('@import') < css.indexOf('{'), `${name}: @import must come first`);
  }
  const base = dist('tokens.css');
  assert.match(base, /--cx-font-display: var\(--cx-font-serif\);/);
  assert.match(base, /--cx-font-text: var\(--cx-font-serif\);/);
});

test('a pressed large button sets down into its shadow instead of dragging it along', () => {
  const css = dist('components.css');
  const rule = /\.cx-btn--lg:active \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'rule exists');
  assert.match(rule[1], /--cx-lift: 1px/);
});

test('buttons: a block button leaves room for its own shadow', () => {
  const css = dist('components.css');
  assert.match(css, /\.cx-btn--block \{[^}]*width: calc\(100% - var\(--cx-btn-room\)\)/);
  assert.match(css, /\.cx-btn--lg \{[^}]*--cx-btn-room: calc\(var\(--cx-size-shadow\) \+ 1px\)/);
});

test('compile: the shared compiler reproduces dist/ and compiles custom themes', async () => {
  const { tokensCss, variantCss, contrast, themeBlocks, assertComplete } = await import('../dist/compile.js');
  const t = JSON.parse(dist('tokens.json'));
  const banner = dist('tokens.css').split('\n')[0] + '\n';
  assert.equal(tokensCss(t, { banner }), dist('tokens.css'));
  assert.equal(variantCss(t, 'atelier', t.variants.atelier, { banner }), dist('variants/atelier.css'));
  const paper = structuredClone(t.themes.paper);
  paper.color.paper = '#ffffff';
  assert.match(tokensCss(t, { paper }), /--cx-paper: #ffffff;/);
  assert.equal(themeBlocks(t, t.themes.paper, t.themes.dark).length, 3);
  assert.throws(() => assertComplete(t, { paper: { color: {}, pigment: {} }, dark: t.themes.dark }, 'x'), /x\.paper\.color is missing/);
  assert.equal(contrast('#000000', '#ffffff').toFixed(0), '21');
});

test('atelier variant meets the contrast rules in both themes', async () => {
  const { contrast } = await import('../dist/compile.js');
  const t = JSON.parse(dist('tokens.json'));
  const text = ['rust', 'ochre-ink', 'moss-ink', 'verdigris', 'plum', 'slate'];
  for (const which of ['paper', 'dark']) {
    const s = t.variants.atelier[which];
    assert.ok(contrast(s.color.ink, s.color.paper) >= 7, `${which} ink`);
    for (const [k, v] of Object.entries(s.pigment)) assert.ok(contrast(v, s.color.paper) >= (text.includes(k) ? 4.5 : 3), `${which} ${k}`);
  }
});

test('launchpad variant meets the contrast rules in both themes', async () => {
  const { contrast } = await import('../dist/compile.js');
  const t = JSON.parse(dist('tokens.json'));
  const text = ['rust', 'ochre-ink', 'moss-ink', 'verdigris', 'plum', 'slate'];
  for (const which of ['paper', 'dark']) {
    const s = t.variants.launchpad[which];
    assert.ok(contrast(s.color.ink, s.color.paper) >= 7, `${which} ink`);
    for (const [k, v] of Object.entries(s.pigment)) assert.ok(contrast(v, s.color.paper) >= (text.includes(k) ? 4.5 : 3), `${which} ${k}`);
  }
});

test('pen: every hatching and trembling style draws, the same seed draws the same', async () => {
  const { HATCH_STYLES, TREMBLE_STYLES, hatchSvg, outlineSvg, cleanPen, hatchGap, PEN_DEFAULTS } = await import('../dist/pen.js');
  for (const h of HATCH_STYLES) assert.match(hatchSvg(h, 80, 40, { seed: 7 }), /<g class="ph-[sf]"/, h);
  for (const t of TREMBLE_STYLES) assert.match(outlineSvg(t, 80, 40, { seed: 7 }), /class="pe-[sf]"/, t);
  assert.equal(hatchSvg('cross', 80, 40, { seed: 7 }), hatchSvg('cross', 80, 40, { seed: 7 }));
  assert.notEqual(hatchSvg('cross', 80, 40, { seed: 7 }), hatchSvg('cross', 80, 40, { seed: 8 }));
  assert.deepEqual(cleanPen({ hatch: 'nope', angle: 400, density: 0 }), { ...PEN_DEFAULTS, angle: 90, density: 0.5 });
  assert.equal(hatchGap(1), 3.75);
  assert.match(dist('pen.css'), /\.cx-pen \.pen-art/);
  assert.doesNotMatch(dist('pen.js'), /eval\(|new Function/);
});

test('pen per variant: valid settings, default fills gaps, CSS fallback matches', async () => {
  const { cleanPen, PEN_DEFAULTS } = await import('../dist/pen.js');
  const t = JSON.parse(readFileSync(join(root, 'src/tokens.json'), 'utf8'));
  const { $description, wheel, ...defPen } = t.pen;
  assert.deepEqual(defPen, { ...PEN_DEFAULTS }, 'tokens.pen = PEN_DEFAULTS');
  assert.deepEqual(index.variantPen(), { ...PEN_DEFAULTS });
  for (const name of Object.keys(t.variants).filter((k) => !k.startsWith('$'))) {
    const p = index.variantPen(name);
    assert.deepEqual(cleanPen(p), p, `${name}: pen within range`);
    const own = t.variants[name].pen;
    if (!own) continue;
    const css = dist(`variants/${name}.css`);
    assert.match(css, new RegExp(`--cx-hatch-angle: ${own.angle}deg`), `${name} angle`);
    if (own.lift !== undefined) assert.match(css, new RegExp(`--cx-size-shadow: ${own.lift}px`), `${name} lift`);
  }
  assert.throws(() => index.variantPen('nope'));
});

test('wheel hatching per variant: complete, valid styles, own seed', async () => {
  const { HATCH_STYLES, TREMBLE_STYLES } = await import('../dist/pen.js');
  const t = JSON.parse(readFileSync(join(root, 'src/tokens.json'), 'utf8'));
  for (const name of [undefined, ...Object.keys(t.variants).filter((k) => !k.startsWith('$'))]) {
    const w = index.variantWheelHatch(name);
    assert.deepEqual(Object.keys(w).sort(), ['amount', 'angle', 'density', 'hatch', 'rim', 'seed', 'tremble'], String(name));
    assert.ok(HATCH_STYLES.includes(w.hatch), `${name} hatch`);
    assert.ok(['current', 'all'].includes(w.rim), `${name} rim`);
    assert.ok([...TREMBLE_STYLES, 'filter'].includes(w.tremble), `${name} tremble`);
    assert.equal(w.seed, index.variantPen(name).seed);
  }
});

test('pen: strokeSvg trembles any line in every style', async () => {
  const { TREMBLE_STYLES, strokeSvg } = await import('../dist/pen.js');
  const arc = Array.from({ length: 40 }, (_, i) => [100 + 80 * Math.cos(i / 10), 100 + 80 * Math.sin(i / 10)]);
  for (const t of TREMBLE_STYLES) {
    assert.match(strokeSvg(t, arc, { seed: 3 }), /class="pe-[sf]"/, t);
    assert.match(strokeSvg(t, arc, { seed: 3, closed: true }), /class="pe-[sf]"/, `${t} closed`);
    assert.doesNotMatch(strokeSvg(t, arc, { seed: 3 }), /NaN/, t);
  }
  assert.equal(strokeSvg('sketch', arc, { seed: 3 }), strokeSvg('sketch', arc, { seed: 3 }));
  assert.match(strokeSvg('brush', arc, { dashed: true }), /stroke-dasharray/);
  assert.equal(strokeSvg('quill', [[0, 0]]), '');
});
