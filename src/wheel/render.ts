/**
 * Renders the wheel as an SVG string. Framework-free: the app owns the data
 * and the interaction (see JournalWheel for a ready-made interactive version).
 */
import { arcPath, labelArcPath, ringSegmentPath } from '@rafime/codex';
import { hatchSvg, strokeSvg, hash, HATCH_STYLES, TREMBLE_STYLES, type HatchStyle, type TrembleStyle } from '@rafime/codex/pen';
import { wheelLayout, slotEdge, slotAngle, polar, type WheelGeometryOptions, type WheelLayout, type WheelLaneGeometry } from './geometry';

export interface WheelMark {
    /** slot (day) index */
    i: number;
    kind: 'bar' | 'dot' | 'ring' | 'square' | 'tick' | 'span';
    /** bar length 0..1 (for `span`: its radial thickness 0..1) */
    value?: number;
    /** radial position inside the lane: 0 inner … 1 outer (default 0.5) */
    pos?: number;
    /** for `span`: last slot, inclusive */
    to?: number;
    color?: string;
    faint?: boolean;
    title?: string;
    /** for `span`: fill it with the wheel's hatching instead of a solid colour (planned, uncertain) */
    hatched?: boolean;
}

export interface WheelLane {
    id: string;
    label: string;
    marks?: WheelMark[];
}

export interface WheelSegment {
    from: number;
    to: number;
    label: string;
    key?: string;
    current?: boolean;
    /** fill colour for the segment (e.g. a period kind); the current one is also hatched */
    color?: string;
    /** hatch this segment even when it isn't the current one (or `false`: never) */
    hatched?: boolean;
}

/**
 * How the wheel hatches: the Codex pen's hatching styles, drawn clipped into
 * the rim segment (and hatched spans). Same shape as the pen settings, so
 * `variantWheelHatch('tide')` from @rafime/codex or an app's pen fits.
 */
export interface WheelHatch {
    /** diagonal | cross | stipple | scribble | engrave | contour | hachure | waves | mixed (mixed: each segment rolls its own) */
    hatch?: HatchStyle;
    /** 0.5–2.2, 1 = 3.75 units between lines */
    density?: number;
    /** degrees */
    angle?: number;
    /** wobble of the lines, 0–3 */
    amount?: number;
    seed?: number;
    /** which rim segments: 'current' (default) or 'all' (others lighter) */
    rim?: 'current' | 'all';
    /**
     * How the wheel's lines tremble (rim, lane guides, boundaries, hub, needle):
     * a pen hand — steady | quill | sketch | tremor | brush | dry | mixed — or
     * 'filter' (default): the SVG ink filter over everything.
     */
    tremble?: TrembleStyle | 'filter';
}

/** The wheel's hatching before apps choose their own: the old single-line pattern, drawn by the pen. */
export const WHEEL_HATCH_DEFAULTS: Required<WheelHatch> = Object.freeze({ hatch: 'diagonal', density: 0.65, angle: 38, amount: 0.6, seed: 1789, rim: 'current', tremble: 'filter' });

export interface WheelRenderOptions extends WheelGeometryOptions {
    count: number;
    today?: number | null;
    selected?: number | null;
    /** lane id to emphasise, or 'rim' */
    selectedLane?: string | null;
    rim?: WheelSegment[];
    lanes?: WheelLane[];
    hub?: { value: string | number; caption?: string };
    title?: string;
    /** prefix for ids inside the SVG; make it unique per wheel on a page */
    idPrefix?: string;
    /** hand-drawn tremor on the lines (default true) */
    inked?: boolean;
    /** hatching style of the current period and hatched spans (default WHEEL_HATCH_DEFAULTS) */
    hatch?: WheelHatch;
}

