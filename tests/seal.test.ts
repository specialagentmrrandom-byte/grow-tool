import { describe, it, expect } from 'vitest';
import { growSeal, sealTraits, growProgress, hashString } from '../src/seal';
import type { Grow } from '../src/types';

const grow = (id: string, harvest: string | null = '2026-03-01') =>
    ({ id, dates: { germStart: '2026-01-01', harvest: harvest ?? undefined } } as unknown as Grow);

describe('grow seal', () => {
    it('is stable for a grow and differs between grows', () => {
        const at = new Date('2026-02-01');
        expect(growSeal(grow('a1'), 56, at)).toBe(growSeal(grow('a1'), 56, at));
        const seals = new Set(Array.from({ length: 40 }, (_, i) => growSeal(grow(`grow-${i}`), 56, at)));
        expect(seals.size).toBe(40);
    });

    it('spreads traits over the whole range', () => {
        const traits = Array.from({ length: 400 }, (_, i) => sealTraits(`id-${i}-${hashString(String(i))}`));
        expect(new Set(traits.map((t) => t.pigment)).size).toBe(8);
        expect(new Set(traits.map((t) => t.leaflets))).toEqual(new Set([3, 5, 7, 9]));
        expect(new Set(traits.map((t) => t.motif)).size).toBe(4);
        for (const t of traits) {
            expect(t.pigment).toBeGreaterThanOrEqual(1);
            expect(t.pigment).toBeLessThanOrEqual(8);
            expect(t.leaflets % 2).toBe(1);
        }
    });

    it('draws the cycle progress on the rim, none without a harvest date', () => {
        expect(growProgress(grow('x'), new Date('2025-12-01'))).toBe(0);
        expect(growProgress(grow('x'), new Date('2026-01-31'))).toBeCloseTo(30 / 59, 5);
        expect(growProgress(grow('x'), new Date('2026-06-01'))).toBe(1);
        expect(growProgress(grow('x', null))).toBeNull();
        expect(growSeal(grow('x'), 56, new Date('2026-01-31'))).toContain('var(--cx-rust');
        expect(growSeal(grow('x', null))).not.toContain('var(--cx-rust');
    });

    it('uses theme colours, not fixed ones', () => {
        const svg = growSeal(grow('b2'));
        expect(svg).toMatch(/var\(--grow-plant-\d, #[0-9a-f]{6}\)/);
        expect(svg).toContain('viewBox="0 0 100 100"');
    });
});
