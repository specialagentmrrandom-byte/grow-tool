/**
 * The grow seal: a small, generated emblem that tells grows apart at a glance.
 * Everything is derived from the grow's id, so a grow keeps its seal forever and
 * two grows practically never share one:
 *
 * - pigment      one of the eight Codex plant pigments
 * - leaf         3–9 leaflets, their spread, length and tilt
 * - ground       a motif behind the leaf in a second pigment (rings, dotted ring, rays, band)
 * - rim          the grow's progress from germination to harvest as an arc
 *
 * Returns an SVG string; colours are CSS variables so it follows the theme.
 */
import type { Grow } from './types';
import { codexColor } from './types';
import { polar, arcPath } from '@rafime/codex';

export interface SealTraits {
    pigment: number;   // 1–8
    leaflets: number;  // odd, 3–9
    spread: number;    // degrees covered by the fan
    length: number;    // 0.8–1.0, scales the middle leaflet
    width: number;     // leaflet width factor
    tilt: number;      // degrees
    motif: 'rings' | 'dots' | 'rays' | 'plain';   // plain = a solid band
}

/** 32-bit FNV-1a — small, stable, good enough to spread ids. */
export function hashString(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function sealTraits(id: string): SealTraits {
    const h = hashString(id);
    const pick = (shift: number, n: number) => Math.floor(((h >>> shift) & 0xff) / 256 * n);
    const motifs: SealTraits['motif'][] = ['rings', 'dots', 'rays', 'plain'];
    return {
        pigment: 1 + (h % 8),
        leaflets: [3, 5, 5, 7, 7, 7, 9, 9][pick(3, 8)],
        spread: 130 + pick(11, 7) * 12,
        length: 0.8 + pick(19, 5) * 0.05,
        width: 0.16 + pick(24, 4) * 0.035,
        tilt: -24 + pick(8, 7) * 8,
        motif: motifs[pick(14, 4)],
    };
}

/** Share of the cycle from germination to harvest that has passed, or null without a harvest date. */
export function growProgress(grow: Grow, today: Date = new Date()): number | null {
    if (!grow.dates.harvest) return null;
    const start = new Date(grow.dates.germStart).getTime();
    const end = new Date(grow.dates.harvest).getTime();
    if (!(end > start)) return null;
    return Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)));
}

export function growSeal(grow: Grow, size = 56, today: Date = new Date()): string {
    const t = sealTraits(grow.id);
    const ink = codexColor(`plant-${t.pigment}`);
    // the ground motif takes a second pigment, so colour pairs tell grows apart too
    const accent = codexColor(`plant-${((t.pigment + 2) % 8) + 1}`);
    const c = 50;
    const parts: string[] = [];

    // ground
    parts.push(`<circle cx="50" cy="50" r="46" style="fill: color-mix(in srgb, ${ink} 14%, var(--cx-paper, #dcd5ab))"/>`);
    const faint = `stroke: ${accent}; opacity: .6`;
    if (t.motif === 'rings') {
        for (const r of [22, 30, 38]) parts.push(`<circle cx="50" cy="50" r="${r}" fill="none" style="${faint}" stroke-width=".8"/>`);
    } else if (t.motif === 'dots') {
        for (let i = 0; i < 24; i++) {
            const p = polar(c, c, 38, i * 15);
            parts.push(`<circle cx="${p.x}" cy="${p.y}" r="1.6" style="fill: ${accent}; opacity: .7"/>`);
        }
    } else if (t.motif === 'plain') {
        parts.push(`<circle cx="50" cy="50" r="41" fill="none" style="stroke: ${accent}; opacity: .55" stroke-width="5"/>`);
    } else if (t.motif === 'rays') {
        for (let i = 0; i < 16; i++) {
            const a = i * 22.5;
            const p0 = polar(c, c, 30, a);
            const p1 = polar(c, c, 41, a);
            parts.push(`<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" style="${faint}" stroke-width=".9"/>`);
        }
    }

    // leaf: a fan of leaflets from one base, like a cannabis leaf
    const base = { x: 50, y: 64 };
    const leaves: string[] = [];
    const n = t.leaflets;
    for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0 : i / (n - 1) - 0.5;            // −0.5 … 0.5
        const a = k * t.spread;                                // degrees from straight up
        const len = 44 * t.length * (1 - Math.abs(k) * 0.9);   // outer leaflets shorter
        const tip = polar(base.x, base.y, len, a);
        const off = (Math.atan(t.width / 0.45) * 180) / Math.PI;   // leaflet half-width as an angle
        const l = polar(base.x, base.y, len * 0.5, a - off);
        const r = polar(base.x, base.y, len * 0.5, a + off);
        leaves.push(`M${base.x} ${base.y} Q${l.x} ${l.y} ${tip.x} ${tip.y} Q${r.x} ${r.y} ${base.x} ${base.y}Z`);
    }
    parts.push(`<g transform="rotate(${t.tilt} 50 60)"><path d="${leaves.join(' ')}" style="fill: ${ink}"/>`
        + `<path d="M50 64 Q51 74 47 84" fill="none" style="stroke: ${ink}" stroke-width="1.6" stroke-linecap="round"/></g>`);

    // rim: track + progress of the cycle
    parts.push(`<circle cx="50" cy="50" r="46" fill="none" style="stroke: var(--cx-ink-soft, rgba(51,41,28,.78))" stroke-width="1"/>`);
    const progress = growProgress(grow, today);
    if (progress !== null && progress > 0) {
        const d = progress >= 1
            ? `M50 4 A46 46 0 1 1 49.99 4`
            : arcPath(c, c, 46, 0, progress * 360);
        parts.push(`<path d="${d}" fill="none" style="stroke: var(--cx-rust, #9c4a2f)" stroke-width="2.6" stroke-linecap="round"/>`);
    }

    const label = progress !== null ? `${Math.round(progress * 100)}% of the grow done` : 'Grow seal';
    return `<svg class="grow-seal-svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}
