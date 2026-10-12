/**
 * Codex token data → CSS text. Pure functions, no Node or DOM APIs, so the
 * same code builds dist/ (scripts/build.mjs) and compiles themes in the
 * browser (Atelier). Pass the parsed tokens.json as `tokens`.
 */

/** Drops `$description` and other `$` keys. */
export const strip = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('$')));

export function block(selector, entries, indent = '  ') {
  const body = entries.map(([k, val]) => `${indent}${k}: ${val};`).join('\n');
  return `${selector} {\n${body}\n${indent.slice(2)}}`;
}

/** Custom properties of one theme ({ color, pigment }) as [name, value] pairs. */
export function colorEntries(tokens, theme) {
  const P = tokens.prefix;
  return [...Object.entries(strip(theme.color)), ...Object.entries(strip(theme.pigment))].map(([k, val]) => [`--${P}-${k}`, val]);
}

/** Throws unless `theme` sets every colour and pigment the base themes set. */
export function assertComplete(tokens, theme, label) {
  for (const which of ['paper', 'dark']) {
    for (const group of ['color', 'pigment']) {
      const missing = Object.keys(strip(tokens.themes[which][group])).filter((k) => !(k in (theme[which]?.[group] ?? {})));
      if (missing.length) throw new Error(`${label}.${which}.${group} is missing: ${missing.join(', ')}`);
    }
  }
}

/** The three theme blocks: paper (default), dark explicit, dark following the OS. */
export function themeBlocks(tokens, paper, dark) {
  const P = tokens.prefix;
  const d = colorEntries(tokens, dark);
  return [
    block(`:root,\n.${P}-theme-paper`, colorEntries(tokens, paper)),
    block(`:root[data-theme="dark"],\n.${P}-theme-dark`, d),
    `@media (prefers-color-scheme: dark) {\n${block(`  :root:not([data-theme])`, d, '    ')}\n}`,
  ];
}

/** "pigment.rust" / "color.ink" → "var(--cx-rust)" / "var(--cx-ink)" */
export function ref(tokens, path) {
  const [group, name] = path.split('.');
  if (!['color', 'pigment'].includes(group) || !name) throw new Error(`Bad token reference: ${path}`);
  if (!(name in tokens.themes.paper[group])) throw new Error(`Unknown token: ${path}`);
  return `var(--${tokens.prefix}-${name})`;
}

// Derived tokens reference the theme colours. Custom properties resolve where
// they are declared, so they are re-declared on every element that switches
// theme — otherwise a dark sheet inside a paper page would keep paper alphas.
export const themeScopes = (tokens) => `:root,\n[data-theme],\n.${tokens.prefix}-theme-paper,\n.${tokens.prefix}-theme-dark`;

export function derivedEntries(tokens) {
  const v = (name) => `--${tokens.prefix}-${name}`;
  const alpha = Object.entries(strip(tokens.alpha)).map(([k, a]) => [
    v(k),
    `color-mix(in srgb, var(${v('ink')}) ${Math.round(a * 100)}%, transparent)`,
  ]);
  const semantic = Object.entries(strip(tokens.semantic)).map(([k, path]) => [v(k), ref(tokens, path)]);
  const texture = [
    v('paper-texture'),
    [
      `\n    radial-gradient(56% 40% at 14% 6%, var(${v('paper-glow')}), transparent 70%),`,
      `\n    radial-gradient(36% 28% at 90% 90%, var(${v('paper-shade')}), transparent 72%),`,
      `\n    repeating-linear-gradient(92deg, var(${v('paper-grain')}) 0 1px, transparent 1px 3px)`,
    ].join(''),
  ];
  // Raised faces (buttons, chips): a shade lighter than the sheet, opaque, so
  // the drawn shadow (--cx-shade, per theme) never shows through.
  const surface = [[v('paper-raised'), `color-mix(in srgb, var(${v('paper')}) 90%, #fffdf6)`]];
  return [...alpha, ...semantic, ...surface, texture];
}

export function staticEntries(tokens, overrides = {}) {
  const out = [];
  const groups = ['font', 'text', 'tracking', 'leading', 'space', 'radius', 'size', 'hatch', 'motion'];
  for (const group of groups) {
    for (const [k, val] of Object.entries(strip(tokens[group]))) {
      const name = `${group}-${k}`;
      out.push([`--${tokens.prefix}-${name}`, overrides[name] ?? val]);
    }
  }
  return out;
}

/**
 * tokens.css: theme colours, derived roles, scale. With `paper`/`dark` a
 * whole colour theme is compiled in place of the default one; `scale`
 * overrides static entries by name (e.g. { 'font-display': "'Newsreader', serif" }).
 */
export function tokensCss(tokens, { banner = '', paper = tokens.themes.paper, dark = tokens.themes.dark, scale = {}, labels } = {}) {
  const [p, d, media] = themeBlocks(tokens, paper, dark);
  const l = { paper: 'Theme: paper (default)', dark: 'Theme: dark — explicit', media: 'Theme: dark — follows the OS when the page sets no data-theme', ...labels };
  return [
    banner,
    `/* ${l.paper} */\n${p}`,
    `/* ${l.dark} */\n${d}`,
    `/* ${l.media} */\n${media}`,
    `/* Derived: ink strengths, semantic roles, paper texture */\n${block(themeScopes(tokens), derivedEntries(tokens))}`,
    `/* Scale: type, space, radius, size, hatching, motion */\n${block(':root', staticEntries(tokens, scale))}`,
  ].join('\n\n') + '\n';
}