export function renderWheel(options: WheelRenderOptions): string {
    const { rim = [], lanes = [], hub, today = null, selected = null, selectedLane = null, title = 'Journal wheel', idPrefix = 'cx-wheel', inked = true } = options;
    const H = wheelHatch(options.hatch);
    const L = wheelLayout(options.count, lanes.map((l) => l.id), options);
    const { c } = L;
    const out: string[] = [];
    const text: string[] = [];
    const slotArc = Math.max(0.6, L.step * 0.62);
    const inkId = `${idPrefix}-ink`;
    // Lines: drawn by a pen hand (H.tremble) or wobbled by the SVG ink filter
    const penned = inked && H.tremble !== 'filter';
    const ink = inked && !penned ? ` filter="url(#${inkId})"` : '';
    // every line has its own fixed hand (`key`), so a line keeps its drawing
    // when other lines come and go (a new period, another span)
    const line = (cls: string, key: number, pts: [number, number][], o: { closed?: boolean; dashed?: boolean } = {}, plain: string) =>
        penned ? `<g class="${cls} cx-wheel__pen">${strokeSvg(H.tremble as TrembleStyle, pts, { seed: hash(H.seed, key), amount: H.amount, ...o })}</g>` : plain;

    out.push(`<svg class="cx-diagram cx-wheel${inked ? ' cx-wheel--inked' : ''}${penned ? ' cx-wheel--pen' : ''}" viewBox="0 0 ${L.size} ${L.size}" role="img" aria-label="${esc(title)}" data-count="${L.count}">`);
    // Own defs, so the wheel draws the same on any page: the ink tremor and the hatch
    out.push(`<defs><filter id="${inkId}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>`
        + `</defs>`);

    lanes.forEach((lane, i) => {
        const g = L.lanes[i];
        const isSel = selectedLane === lane.id;
        out.push(`<g class="cx-wheel__lane${isSel ? ' is-selected' : ''}" data-lane="${esc(lane.id)}"${ink}>`);
        out.push(`<path d="${ringSegmentPath(c, c, g.inner, g.outer, slotEdge(L, 0), slotEdge(L, L.count))}" class="cx-wheel__lane-bg"/>`);
        for (const [k, rr] of [g.outer, g.inner].entries()) out.push(line('cx-wheel__guide', 1000 + i * 2 + k, arcPts(c, rr, slotEdge(L, 0), slotEdge(L, L.count)), {}, `<path d="${arcPath(c, c, rr, slotEdge(L, 0), slotEdge(L, L.count))}" class="cx-wheel__guide"/>`));
        (lane.marks ?? []).forEach((m, k) => out.push(renderMark(L, g, m, slotArc, m.kind === 'span' && m.hatched ? { H, id: `${idPrefix}-h${i}-${k}`, n: i * 1000 + k } : null)));
        out.push('</g>');
        const labelId = `${idPrefix}-lane-${i}`;
        text.push(`<path id="${labelId}" d="${labelArcPath(c, c, g.mid - 3, -L.gapDeg / 2 + 2, L.gapDeg / 2 - 2)}" fill="none"/>`);
        text.push(`<text class="cx-wheel__lane-label${isSel ? ' is-selected' : ''}" data-lane-label="${esc(lane.id)}"><textPath href="#${labelId}" startOffset="50%" text-anchor="middle">${esc(fit(lane.label, arcLength(g.mid, L.gapDeg - 4), 5.2))}</textPath></text>`);
    });

    // Rim: periods / phases
    out.push(`<g class="cx-wheel__rim${selectedLane === 'rim' ? ' is-selected' : ''}" data-lane="rim"${ink}>`);
    for (const [k, rr] of [L.rim.outer, L.rim.inner].entries()) out.push(line('cx-wheel__rim-edge', 90 + k, arcPts(c, rr, 0, 360).slice(0, -1), { closed: true }, `<circle cx="${c}" cy="${c}" r="${rr}" class="cx-wheel__rim-edge"/>`));
    rim.forEach((seg, i) => {
        const a0 = slotEdge(L, seg.from);
        const a1 = slotEdge(L, seg.to + 1);
        const cls = `cx-wheel__segment${seg.current ? ' is-current' : ''}`;
        const d = ringSegmentPath(c, c, L.rim.inner, L.rim.outer, a0, a1);
        const hatched = seg.hatched ?? (seg.current || H.rim === 'all');
        const fill = seg.current
            ? ` style="fill:transparent${seg.color ? `;stroke:${seg.color}` : ''}"`
            : seg.color ? ` style="fill:color-mix(in srgb, ${seg.color} 22%, transparent)"` : '';
        if (hatched) out.push(hatchArea(d, ringBox(c, L.rim.inner, L.rim.outer, a0, a1), H, `${idPrefix}-rh${i}`, i, seg.current ? 'is-current' : '', seg.current ? seg.color : seg.color ?? 'var(--cx-ink-muted)'));
        out.push(`<path d="${d}" class="${cls}"${fill} data-key="${esc(seg.key ?? String(i))}"><title>${esc(seg.label)}</title></path>`);
        // with a pen, the rim circles and boundaries draw the outline; the current one gets its own
        if (penned && seg.current) out.push(`<g class="cx-wheel__segment-line cx-wheel__pen"${seg.color ? ` style="--wl:${seg.color}"` : ''}>${strokeSvg(H.tremble as TrembleStyle, ringPts(c, L.rim.inner, L.rim.outer, a0, a1), { seed: hash(H.seed, 300 + i), amount: H.amount, closed: true })}</g>`);
        const r = labelRadius((L.rim.inner + L.rim.outer) / 2, a0, a1, 3.3);
        const label = fit(seg.label, arcLength(r, a1 - a0) - 6, 6.4);
        if (label) {
            const labelId = `${idPrefix}-rim-${i}`;
            text.push(`<path id="${labelId}" d="${labelArcPath(c, c, r, a0, a1)}" fill="none"/>`);
            text.push(`<text class="cx-wheel__rim-label${seg.current ? ' is-current' : ''}"><textPath href="#${labelId}" startOffset="50%" text-anchor="middle">${esc(label)}</textPath></text>`);
        }
        if (i > 0 && seg.from !== rim[i - 1].to + 1) {
            // a gap between two segments: mark its start too
            const g0 = polar(c, c, L.rim.inner, slotEdge(L, rim[i - 1].to + 1));
            const g1 = polar(c, c, L.hub + 4, slotEdge(L, rim[i - 1].to + 1));
            out.push(line('cx-wheel__boundary', 2000 + i * 2, radialPts(g0, g1), { dashed: true }, `<line x1="${g0.x}" y1="${g0.y}" x2="${g1.x}" y2="${g1.y}" class="cx-wheel__boundary"/>`));
        }
        if (i > 0 || seg.from > 0) {
            const p0 = polar(c, c, L.rim.inner, a0);
            const p1 = polar(c, c, L.hub + 4, a0);
            out.push(line('cx-wheel__boundary', 2001 + i * 2, radialPts(p0, p1), { dashed: true }, `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" class="cx-wheel__boundary"/>`));
        }
    });
    for (const [k, a] of [slotEdge(L, 0), slotEdge(L, L.count)].entries()) {
        const p0 = polar(c, c, L.rim.outer, a);
        const p1 = polar(c, c, L.hub + 4, a);
        out.push(line('cx-wheel__edge', 92 + k, radialPts(p0, p1), {}, `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" class="cx-wheel__edge"/>`));
    }
    out.push('</g>');
    out.push(`<g class="cx-wheel__labels">${text.join('')}</g>`);

    // Today: the needle
    if (today !== null && today >= 0 && today < L.count) {
        const a = slotAngle(L, today);
        const p0 = polar(c, c, L.hub + 2, a);
        const p1 = polar(c, c, L.rim.outer + 2, a);
        const tipL = polar(c, c, L.rim.outer - 8, a - 1.6);
        const tipR = polar(c, c, L.rim.outer - 8, a + 1.6);
        out.push(`<g class="cx-wheel__needle"${ink}>${line('cx-wheel__needle-line', 95, radialPts(p0, p1), {}, `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}"/>`)}<path d="M${tipL.x} ${tipL.y} L${p1.x} ${p1.y} L${tipR.x} ${tipR.y} Z"/></g>`);
    }

    // The hand for the selected day — always present so it can move in place
    out.push(`<g class="cx-wheel__selected" data-role="selection">${wheelHand(L, selected, today)}</g>`);

    out.push(`<g class="cx-wheel__hub" data-lane="hub"><circle cx="${c}" cy="${c}" r="${L.hub}"${ink}/>`);
    if (penned) out.push(line('cx-wheel__hub-line', 96, arcPts(c, L.hub, 0, 360).slice(0, -1), { closed: true }, ''));
    out.push(`<text x="${c}" y="${c + (hub?.caption ? 6 : 12)}" text-anchor="middle" class="cx-wheel__hub-value" data-role="hub-value">${esc(String(hub?.value ?? ''))}</text>`);
    out.push(`<text x="${c}" y="${c + 24}" text-anchor="middle" class="cx-wheel__hub-caption" data-role="hub-caption">${esc(wheelHubCaption(L, hub?.caption ?? ''))}</text>`);
    out.push('</g></svg>');
    return out.join('');
}

