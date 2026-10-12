/**
 * codex/pen — a seeded hand. Draws every edge and every hatched shadow of
 * Codex elements as SVG: hatching generators for shadows and fills,
 * trembling generators for edges. The same seed always draws the same page.
 *
 *   import { createPen } from '@rafime/codex/pen';
 *   import '@rafime/codex/pen.css';
 *   const pen = createPen(document.body, { hatch: 'cross', tremble: 'sketch', seed: 42 });
 *   pen.set({ angle: 30 });   pen.boil(true);   pen.destroy();
 *
 * CSP-safe: SVG attributes and CSSOM only, no inline <style>, no eval.
 * Without JavaScript (or with the pen off) the CSS hatching of components.css
 * stays in place.
 */

const NS = 'http://www.w3.org/2000/svg';
const M = 12;

/** Hatching styles: shading of shadows and fills. `mixed` lets each element roll its own. */
export const HATCH_STYLES = ['diagonal', 'cross', 'stipple', 'scribble', 'engrave', 'contour', 'hachure', 'waves', 'mixed'];
/** Trembling styles: how the hand draws an edge. */
export const TREMBLE_STYLES = ['steady', 'quill', 'sketch', 'tremor', 'brush', 'dry', 'mixed'];
const HATCHES = HATCH_STYLES.filter((k) => k !== 'mixed');
const TREMBLES = TREMBLE_STYLES.filter((k) => k !== 'mixed' && k !== 'steady');

export const PEN_DEFAULTS = Object.freeze({ hatch: 'diagonal', tremble: 'quill', amount: 1, density: 1, angle: -45, seed: 1789 });
/** Elements the pen draws when it runs over a root. */
export const PEN_SELECTOR = '.cx-sheet,.cx-btn,.cx-chip,.cx-tile,.cx-band,.cx-callout,.cx-entry,.cx-slot,.cx-drawn,.cx-hatched,[data-pen-always]';

const clampN = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
/** Settings with unknown styles replaced and numbers clamped. */
export function cleanPen(o = {}) {
  return {
    hatch: HATCH_STYLES.includes(o.hatch) ? o.hatch : PEN_DEFAULTS.hatch,
    tremble: TREMBLE_STYLES.includes(o.tremble) ? o.tremble : PEN_DEFAULTS.tremble,
    amount: clampN(o.amount, 0, 3, PEN_DEFAULTS.amount),
    density: clampN(o.density, 0.5, 2.2, PEN_DEFAULTS.density),
    angle: clampN(o.angle, -90, 90, PEN_DEFAULTS.angle),
    seed: Math.round(clampN(o.seed, 1, 99999, PEN_DEFAULTS.seed)),
  };
}

/** Distance between hatching lines for a density (1 = Codex's 3.75px). */
export const hatchGap = (density) => Math.max(1.4, 3.75 / (density || 1));

