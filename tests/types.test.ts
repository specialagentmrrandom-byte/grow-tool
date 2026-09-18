import { describe, it, expect } from 'vitest';
import {
    DLI_TARGETS, DLI_TARGETS_GRANULAR, FLOWER_PRESETS, GROW_PRESETS, MILESTONE_EMOJIS, MILESTONE_PRESETS,
    PHASE_COLORS, PLANT_COLORS, POT_SIZES, REMINDER_BUFFERS, TENT_SIZES, DEFAULT_LIGHT,
    generateId, potLitersToSideCm, type Phase,
} from '../src/types';

/**
 * The lookup tables are what the whole app reads off — a phase or preset that is
 * added to one of them and forgotten in another shows up as a blank label, a
 * missing colour or an undefined light target. These tests keep them in step.
 */
const PHASES: Phase[] = ['germination', 'seedling', 'veg', 'flower', 'flush', 'harvest', 'complete'];

describe('domain tables', () => {
    it('has a colour and a light target for every phase', () => {
        for (const phase of PHASES) {
            expect(PHASE_COLORS[phase], phase).toMatch(/^#[0-9A-Fa-f]{6}$/);
            expect(DLI_TARGETS[phase], phase).toBeDefined();
            expect(DLI_TARGETS[phase].max).toBeGreaterThanOrEqual(DLI_TARGETS[phase].min);
        }
        expect(Object.keys(PHASE_COLORS).sort()).toEqual([...PHASES].sort());
    });

    it('gives growing phases a light target and the finished ones none', () => {
        for (const phase of ['germination', 'seedling', 'veg', 'flower', 'flush'] as Phase[]) {
            expect(DLI_TARGETS[phase].min, phase).toBeGreaterThan(0);
        }
        expect(DLI_TARGETS.harvest.max).toBe(0);
        expect(DLI_TARGETS.complete.max).toBe(0);
    });

    it('keeps the week-by-week targets sane for both grow types', () => {
        for (const [key, target] of Object.entries(DLI_TARGETS_GRANULAR)) {
            for (const type of ['auto', 'photo'] as const) {
                const { min, max, description } = target[type];
                expect(min, `${key}.${type}`).toBeGreaterThanOrEqual(0);
                expect(max, `${key}.${type}`).toBeGreaterThanOrEqual(min);
                expect(description.length, `${key}.${type}`).toBeGreaterThan(0);
            }
        }
        // the phases the calculator looks up must all be in there
        for (const key of ['germination', 'seedling_1', 'veg_1', 'flower_1']) {
            expect(DLI_TARGETS_GRANULAR[key], key).toBeDefined();
        }
    });

    it('has an emoji for every milestone preset', () => {
        expect(Object.keys(MILESTONE_EMOJIS).sort()).toEqual([...MILESTONE_PRESETS].sort());
        for (const preset of MILESTONE_PRESETS) {
            expect(MILESTONE_EMOJIS[preset], preset).not.toBe('');
        }
    });

    it('keeps the grow presets in the order the form offers them', () => {
        const weeks = (['short', 'fast', 'mid', 'long'] as const).map(k => GROW_PRESETS[k].vegWeeks);
        expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
        for (const preset of Object.values(GROW_PRESETS)) {
            expect(preset.label).not.toBe('');
            expect(preset.flowerWeeks).toBeGreaterThan(0);
            expect(preset.flushDays).toBeGreaterThan(0);
            expect(preset.seedlingDays).toBeGreaterThan(0);
        }
        for (const preset of Object.values(FLOWER_PRESETS)) {
            expect(preset.weeks).toBeGreaterThanOrEqual(7);
            expect(preset.flushDays).toBeLessThan(preset.weeks * 7);
        }
    });

    it('offers plausible reminder buffers and tent sizes', () => {
        expect(REMINDER_BUFFERS.map(b => b.days)).toEqual([0, 1, 2, 3, 7]);
        for (const tent of TENT_SIZES) {
            expect(tent.width).toBeGreaterThan(0);
            expect(tent.depth).toBeGreaterThan(0);
            expect(tent.label).toContain('cm');
        }
        expect(PLANT_COLORS.length).toBeGreaterThan(3);
        expect(new Set(PLANT_COLORS).size).toBe(PLANT_COLORS.length);   // no repeats
        expect(DEFAULT_LIGHT.vegHours).toBeGreaterThan(DEFAULT_LIGHT.flowerHours);
    });
});

describe('potLitersToSideCm', () => {
    it('uses the exact size when there is one', () => {
        for (const [liters, cm] of Object.entries(POT_SIZES)) {
            expect(potLitersToSideCm(Number(liters))).toBe(cm);
        }
    });

    it('interpolates between the two nearest sizes', () => {
        const sizes = Object.keys(POT_SIZES).map(Number).sort((a, b) => a - b);
        const [lower, upper] = [sizes[0], sizes[1]];
        const middle = (lower + upper) / 2;

        const cm = potLitersToSideCm(middle);
        expect(cm).toBeGreaterThan(POT_SIZES[lower]);
        expect(cm).toBeLessThan(POT_SIZES[upper]);
        expect(cm).toBeCloseTo((POT_SIZES[lower] + POT_SIZES[upper]) / 2, 5);
    });

    it('grows with the pot', () => {
        expect(potLitersToSideCm(5)).toBeLessThan(potLitersToSideCm(25));
    });

    it('clamps outside the table instead of running off', () => {
        const sizes = Object.keys(POT_SIZES).map(Number).sort((a, b) => a - b);
        const smallest = sizes[0];
        const largest = sizes[sizes.length - 1];
        expect(potLitersToSideCm(0.1)).toBe(POT_SIZES[smallest]);
        expect(potLitersToSideCm(10_000)).toBe(POT_SIZES[largest]);
    });

    it('falls back to the standard pot for nonsense input', () => {
        const fallback = POT_SIZES[11];
        expect(potLitersToSideCm(0)).toBe(fallback);
        expect(potLitersToSideCm(NaN)).toBe(fallback);
        expect(potLitersToSideCm(undefined as unknown as number)).toBe(fallback);
        expect(potLitersToSideCm('12' as unknown as number)).toBe(fallback);
    });
});

describe('generateId', () => {
    it('prefixes the id so a stray id says where it came from', () => {
        expect(generateId('grow')).toMatch(/^grow_\d+_[a-z0-9]+$/);
        expect(generateId()).toMatch(/^id_/);
    });

    it('does not repeat itself inside one millisecond', () => {
        const ids = new Set(Array.from({ length: 500 }, () => generateId('entry')));
        expect(ids.size).toBe(500);
    });
});