/** Markup for the selection hand. Empty for no selection or for today (the needle shows it). */
export function wheelHand(layout: WheelLayout, selected: number | null | undefined, today: number | null = null): string {
    if (selected === null || selected === undefined || selected === today || selected < 0 || selected >= layout.count) return '';
    const { c } = layout;
    const a = slotAngle(layout, selected);
    const p0 = polar(c, c, layout.hub + 2, a);
    const p1 = polar(c, c, layout.rim.outer, a);
    const bead = polar(c, c, layout.rim.outer + 1, a);
    return `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}"/><circle cx="${bead.x}" cy="${bead.y}" r="4.5"/>`;
}

/** The hub caption, shortened to fit the hub. */
export function wheelHubCaption(layout: WheelLayout, caption: string): string {
    return fit(caption, layout.hub * 1.7, 5.6);
}

const TREMBLES: readonly string[] = ['filter', ...TREMBLE_STYLES];

/** Hatching settings with defaults filled in and numbers clamped. */
export function wheelHatch(h: WheelHatch = {}): Required<WheelHatch> {
    const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    const D = WHEEL_HATCH_DEFAULTS;
    return {
        hatch: (HATCH_STYLES as readonly string[]).includes(h.hatch as string) ? (h.hatch as HatchStyle) : D.hatch,
        density: num(h.density, 0.3, 2.2, D.density),
        angle: num(h.angle, -90, 90, D.angle),
        amount: num(h.amount, 0, 3, D.amount),
        seed: Math.round(num(h.seed, 1, 99999, D.seed)),
        rim: h.rim === 'all' ? 'all' : 'current',
        tremble: TREMBLES.includes(h.tremble as never) ? (h.tremble as TrembleStyle | 'filter') : D.tremble,
    };
}

