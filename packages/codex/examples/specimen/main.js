/**
 * Codex specimen: every building block of @rafime/codex, with switches for
 * variant, theme and ink.
 * Run: npm run example -w @rafime/codex
 */
import '@rafime/codex/all.css';
import '@rafime/codex/palettes/tide.css';
import '@rafime/codex/palettes/compass.css';
import '@rafime/codex/palettes/grow.css';
import '@rafime/codex/palettes/iso.css';
import '@rafime/codex/pen.css';
import './specimen.css';
import tide from '@rafime/codex/variants/tide.css?inline';
import compass from '@rafime/codex/variants/compass.css?inline';
import grow from '@rafime/codex/variants/grow.css?inline';
import atelier from '@rafime/codex/variants/atelier.css?inline';
import { createPen, HATCH_STYLES, TREMBLE_STYLES, cleanPen } from '@rafime/codex/pen';
import { tokens, color, installInk, applyIcons, icon, ICON_NAMES, arcPath, labelArcPath, polar, valueToAngle, variantPen } from '@rafime/codex';

const VARIANTS = { tide, compass, grow, atelier };

const root = document.documentElement;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

installInk();
applyIcons(document);

/* ---------- variant, theme, ink ---------- */
const variantStyle = document.createElement('style');
variantStyle.id = 'sp-variant-css';
document.body.appendChild(variantStyle); // after the core CSS, so the variant wins
let variant = '';

const theme = () => {
  const t = root.dataset.theme;
  if (t === 'dark') return 'dark';
  if (t === 'light') return 'paper';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper';
};

const press = (group, el) => group.querySelectorAll('.cx-chip').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));

function setVariant(v) {
  variant = v;
  variantStyle.textContent = v ? VARIANTS[v] : '';
  press(document.getElementById('sp-variant'), document.querySelector(`[data-variant="${v}"]`));
  store.set('sp-variant', v);
  penVariant?.();
  requestAnimationFrame(refreshAll);
}
let penVariant = null; // set by the pen below: the variant brings its own hand

function setTheme(t) {
  if (t) root.dataset.theme = t; else delete root.dataset.theme;
  press(document.getElementById('sp-theme'), document.querySelector(`[data-theme-set="${t}"]`));
  requestAnimationFrame(refreshAll);
}

document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-variant]');
  if (v) return setVariant(v.dataset.variant);
  const t = e.target.closest('[data-theme-set]');
  if (t) return setTheme(t.dataset.themeSet);
  const chip = e.target.closest('.sp-toggle .cx-chip');
  if (chip) press(chip.parentElement, chip);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => refreshAll());

// reflect a theme the host already set
const hostTheme = root.dataset.theme;
if (hostTheme === 'dark' || hostTheme === 'light') press(document.getElementById('sp-theme'), document.querySelector(`[data-theme-set="${hostTheme}"]`));

/* ---------- swatches, type scale, icons ---------- */
function drawSwatches() {
  const skip = ['on-ink', 'ground', 'paper-glow', 'paper-shade', 'paper-grain', 'paper-vignette', 'shade', 'shade-strong'];
  const names = Object.keys(tokens.themes.paper).filter((n) => !skip.includes(n));
  document.getElementById('sp-swatches').innerHTML = names.map((n) => `
    <div class="sp-sw"><i style="--sw:var(--cx-${n})"></i>
      <span class="cx-body">${n}</span>
      <span class="cx-meta cx-num">${color(n, theme(), variant || undefined)}</span></div>`).join('');
  document.getElementById('sp-sw-meta').textContent = `color(name, '${theme()}'${variant ? `, '${variant}'` : ''})`;
}