/* ---------- randomness ---------- */
export function rng(a) {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(a, b) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** A string's 32-bit FNV-1a hash. */
function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function noise(r, oct) {
  const w = oct.map(([len, amp]) => ({ k: 6.2832 / (len * (0.8 + 0.4 * r())), p: r() * 6.2832, k2: 6.2832 / (len * 0.61 * (0.8 + 0.4 * r())), p2: r() * 6.2832, amp }));
  return (s) => {
    let v = 0;
    for (const o of w) v += o.amp * (0.6 * Math.sin(o.k * s + o.p) + 0.4 * Math.sin(o.k2 * s + o.p2));
    return v;
  };
}
function vnoise(seed, step) {
  const r = rng(seed);
  const m = new Map();
  const g = (i) => {
    let v = m.get(i);
    if (v === undefined) { v = r() * 2 - 1; m.set(i, v); }
    return v;
  };
  return (s) => {
    const x = s / step, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return g(i) * (1 - u) + g(i + 1) * u;
  };
}
const tremorNoise = (r) => {
  const a = vnoise(r() * 4294967296, 2.2), b = noise(r, [[60, 1]]);
  return (s) => 0.75 * a(s) + 0.45 * b(s);
};
const pick = (v, list, r) => (v === 'mixed' ? list[Math.floor(r() * list.length)] : v);

/* ---------- geometry ---------- */
const f1 = (v) => Math.round(v * 10) / 10;
function smooth(p, closed) {
  const n = p.length;
  if (n < 2) return '';
  const P = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), e = P(i + 2);
    d += `C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`;
  }
  return closed ? d + 'Z' : d;
}
function wline(ax, ay, bx, by, { step = 6, amp = 0, nf = null, bow = 0, s0 = 0 } = {}) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, k = Math.max(2, Math.ceil(L / step)), o = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k, off = (nf ? nf(s0 + t * L) * amp : 0) + bow * 4 * t * (1 - t);
    o.push([ax + dx * t + nx * off, ay + dy * t + ny * off]);
  }
  return o;
}
const sides = (x, y, w, h) => [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
function wrect(x, y, w, h, { step = 6, amp = 0, nf }) {
  const o = [];
  let s0 = 0;
  for (const [ax, ay, bx, by] of sides(x, y, w, h)) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L, k = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < k; i++) {
      const t = i / k, v = nf ? nf(s0 + t * L) * amp : 0;
      o.push([ax + dx * t + nx * v, ay + dy * t + ny * v]);
    }
    s0 += L;
  }
  return o;
}
function ribbon(p, wf) {
  const A = [], B = [], n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, hw = wf(i / (n - 1)) / 2;
    A.push([p[i][0] - (dy / l) * hw, p[i][1] + (dx / l) * hw]);
    B.push([p[i][0] + (dy / l) * hw, p[i][1] - (dx / l) * hw]);
  }
  return smooth(A.concat(B.reverse()), true);
}
function spanOf(w, h, ux, uy, nx, ny) {
  const C = [[0, 0], [w, 0], [0, h], [w, h]], c = C.map(([x, y]) => x * nx + y * ny), t = C.map(([x, y]) => x * ux + y * uy);
  return { cmin: Math.min(...c), cmax: Math.max(...c), tmin: Math.min(...t), tmax: Math.max(...t) };
}
function family(w, h, r, angle, gap, { jit = 0.22, wob = 0.3, skip = 0.04, step = 7, mk } = {}) {
  const th = (angle * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux, { cmin, cmax, tmin, tmax } = spanOf(w, h, ux, uy, nx, ny), t0 = tmin - 4, t1 = tmax + 4, half = (t1 - t0) / 2, out = [];
  for (let c = cmin - gap + r() * gap; c < cmax + gap; c += gap * (1 + (r() * 2 - 1) * jit)) {
    if (r() < skip) continue;
    const da = (r() - 0.5) * 0.045, ax = Math.cos(th + da), ay = Math.sin(th + da), mx = nx * c + (ux * (t0 + t1)) / 2, my = ny * c + (uy * (t0 + t1)) / 2, nf = mk ? mk(r) : noise(r, [[40, 1], [13, 0.4]]);
    out.push({ pts: wline(mx - ax * half, my - ay * half, mx + ax * half, my + ay * half, { step, amp: wob, nf }), sw: 0.65 + r() * 0.55 });
  }
  return out;
}
const strokes = (ls, op) => `<g class="ph-s"${op ? ` opacity="${op}"` : ''}>` + ls.map((l) => `<path d="${smooth(l.pts, false)}" stroke-width="${f1(l.sw)}"/>`).join('') + '</g>';

/* ---------- hatching generators: (w, h, rng, { gap, angle, A }) → svg ---------- */
const HG = {
  diagonal: (w, h, r, o) => strokes(family(w, h, r, o.angle, o.gap, { wob: 0.3 * o.A + 0.1 })),
  cross: (w, h, r, o) => strokes(family(w, h, r, o.angle, o.gap * 1.15, { wob: 0.3 * o.A + 0.1 })) + strokes(family(w, h, r, o.angle + 72 + (r() - 0.5) * 12, o.gap * 1.55, { wob: 0.3 * o.A + 0.1, skip: 0.14 }), 0.75),
  stipple: (w, h, r, o) => {
    const g = o.gap * 1.05;
    let s = '';
    for (let y = -g / 2; y < h + g / 2; y += g) for (let x = -g / 2; x < w + g / 2; x += g) {
      if (r() < 0.18) continue;
      s += `<circle cx="${f1(x + (r() - 0.5) * g * 1.1)}" cy="${f1(y + (r() - 0.5) * g * 1.1)}" r="${f1(0.3 + r() * 0.55)}"/>`;
    }
    return `<g class="ph-f">${s}</g>`;
  },
  scribble: (w, h, r, o) => {
    const th = (o.angle * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux, { cmin, cmax, tmin, tmax } = spanOf(w, h, ux, uy, nx, ny), g = o.gap * 1.25, p = [];
    let side = 0;
    for (let c = cmin - g; c < cmax + g; c += g * (0.75 + r() * 0.5)) {
      const t = side ? tmax + 2 + r() * 4 : tmin - 2 - r() * 4;
      p.push([nx * c + ux * t, ny * c + uy * t]);
      side ^= 1;
    }
    return `<g class="ph-s"><path d="${smooth(p, false)}" stroke-width="${f1(0.8 + r() * 0.35)}"/></g>`;
  },
  engrave: (w, h, r, o) => {
    const ls = family(w, h, r, o.angle + 45, o.gap * 1.3, { wob: 0.2 * o.A + 0.05, skip: 0, step: 4 }), m = o.gap * 0.55;
    return '<g class="ph-f">' + ls.map((l) => {
      const k = 1.5 + r() * 3, p = r() * 6.28;
      return `<path d="${ribbon(l.pts, (u) => m * (0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.sin(u * k * Math.PI + p), 1.6)))}"/>`;
    }).join('') + '</g>';
  },
  contour: (w, h, r, o) => {
    const g = o.gap * 1.2;
    let s = '';
    for (let i = 0.6; i * g < Math.min(w, h) / 2; i++) {
      const d = i * g;
      s += `<path d="${smooth(wrect(d, d, w - 2 * d, h - 2 * d, { step: 6, amp: 0.35 * o.A + 0.12, nf: noise(r, [[50, 1], [17, 0.4]]) }), true)}" stroke-width="${f1(0.65 + r() * 0.45)}"/>`;
    }
    return `<g class="ph-s">${s}</g>`;
  },
  hachure: (w, h, r, o) => {
    const g = o.gap * 2;
    let s = '';
    for (let y = -g / 2; y < h + g; y += g) for (let x = -g / 2; x < w + g; x += g) {
      if (r() < 0.14) continue;
      const cx = x + (r() - 0.5) * g * 0.8, cy = y + (r() - 0.5) * g * 0.8, a = ((o.angle + (r() - 0.5) * 24) * Math.PI) / 180, l = (g * (0.55 + r() * 0.5)) / 2;
      s += `M${f1(cx - Math.cos(a) * l)} ${f1(cy - Math.sin(a) * l)}L${f1(cx + Math.cos(a) * l)} ${f1(cy + Math.sin(a) * l)}`;
    }
    return `<g class="ph-s"><path d="${s}" stroke-width="${f1(0.8 + r() * 0.3)}"/></g>`;
  },
  waves: (w, h, r, o) => {
    const lam = o.gap * (3 + r() * 2), p = r() * 6.28;
    return strokes(family(w, h, r, o.angle + 45, o.gap * 1.35, { step: 2, wob: o.gap * 0.38, skip: 0, mk: (rr) => { const q = rr() * 0.5, j = noise(rr, [[30, 0.25]]); return (s) => Math.sin((s * 6.2832) / lam + p + q) + j(s); } }));
  },
};

/* ---------- trembling generators: edge of a w×h box ---------- */
function outline(t, w, h, r, A, dash) {
  const x = 0.5, y = 0.5, W = w - 1, H = h - 1, da = dash ? ' stroke-dasharray="4.5 3.5"' : '';
  if (dash && (t === 'brush' || t === 'dry')) t = 'quill';
  if (t === 'steady') return `<rect class="pe-s" x="${x}" y="${y}" width="${f1(W)}" height="${f1(H)}"${da}/>`;
  if (t === 'quill') return `<path class="pe-s" d="${smooth(wrect(x, y, W, H, { step: 6, amp: 0.85 * A, nf: noise(r, [[70, 1], [23, 0.45]]) }), true)}" stroke-width="1.15"${da}/>`;
  if (t === 'tremor') return `<path class="pe-s" d="${smooth(wrect(x, y, W, H, { step: 1.8, amp: 0.75 * A, nf: tremorNoise(r) }), true)}" stroke-width="1"${da}/>`;
  let s = '';
  for (let pass = 0; pass < (t === 'sketch' ? 2 : 1); pass++) for (const [ax, ay, bx, by] of sides(x, y, W, H)) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    if (t === 'sketch') {
      const o1 = (r() * 3.5 - 0.8) * A, o2 = (r() * 3.5 - 0.8) * A, j = () => (r() - 0.5) * 1.4 * A, nf = noise(r, [[L + 30, 1], [19, 0.25]]);
      s += `<path class="pe-s" d="${smooth(wline(ax - ux * o1 + j(), ay - uy * o1 + j(), bx + ux * o2 + j(), by + uy * o2 + j(), { step: 8, amp: 0.55 * A, nf, bow: (r() - 0.5) * 2 * A }), false)}" stroke-width="${pass ? 0.75 : 1.1}"${pass ? ' opacity=".55"' : ''}${da}/>`;
    } else if (t === 'brush') {
      const o1 = r() * 2 * A, o2 = r() * 2 * A, nf = noise(r, [[L + 40, 1], [21, 0.3]]), wn = noise(r, [[35, 1]]), p = wline(ax - ux * o1, ay - uy * o1, bx + ux * o2, by + uy * o2, { step: 4, amp: 0.5 * A, nf, bow: (r() - 0.5) * 1.4 * A }), b = 0.9 + 0.9 * Math.min(1.4, A);
      s += `<path class="pe-f" d="${ribbon(p, (u) => b * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92))) * (0.78 + 0.3 * wn(u * L)))}"/>`;
    } else {
      const nf = noise(r, [[L + 30, 1], [15, 0.3]]);
      let p = -r() * 1.5 * A;
      while (p < L) {
        const e = Math.min(L + r() * A, p + 5 + r() * 26);
        s += `<path class="pe-s" d="${smooth(wline(ax + ux * p, ay + uy * p, ax + ux * e, ay + uy * e, { step: 5, amp: 0.5 * A, nf, s0: p }), false)}" stroke-width="${f1(0.7 + r() * 0.6)}" opacity="${f1(0.45 + r() * 0.55)}"/>`;
        p = e + (r() < 0.6 ? 0.8 + r() * 2.6 * Math.max(0.5, A) : 0);
      }
    }
  }
  return s;
}

/** Hatching of a w×h box as SVG markup (no clip). */
export function hatchSvg(style, w, h, { seed = PEN_DEFAULTS.seed, density = 1, angle = -45, amount = 1 } = {}) {
  const r = rng(hash(seed, 1));
  const hs = pick(style, HATCHES, r);
  return HG[hs] ? HG[hs](w, h, r, { gap: hatchGap(density), angle, A: amount }) : '';
}

/** Edge of a w×h box as SVG markup. */
export function outlineSvg(style, w, h, { seed = PEN_DEFAULTS.seed, amount = 1, dashed = false } = {}) {
  const r = rng(hash(seed, 2));
  return outline(pick(style, TREMBLES, r), w, h, r, amount, dashed);
}

/* ---------- any line: arcs, circles, radial strokes ---------- */

/** Resamples a polyline every `step` units; returns points with their arc length `s`. */
function resample(pts, step, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  const out = [];
  let s0 = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], L = Math.hypot(bx - ax, by - ay);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push({ x: ax + ((bx - ax) * j) / k, y: ay + ((by - ay) * j) / k, s: s0 + (L * j) / k });
    s0 += L;
  }
  if (!closed) out.push({ x: P[P.length - 1][0], y: P[P.length - 1][1], s: s0 });
  return { pts: out, L: s0 };
}