interface Box { x: number; y: number; w: number; h: number }

/** Points along an arc (degrees, clockwise from the top) about every 4 units, for the pen. */
function arcPts(c: number, r: number, a0: number, a1: number): [number, number][] {
    const n = Math.max(2, Math.ceil((Math.PI * r * Math.abs(a1 - a0)) / 180 / 4));
    const out: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
        const p = polar(c, c, r, a0 + ((a1 - a0) * k) / n);
        out.push([p.x, p.y]);
    }
    return out;
}

/** The outline of a ring segment as one closed polyline. */
function ringPts(c: number, r0: number, r1: number, a0: number, a1: number): [number, number][] {
    return [...arcPts(c, r1, a0, a1), ...arcPts(c, r0, a1, a0)];
}

function radialPts(a: { x: number; y: number }, b: { x: number; y: number }): [number, number][] {
    return [[a.x, a.y], [b.x, b.y]];
}

/** Bounding box of a ring segment (sampled along both arcs). */
function ringBox(c: number, r0: number, r1: number, a0: number, a1: number): Box {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 4));
    for (let k = 0; k <= n; k++) {
        const a = a0 + ((a1 - a0) * k) / n;
        for (const r of [r0, r1]) {
            const p = polar(c, c, r, a);
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        }
    }
    return { x: Math.floor(x0 - 1), y: Math.floor(y0 - 1), w: Math.ceil(x1 - x0 + 2), h: Math.ceil(y1 - y0 + 2) };
}

// The same segment is hatched again on every render (selection, drag, span):
// keep the last drawings instead of rolling them again.
const hatchCache = new Map<string, string>();
function cachedHatch(style: HatchStyle, w: number, h: number, o: { seed: number; density: number; angle: number; amount: number }): string {
    const key = `${style}|${w}|${h}|${o.seed}|${o.density}|${o.angle}|${o.amount}`;
    let svg = hatchCache.get(key);
    if (svg === undefined) {
        svg = hatchSvg(style, w, h, o);
        if (hatchCache.size > 200) hatchCache.delete(hatchCache.keys().next().value!);
        hatchCache.set(key, svg);
    }
    return svg;
}

/** Hatching clipped into the path `d`. `n` varies the hand per area; `color` inks it (default the accent). */
function hatchArea(d: string, box: Box, H: Required<WheelHatch>, id: string, n: number, cls = '', color?: string): string {
    const lines = cachedHatch(H.hatch, box.w, box.h, { seed: hash(H.seed, n + 1), density: H.density, angle: H.angle, amount: H.amount });
    const style = color ? ` style="--wheel-hatch:${color}"` : '';
    return `<g class="cx-wheel__hatch${cls ? ` ${cls}` : ''}"${style} clip-path="url(#${id})"><clipPath id="${id}"><path d="${d}"/></clipPath><g transform="translate(${box.x} ${box.y})">${lines}</g></g>`;
}

