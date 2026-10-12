/**
 * Codex drawing helpers — framework-free, return plain strings/numbers so they
 * work in vanilla TS (grow-tool), any framework, or a Home Assistant card.
 *
 * Angles are in degrees, 0° = 12 o'clock, clockwise (like a dial).
 */

const DEFAULT_INK_ID = 'cx-ink';

/**
 * SVG <defs> content for the hand-drawn ink look: a slight displacement that
 * makes straight strokes wobble like iron-gall ink on paper, plus a hatch
 * pattern for "current / measured" areas.
 *
 * Put it once per page:  document.body.insertAdjacentHTML('afterbegin', inkSprite())
 * then use  filter="url(#cx-ink)"  and  fill="url(#cx-hatch)"  in your SVGs.
 */
export function inkDefs({
  id = DEFAULT_INK_ID,
  seed = 17,
  scale = 1.4,
  hatchId = 'cx-hatch',
  hatchColor = 'var(--cx-highlight, #b3782a)',
  hatchAngle = 38,
  hatchGap = 7,
} = {}) {
  return (
    `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>` +
    `<pattern id="${hatchId}" width="${hatchGap}" height="${hatchGap}" patternTransform="rotate(${hatchAngle})" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="0" y2="${hatchGap}" style="stroke:${hatchColor}" stroke-width="1.1" opacity=".5"/></pattern>` +
    // for borders drawn by hand (.cx-inked): a finer, stronger tremor along the line
    `<filter id="${id}-line" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="${seed + 7}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>`
  );
}

/**
 * Turn on the hand-drawn look for a page: puts the ink defs into the document
 * once and sets `cx-inked` on <html>, which switches Codex borders (sheets,
 * buttons, chips, bands …) to trembling ink lines. Safe to call repeatedly.
 * Without it, borders stay straight — the CSS never references a filter
 * that isn't on the page.
 */
export function installInk(doc = globalThis.document, options) {
  if (!doc) return;
  if (!doc.getElementById('cx-ink-sprite')) {
    const holder = doc.createElement('div');
    holder.id = 'cx-ink-sprite';
    holder.innerHTML = inkSprite(options);
    doc.body.prepend(holder);
  }
  doc.documentElement.classList.add('cx-inked');
}

/** A zero-size <svg> holding inkDefs(), ready to drop into the page once. */
export function inkSprite(options) {
  return `<svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${inkDefs(options)}</defs></svg>`;
}

/** Point on a circle. 0° is straight up, angles grow clockwise. */
export function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

/**
 * SVG path data for an arc from `startDeg` to `endDeg` (clockwise).
 * Use for phase rings, zone bands, the ISO dial.
 */
export function arcPath(cx, cy, r, startDeg, endDeg) {
  const sweep = normalizeSweep(endDeg - startDeg);
  if (sweep >= 360) {
    // full circle: two half arcs, a single arc cannot close on itself
    const a = polar(cx, cy, r, startDeg);
    const b = polar(cx, cy, r, startDeg + 180);
    return `M${a.x} ${a.y} A${r} ${r} 0 1 1 ${b.x} ${b.y} A${r} ${r} 0 1 1 ${a.x} ${a.y}`;
  }
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, startDeg + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M${s.x} ${s.y} A${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/**
 * Arc for text on a ring (<textPath>). Same span as arcPath, but on the lower
 * half of the dial it runs counter-clockwise so the letters stay upright.
 */
export function labelArcPath(cx, cy, r, startDeg, endDeg) {
  const sweep = normalizeSweep(endDeg - startDeg);
  const mid = (((startDeg + sweep / 2) % 360) + 360) % 360;
  if (mid <= 90 || mid >= 270 || sweep >= 360) return arcPath(cx, cy, r, startDeg, endDeg);
  const s = polar(cx, cy, r, startDeg + sweep);
  const e = polar(cx, cy, r, startDeg);
  return `M${s.x} ${s.y} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 0 ${e.x} ${e.y}`;
}

/** Closed ring segment between two radii — a filled band on a dial. */
export function ringSegmentPath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const sweep = normalizeSweep(endDeg - startDeg);
  const end = startDeg + Math.min(sweep, 359.999);
  const large = sweep > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, end);
  const i2 = polar(cx, cy, rInner, end);
  const i1 = polar(cx, cy, rInner, startDeg);
  return (
    `M${o1.x} ${o1.y} A${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y} ` +
    `L${i2.x} ${i2.y} A${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y} Z`
  );
}

/**
 * Map a value in [min, max] onto an angle span. Day 38 of 83 on a full wheel:
 * valueToAngle(38, 1, 83) → degrees. Clamped to the span.
 */
export function valueToAngle(value, min, max, startDeg = 0, spanDeg = 360) {
  if (max === min) return startDeg;
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return round(startDeg + t * spanDeg);
}

/** 1 → "I", 4 → "IV", 2026 → "MMXXVI". Numbers the steps and folios. */
export function roman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new RangeError(`roman(): expected an integer 1–3999, got ${n}`);
  }
  const table = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, glyph] of table) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

/**
 * German number formatting the sheets use: decimal comma, thin grouping,
 * a real minus sign. formatNumber(-6) → "−6", formatNumber(1.18, 2) → "1,18".
 */
export function formatNumber(value, decimals = 0, { sign = false } = {}) {
  const s = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  if (value < 0) return `−${s}`;
  if (sign && value > 0) return `+${s}`;
  return s;
}

function normalizeSweep(sweep) {
  if (sweep >= 360) return 360;
  return ((sweep % 360) + 360) % 360;
}

function round(v) {
  return Math.round(v * 100) / 100;
}