/** Offsets resampled points along their normals by nf(s) · amp (+ a constant shift). */
function bend(R, nf, amp, closed, shift = 0) {
  const p = R.pts, n = p.length;
  return p.map((q, i) => {
    const a = p[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = p[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, v = (nf ? nf(q.s) * amp : 0) + shift;
    return [q.x - (dy / l) * v, q.y + (dx / l) * v];
  });
}

/**
 * Any polyline drawn by a trembling hand: `pts` [[x, y], …] (sample arcs and
 * circles densely enough, ~4 units), one of TREMBLE_STYLES. SVG markup of
 * <path>s: class "pe-s" (stroke it) and "pe-f" (brush: fill it).
 * The same seed draws the same line.
 */
export function strokeSvg(style, pts, { seed = PEN_DEFAULTS.seed, amount = 1, closed = false, dashed = false } = {}) {
  if (!pts || pts.length < 2) return '';
  const r = rng(hash(seed, 4));
  let t = pick(style, TREMBLES, r);
  if (dashed && (t === 'brush' || t === 'dry')) t = 'quill';
  const A = amount, da = dashed ? ' stroke-dasharray="3 3"' : '';
  if (t === 'steady') return `<path class="pe-s" d="M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}${closed ? 'Z' : ''}"${da}/>`;
  const R6 = resample(pts, 6, closed);
  if (t === 'quill') return `<path class="pe-s" d="${smooth(bend(R6, noise(r, [[70, 1], [23, 0.45]]), 0.85 * A, closed), closed)}" stroke-width="1.15"${da}/>`;
  if (t === 'tremor') return `<path class="pe-s" d="${smooth(bend(resample(pts, 1.8, closed), tremorNoise(r), 0.75 * A, closed), closed)}" stroke-width="1"${da}/>`;
  if (t === 'sketch') {
    let s = '';
    for (let pass = 0; pass < 2; pass++) {
      let src = pts;
      if (!closed) {
        // overshoot both ends a little, like a quick pencil stroke
        const [ax, ay] = pts[0], [bx, by] = pts[1], [cx, cy] = pts[pts.length - 1], [dx, dy] = pts[pts.length - 2];
        const o1 = (r() * 3.5 - 0.8) * A, o2 = (r() * 3.5 - 0.8) * A, l1 = Math.hypot(ax - bx, ay - by) || 1, l2 = Math.hypot(cx - dx, cy - dy) || 1;
        src = [[ax + ((ax - bx) / l1) * o1, ay + ((ay - by) / l1) * o1], ...pts.slice(1, -1), [cx + ((cx - dx) / l2) * o2, cy + ((cy - dy) / l2) * o2]];
      }
      const R = resample(src, 8, closed);
      s += `<path class="pe-s" d="${smooth(bend(R, noise(r, [[R.L / 3 + 30, 1], [19, 0.25]]), 0.55 * A, closed, (r() - 0.5) * 1.4 * A), closed)}" stroke-width="${pass ? 0.75 : 1.1}"${pass ? ' opacity=".55"' : ''}${da}/>`;
    }
    return s;
  }
  if (t === 'brush') {
    const R = resample(pts, 4, closed), wn = noise(r, [[35, 1]]), b = 0.9 + 0.9 * Math.min(1.4, A);
    const p = bend(R, noise(r, [[R.L / 2 + 40, 1], [21, 0.3]]), 0.5 * A, closed);
    const taper = closed ? () => 1 : (u) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92));
    return `<path class="pe-f" d="${ribbon(closed ? [...p, p[0]] : p, (u) => b * taper(u) * (0.78 + 0.3 * wn(u * R.L)))}"/>`;
  }
  // dry: broken strokes of varying weight
  const R = resample(pts, 3, closed), nf = noise(r, [[R.L / 2 + 30, 1], [15, 0.3]]), all = bend(R, nf, 0.5 * A, closed);
  let s = '', i = 0;
  while (i < all.length - 1) {
    const len = 2 + Math.floor(r() * 9), j = Math.min(all.length - 1, i + len);
    if (j > i) s += `<path class="pe-s" d="${smooth(all.slice(i, j + 1), false)}" stroke-width="${f1(0.7 + r() * 0.6)}" opacity="${f1(0.45 + r() * 0.55)}"/>`;
    i = j + (r() < 0.6 ? 1 : 0);
  }
  return s;
}