/** The `--cx-font-*` entries of a variant's `font` ({ display, text, adjust }). */
export function fontEntries(tokens, font) {
  for (const f of new Set([font.display, font.text])) if (!tokens.typefaces?.[f]) throw new Error(`Unknown typeface "${f}"`);
  const P = tokens.prefix;
  return [
    [`--${P}-font-display`, tokens.typefaces[font.display].stack],
    [`--${P}-font-text`, tokens.typefaces[font.text].stack],
    ...(font.adjust ? [[`--${P}-font-adjust`, font.adjust]] : []),
  ];
}

const PEN_KEYS = ['hatch', 'tremble', 'amount', 'density', 'angle', 'seed'];
const n2 = (v) => `${+(+v).toFixed(2)}`;

/**
 * The pen of a variant (or of the default look without a name): the settings
 * createPen() takes — hatch, tremble, amount, density, angle, seed — with the
 * default `pen` group filling what the variant leaves out.
 */
export function variantPen(tokens, name) {
  const base = strip(tokens.pen ?? {});
  const own = name ? strip(tokens.variants?.[name]?.pen ?? {}) : {};
  if (name && !tokens.variants?.[name]) throw new Error(`Unknown variant "${name}"`);
  return Object.fromEntries(PEN_KEYS.filter((k) => k in base || k in own).map((k) => [k, own[k] ?? base[k]]));
}

/**
 * How @rafime/wheel hatches its periods in a variant: `pen.wheel` of the
 * variant over the default `pen.wheel`, with the variant's seed.
 * → { hatch, density, angle, amount, seed, rim }
 */
export function variantWheelHatch(tokens, name) {
  if (name && !tokens.variants?.[name]) throw new Error(`Unknown variant "${name}"`);
  const base = tokens.pen ?? {};
  const own = name ? tokens.variants[name].pen ?? {} : {};
  return { ...(base.wheel ?? {}), ...(own.wheel ?? {}), seed: own.seed ?? base.seed };
}

/**
 * CSS hatching that matches a pen: --cx-hatch-angle / -gap (from density) /
 * -width and how far the shadow falls (--cx-size-shadow, -sm). Keeps the
 * CSS fallback in step with the drawn shadow.
 */
export function penEntries(tokens, pen) {
  const P = tokens.prefix;
  const out = [];
  if (pen.angle !== undefined) out.push([`--${P}-hatch-angle`, `${n2(pen.angle)}deg`]);
  if (pen.width !== undefined) out.push([`--${P}-hatch-width`, `${n2(pen.width)}px`]);
  if (pen.density !== undefined) out.push([`--${P}-hatch-gap`, `${n2(Math.max(1.4, 3.75 / (pen.density || 1), (pen.width ?? 1) + 0.5))}px`]);
  if (pen.lift !== undefined) out.push([`--${P}-size-shadow`, `${n2(pen.lift)}px`]);
  if (pen.liftSm !== undefined) out.push([`--${P}-size-shadow-sm`, `${n2(pen.liftSm)}px`]);
  return out;
}

/** variants/<name>.css: import after codex.css. */
export function variantCss(tokens, name, vt, { banner = '' } = {}) {
  assertComplete(tokens, vt, `Variant ${name}`);
  const font = vt.font ?? null;
  const faces = font ? [...new Set([font.display, font.text])] : [];
  for (const f of faces) if (!tokens.typefaces?.[f]) throw new Error(`Variant ${name} uses unknown typeface "${f}"`);
  const fontBlock = font ? [
    `/* Type: ${tokens.typefaces[font.display].family} for display${font.text !== font.display ? `, ${tokens.typefaces[font.text].family} for text` : ''} */`,
    block(':root', fontEntries(tokens, font)),
  ] : [];
  return [
    banner + faces.map((f) => `@import url('../typefaces/${f}.css');\n`).join(''),
    `/* Variant "${name}": ${vt.$description ?? ''} Import after codex.css. */`,
    ...fontBlock,
    ...(vt.pen ? [`/* Pen: ${vt.pen.hatch ?? 'default'} hatching, ${vt.pen.tremble ?? 'default'} edges — the CSS fallback of variantPen('${name}') */`, block(':root', penEntries(tokens, vt.pen))] : []),
    ...themeBlocks(tokens, vt.paper, vt.dark),
  ].join('\n\n') + '\n';
}

export const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
export const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/** The four font files of a typeface: [{ file, style, range }]. */
export function typefaceFiles(name) {
  const out = [];
  for (const style of ['normal', 'italic']) {
    for (const [subset, range] of [['latin-ext', LATIN_EXT], ['latin', LATIN]]) out.push({ file: `${name}-${subset}-wght-${style}.woff2`, style, range });
  }
  return out;
}

/** @font-face rules of one typeface; `src(file)` gives each file's URL (relative path or data: URI). */
export function fontFaceCss(tokens, name, src = (file) => `../fonts/${file}`) {
  const tf = tokens.typefaces[name];
  if (!tf) throw new Error(`Unknown typeface "${name}"`);
  return typefaceFiles(name).map(({ file, style, range }) =>
    `@font-face {\n  font-family: '${tf.family}';\n  font-style: ${style};\n  font-display: swap;\n  font-weight: ${tf.weight};\n  src: url('${src(file)}') format('woff2-variations');\n  unicode-range: ${range};\n}`,
  ).join('\n');
}

/** Colour helpers shared by the build tests and theme tools. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