function renderMark(L: WheelLayout, g: WheelLaneGeometry, m: WheelMark, slotArc: number, hatch: { H: Required<WheelHatch>; id: string; n: number } | null = null): string {
    if (m.i < 0 || m.i >= L.count) return '';
    const a = slotAngle(L, m.i);
    const pos = m.pos ?? 0.5;
    const band = g.outer - g.inner;
    const r = g.inner + band * pos;
    const style = m.color ? ` style="--mark:${m.color}"` : '';
    const cls = `cx-wheel__mark cx-wheel__mark--${m.kind}${m.faint ? ' is-faint' : ''}`;
    const tip = m.title ? `<title>${esc(m.title)}</title>` : '';
    switch (m.kind) {
        case 'bar': {
            const len = Math.max(1.5, band * Math.min(1, Math.max(0, m.value ?? 1)));
            return `<path d="${ringSegmentPath(L.c, L.c, g.inner, g.inner + len, a - slotArc / 2, a + slotArc / 2)}" class="${cls}"${style}>${tip}</path>`;
        }
        case 'span': {
            const to = Math.min(L.count - 1, Math.max(m.i, m.to ?? m.i));
            const thick = Math.max(1.5, band * Math.min(1, m.value ?? 0.3));
            const r0 = Math.max(g.inner, r - thick / 2);
            const r1 = Math.min(g.outer, r0 + thick);
            const d = ringSegmentPath(L.c, L.c, r0, r1, slotEdge(L, m.i), slotEdge(L, to + 1));
            if (!hatch) return `<path d="${d}" class="${cls}"${style}>${tip}</path>`;
            // hatched span: the hatching in the mark colour inside a thin outline
            return hatchArea(d, ringBox(L.c, r0, r1, slotEdge(L, m.i), slotEdge(L, to + 1)), hatch.H, hatch.id, hatch.n, m.faint ? 'is-faint' : '', m.color)
                + `<path d="${d}" class="${cls} is-hatched"${style}>${tip}</path>`;
        }
        case 'tick': {
            const p0 = polar(L.c, L.c, g.inner + 2, a);
            const p1 = polar(L.c, L.c, g.outer - 2, a);
            return `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" class="${cls}"${style}>${tip}</line>`;
        }
        case 'square': {
            const p = polar(L.c, L.c, r, a);
            const s = Math.min(6, band * 0.3);
            return `<rect x="${rnd(p.x - s / 2)}" y="${rnd(p.y - s / 2)}" width="${rnd(s)}" height="${rnd(s)}" transform="rotate(${rnd(a)} ${p.x} ${p.y})" class="${cls}"${style}>${tip}</rect>`;
        }
        default: {
            const p = polar(L.c, L.c, r, a);
            const rad = Math.min(3.6, band * 0.2);
            return `<circle cx="${p.x}" cy="${p.y}" r="${rnd(rad)}" class="${cls}"${style}>${tip}</circle>`;
        }
    }
}

/**
 * Baseline radius that centres a label on the ring at `mid`. Labels in the
 * bottom half are flipped by labelArcPath() to read upright, so their letters
 * grow towards the centre instead of outwards: move their baseline out by the
 * same half cap height the top labels are moved in.
 */
export function labelRadius(mid: number, a0: number, a1: number, halfCap: number): number {
    const d = a1 - a0;
    const sweep = d >= 360 ? 360 : ((d % 360) + 360) % 360; // as labelArcPath()
    const m = (((a0 + sweep / 2) % 360) + 360) % 360;
    const flipped = !(m <= 90 || m >= 270 || sweep >= 360);
    return flipped ? mid + halfCap : mid - halfCap;
}

function arcLength(r: number, deg: number): number {
    return (Math.PI * r * deg) / 180;
}

/** Shorten a label to what fits an arc: full, abbreviated with a period, or nothing. */
function fit(label: string, room: number, perChar: number): string {
    const s = String(label ?? '');
    if (s.length * perChar <= room) return s;
    const n = Math.floor(room / perChar) - 1;
    return n >= 3 ? `${s.slice(0, n).replace(/[\s·,.;:–-]+$/, '')}…` : '';
}

export function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function rnd(v: number): number {
    return Math.round(v * 100) / 100;
}