let instances = 0;

/**
 * Runs the pen over `root`: every element matching `selector` gets its edge
 * and (buttons, links, .cx-hatched) its hatched shadow drawn as SVG. Adds
 * `cx-pen` to root, watches size changes and new elements.
 * Per element: data-pen-hatch / data-pen-tremble override the style,
 * data-pen-amp scales the shake, data-pen-fill hatches the face instead of the
 * shadow, data-pen-always draws even while the pen is off, data-pen-seed
 * pins the element's hand (by default it follows its place under root, so
 * re-rendered elements keep their drawing).
 */
export function createPen(root, settings = {}, { selector = PEN_SELECTOR, active = true, shadows = '' } = {}) {
  const pid = ++instances;
  // shadows: an app's own raised elements (not Codex classes) whose hatched
  // shadow the pen draws too — only the shadow; their face and edge stay CSS.
  const scanSel = shadows ? `${selector},${shadows}` : selector;
  let S = cleanPen({ ...PEN_DEFAULTS, ...settings });
  let on = active;
  let frame = 0;
  let boilTimer = null;
  const ids = new WeakMap();
  const known = new Set();
  const dirty = new Set();
  let raf = 0;

  // The hand of an element comes from where it sits under root (tag and
  // position of every ancestor), not from the order it was found in: an
  // element that is re-rendered in place (a list, a wheel's buttons) keeps
  // its drawing instead of rolling a new one on every render.
  // data-pen-seed pins it explicitly.
  const idOf = (el) => {
    let i = ids.get(el);
    if (i) return i;
    const own = el.getAttribute('data-pen-seed');
    if (own !== null && own !== '') i = hash(strHash(own), 0x5eed) || 1;
    else {
      let path = '';
      for (let n = el; n && n !== root && n.parentElement; n = n.parentElement) {
        let k = 0;
        for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) k++;
        path = `${n.tagName}${k}/${path}`;
      }
      i = strHash(path) || 1;
    }
    ids.set(el, i);
    return i;
  };

  function render(el) {
    if (!el.isConnected) return;
    const always = el.hasAttribute('data-pen-always');
    const old = el.querySelector(':scope > svg.pen-art');
    if (!always && !on) { old?.remove(); return; }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const cs = getComputedStyle(el), bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, dashed = cs.borderTopStyle === 'dashed';
    const pi = idOf(el), stable = hash(S.seed, pi), base = hash(S.seed + frame * 7919, pi), rP = rng(hash(stable, 3)), rO = rng(hash(base, 2)), rH = rng(hash(base, 1));
    const c = el.classList, link = el.tagName === 'BUTTON' || el.tagName === 'A', A = S.amount * (+el.dataset.penAmp || 1);
    const trem = pick(el.dataset.penTremble || S.tremble, TREMBLES, rP);
    const shadowOnly = !!shadows && !el.matches(selector) && el.matches(shadows);
    const host = (c.contains('cx-btn') && !c.contains('cx-btn--quiet') && !el.disabled) || (c.contains('cx-chip') && link) || c.contains('cx-hatched') || (c.contains('cx-entry') && link);
    const fillHatch = el.hasAttribute('data-pen-fill'), hasFill = !fillHatch && (host || c.contains('cx-btn') || c.contains('cx-chip'));
    const shape = trem === 'steady' ? `M0 0H${w}V${h}H0Z` : smooth(wrect(0, 0, w, h, { step: 7, amp: 0.45 * A, nf: noise(rO, [[60, 1], [19, 0.3]]) }), true);
    let s = '';
    if (host || fillHatch || shadowOnly) {
      const hs = pick(el.dataset.penHatch || S.hatch, HATCHES, rP), o = { gap: hatchGap(S.density), angle: S.angle + (rP() - 0.5) * 8, A }, id = `pc${pid}-${pi}`;
      s += `<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs><g class="${fillHatch ? 'pen-hatch-fill' : 'pen-hatch'}" clip-path="url(#${id})">${HG[hs](w, h, rH, o)}</g>`;
    }
    if (hasFill && !shadowOnly) s += `<path class="pen-fill" d="${shape}"/>`;
    if (!shadowOnly) s += outline(trem, w, h, rO, A, dashed);
    if (c.contains('cx-entry')) s += `<path class="pe-spine" d="${smooth(wline(1.5, 0.5, 1.5, h - 0.5, { step: 6, amp: 0.5 * A, nf: noise(rO, [[50, 1]]) }), false)}" stroke-width="${trem === 'brush' ? 3.6 : 3}"/>`;
    let svg = old;
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      el.appendChild(svg);
    }
    svg.setAttribute('class', 'pen-art' + (always ? ' pen-art--always' : '') + (shadowOnly ? ' pen-art--shadow' : ''));
    svg.setAttribute('width', w + 2 * M);
    svg.setAttribute('height', h + 2 * M);
    svg.setAttribute('viewBox', `${-M} ${-M} ${w + 2 * M} ${h + 2 * M}`);
    svg.style.left = `${-M - bl}px`;
    svg.style.top = `${-M - bt}px`;
    // inline, so an app's `.chip svg { width: 16px }` can't shrink the drawing
    svg.style.width = `${w + 2 * M}px`;
    svg.style.height = `${h + 2 * M}px`;
    svg.style.maxWidth = 'none';
    svg.innerHTML = s;
  }

  const kick = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      mo.disconnect();
      dirty.forEach(render);
      dirty.clear();
      mo.observe(root, { childList: true, subtree: true });
    });
  };
  const ro = new ResizeObserver((es) => { es.forEach((e) => dirty.add(e.target)); kick(); });
  // Finds the elements to draw. New ones are drawn right away (still before
  // the next paint), so a re-rendered button never shows a frame without its
  // edge; the ones already drawn are left alone unless `all`.
  function scan(all = false) {
    const list = [...(root.matches?.(scanSel) ? [root] : []), ...root.querySelectorAll(scanSel)];
    for (const el of known) if (!el.isConnected) { ro.unobserve(el); known.delete(el); }
    const fresh = [];
    for (const el of list) {
      if (!known.has(el)) { known.add(el); ro.observe(el); fresh.push(el); }
      else if (all) dirty.add(el);
    }
    if (fresh.length) {
      mo.disconnect();
      fresh.forEach(render);
      mo.observe(root, { childList: true, subtree: true });
    }
    if (dirty.size) kick();
  }
  const mo = new MutationObserver((recs) => {
    if (recs.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && !(n instanceof SVGElement)))) scan();
  });

  root.classList.toggle('cx-pen', on);
  scan(true);
  mo.observe(root, { childList: true, subtree: true });
  document.fonts?.ready?.then(() => redraw());

  function redraw() { known.forEach((el) => dirty.add(el)); kick(); }

  const api = {
    get settings() { return { ...S }; },
    get active() { return on; },
    set(patch) { S = cleanPen({ ...S, ...patch }); redraw(); return api; },
    /** switch the pen on or off (off: the CSS hatching shows again) */
    activate(v) { on = !!v; root.classList.toggle('cx-pen', on); redraw(); return api; },
    /** redraw every line seven times a second from three seeds */
    boil(v) {
      if (v && !boilTimer) boilTimer = setInterval(() => { if (document.hidden) return; frame = (frame + 1) % 3; redraw(); }, 140);
      if (!v && boilTimer) { clearInterval(boilTimer); boilTimer = null; frame = 0; redraw(); }
      return api;
    },
    get boiling() { return !!boilTimer; },
    /** find new elements (and redraw every one) */
    rescan: () => scan(true),
    redraw,
    destroy() {
      api.boil(false);
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
      root.classList.remove('cx-pen');
      known.forEach((el) => el.querySelector(':scope > svg.pen-art')?.remove());
      known.clear();
    },
  };
  return api;
}