function drawScale() {
  const scale = [['6xl', '7,4 h'], ['4xl', 'Evening check-in'], ['2xl', 'Therapy, week 6'], ['xl', 'Mood +1'], ['lg', 'Walked by the river'], ['md', 'Longest streak'], ['sm', 'Only you can read this.'], ['xs', 'Thu · 21:40']];
  document.getElementById('sp-scale').innerHTML = scale.map(([k, t]) =>
    `<div class="sp-scale__row"><code>--cx-text-${k}</code><span style="font-size:var(--cx-text-${k})">${t}</span></div>`).join('');
  const cs = getComputedStyle(root);
  const first = (s) => s.split(',')[0].replace(/['"]/g, '').trim();
  const d = first(cs.getPropertyValue('--cx-font-display')), x = first(cs.getPropertyValue('--cx-font-text'));
  document.getElementById('sp-fontline').textContent = d === x ? d : `${d} + ${x}`;
}

document.getElementById('sp-icons').innerHTML = ICON_NAMES.map((n) =>
  `<div class="sp-icon">${icon(n)}<code>${n}</code></div>`).join('');
document.getElementById('sp-icon-meta').textContent = `${ICON_NAMES.length} icons · icon(name)`;

/* ---------- the dial ---------- */
function drawDial() {
  const c = 160;
  const h = (v) => valueToAngle(v, 0, 12, -135, 270);
  let s = '';
  [[0, 6, 'rust', 'short'], [7, 9, 'moss', 'in range'], [9, 12, 'slate', 'long']].forEach(([f, t, pig, label], i) => {
    s += `<path d="${arcPath(c, c, 146, h(f), h(t))}" fill="none" stroke="var(--cx-${pig})" stroke-width="7" opacity=".6" class="cx-ink"/>`;
    s += `<path id="sp-z${i}" d="${labelArcPath(c, c, 157, h(f), h(t))}" fill="none"/>`;
    s += `<text font-size="10" letter-spacing="1.4" fill="currentColor"><textPath href="#sp-z${i}" startOffset="50%" text-anchor="middle">${label.toUpperCase()}</textPath></text>`;
  });
  s += `<path d="${arcPath(c, c, 132, h(0), h(12))}" fill="none" stroke="currentColor" stroke-width=".8" opacity=".6" class="cx-ink"/>`;
  s += `<path d="${arcPath(c, c, 123, h(0), h(7.4))}" fill="none" stroke="var(--cx-amber)" stroke-width="8" stroke-linecap="round" class="cx-ink"/>`;
  [0, 3, 6, 9, 12].forEach((v) => { const p = polar(c, c, 108, h(v)); s += `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".75">${v}</text>`; });
  s += `<text x="${c}" y="${c + 18}" text-anchor="middle" font-size="70" fill="currentColor">7,4</text>`;
  s += `<text x="${c}" y="${c + 44}" text-anchor="middle" font-size="13" fill="currentColor">hours slept</text>`;
  document.getElementById('sp-dial').innerHTML = s;
}

/* ---------- the form ---------- */
const mood = document.getElementById('sp-mood');
mood.addEventListener('input', () => {
  const v = Number(mood.value);
  document.getElementById('sp-mood-v').textContent = v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';
});

/* ---------- boot ---------- */
function refreshAll() { drawSwatches(); drawScale(); drawDial(); }
const saved = store.get('sp-variant');
if (saved && VARIANTS[saved]) setVariant(saved); else refreshAll();
document.fonts?.ready?.then(() => drawScale());

/* ---------- the pen: hatching and trembling (codex/pen) ---------- */
const HATCH = { diagonal: ['Diagonal', 'one pass at the angle'], cross: ['Cross', 'two passes, the second lighter'], stipple: ['Stipple', 'dots, never twice the same'], scribble: ['Scribble', 'one fast zig-zag stroke'], engrave: ['Engraving', 'swelling copperplate lines'], contour: ['Contour', 'follows the edge inwards'], hachure: ['Hachure', 'short strokes, map style'], waves: ['Waves', 'rolling lines'], mixed: ['Mixed', 'every element rolls its own'] };
const TREM = { steady: ['Steady', 'a ruler'], quill: ['Quill', 'slow drift of a nib'], sketch: ['Sketch', 'two passes, corners overshot'], tremor: ['Tremor', 'cold hands'], brush: ['Brush', 'ink swells, then tapers'], dry: ['Dry', 'the pen runs out'], mixed: ['Mixed', 'every edge rolls its own'] };
const tile = (k, [name, hint], kind) => `<button type="button" class="cx-drawn pen-tile${kind === 't' ? ' pen-tile--edge' : ''}" data-pen-always ${kind === 'h' ? `data-pen-fill data-pen-hatch="${k}" data-set-hatch="${k}"` : `data-pen-tremble="${k}" data-pen-amp="1.7" data-set-tremble="${k}"`} aria-pressed="false"><span class="pen-tile__name">${name}</span><span class="pen-tile__hint">${hint}</span></button>`;
document.getElementById('pen-hatch').innerHTML = HATCH_STYLES.map((k) => tile(k, HATCH[k], 'h')).join('');
document.getElementById('pen-tremble').innerHTML = TREMBLE_STYLES.map((k) => tile(k, TREM[k], 't')).join('');

// The variant's own hand (variantPen) until the pen is changed by hand; then
// switching the variant keeps the hand-made one. Reset brings the preset back.
const penPreset = () => cleanPen(variantPen(variant || undefined));
const samePen = (a, b) => JSON.stringify(cleanPen(a)) === JSON.stringify(cleanPen(b));
let penCustom = store.get('sp-pen-custom') === '1';
let penState = { mode: 'pen', ...penPreset() };
try { const o = JSON.parse(store.get('sp-pen') || '{}'); penState = { mode: ['pen', 'on', 'off'].includes(o.mode) ? o.mode : 'pen', ...(penCustom ? cleanPen(o) : penPreset()) }; } catch { penCustom = false; }
const page = document.querySelector('.sp-page');
const pen = createPen(page, cleanPen(penState), { active: penState.mode === 'pen' });
const $p = (id) => document.getElementById(id);
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',').replace('-', '−');
function penSync() {
  const s = penState;
  document.querySelectorAll('[data-set-hatch]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setHatch === s.hatch)));
  document.querySelectorAll('[data-set-tremble]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setTremble === s.tremble)));
  document.querySelectorAll('#sp-ink [data-ink]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ink === s.mode)));
  $p('pen-amount').value = s.amount; $p('pen-density').value = s.density; $p('pen-angle').value = s.angle;
  $p('pen-amount-v').textContent = fmt(s.amount); $p('pen-density-v').textContent = fmt(s.density); $p('pen-angle-v').textContent = `${fmt(s.angle, 0)}°`;
  $p('pen-seed').textContent = `seed ${s.seed}`;
  const b = $p('pen-boil'); b.setAttribute('aria-pressed', String(pen.boiling)); b.querySelector('span').textContent = pen.boiling ? 'Stop' : 'Boil';
  $p('pen-code').textContent = `import { createPen } from '@rafime/codex/pen';\nimport '@rafime/codex/pen.css';\n\ncreatePen(document.body, ${JSON.stringify(cleanPen(s))});`;
  root.classList.toggle('cx-inked', s.mode === 'on');
  pen.set(cleanPen(s)).activate(s.mode === 'pen');
  store.set('sp-pen', JSON.stringify(s));
  store.set('sp-pen-custom', penCustom ? '1' : '');
}
function penChange(patch, { custom = true } = {}) {
  penState = { ...penState, ...patch };
  penCustom = custom && !samePen(penState, penPreset());
  penSync();
}
penVariant = () => { if (!penCustom) penChange(penPreset(), { custom: false }); };
document.addEventListener('click', (e) => {
  const ink = e.target.closest('#sp-ink [data-ink]'); if (ink) return penChange({ mode: ink.dataset.ink });
  const h = e.target.closest('[data-set-hatch]'); if (h) return penChange({ hatch: h.dataset.setHatch, mode: 'pen' });
  const t = e.target.closest('[data-set-tremble]'); if (t) return penChange({ tremble: t.dataset.setTremble, mode: 'pen' });
});
[['pen-amount', 'amount'], ['pen-density', 'density'], ['pen-angle', 'angle']].forEach(([id, k]) => $p(id).addEventListener('input', (e) => penChange({ [k]: +e.target.value, mode: 'pen' })));
const seed = () => 1 + Math.floor(Math.random() * 9999);
const any = (list) => list[Math.floor(Math.random() * list.length)];
$p('pen-reroll').addEventListener('click', () => penChange({ seed: seed(), mode: 'pen' }));
$p('pen-reset').addEventListener('click', () => { pen.boil(false); penChange({ mode: 'pen', ...penPreset() }, { custom: false }); });
$p('pen-surprise').addEventListener('click', () => penChange({ mode: 'pen', hatch: any(HATCH_STYLES), tremble: any(TREMBLE_STYLES), amount: +(0.4 + Math.random() * 1.8).toFixed(2), density: +(0.7 + Math.random()).toFixed(2), angle: Math.round(-80 + Math.random() * 160), seed: seed() }));
$p('pen-boil').addEventListener('click', () => { pen.boil(!pen.boiling); penSync(); });
penSync();
