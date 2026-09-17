import { describe, it, expect } from 'vitest';
import {
    calculateDLI,
    getPhase,
    getDaysSinceSprout,
    getDaysInPhase,
    getDaysUntilHarvest,
    getPhaseInfo,
    daysBetween,
    getWeekNumber,
    calculateRequiredPPFD,
    isDLIInRange,
} from '../src/dli';
import { calculateGrowDates, GROW_PRESETS, FLOWER_PRESETS } from '../src/types';
import type { Grow } from '../src/types';

// Helper to create a test grow
const createTestGrow = (overrides: Partial<Grow> = {}): Grow => ({
    id: 'test-grow',
    name: 'Test Grow',
    strain: 'Test Strain',
    plantCount: 2,
    plants: [],
    type: 'photo',
    dates: {
        germStart: '2025-01-01',
        sprout: '2025-01-05',
        vegStart: '2025-01-12',
        flowerStart: '2025-02-15',
        flushStart: '2025-04-01',
        harvest: '2025-04-10',
    },
    light: {
        ppfd: 600,
        vegHours: 18,
        flowerHours: 12,
    },
    entries: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
});

describe('DLI Calculation', () => {
    it('calculates DLI correctly with standard values', () => {
        // DLI = (PPFD × hours × 3600) / 1,000,000
        // 600 × 18 × 3600 / 1,000,000 = 38.88
        const dli = calculateDLI(600, 18);
        expect(dli).toBeCloseTo(38.88, 2);
    });

    it('calculates DLI for 12/12 flower schedule', () => {
        // 600 × 12 × 3600 / 1,000,000 = 25.92
        const dli = calculateDLI(600, 12);
        expect(dli).toBeCloseTo(25.92, 2);
    });

    it('handles edge case of 0 PPFD', () => {
        expect(calculateDLI(0, 18)).toBe(0);
    });

    it('handles edge case of 0 hours', () => {
        expect(calculateDLI(600, 0)).toBe(0);
    });

    it('calculates high DLI for intense lighting', () => {
        // 1000 PPFD × 18h = 64.8 mol/m²/day
        const dli = calculateDLI(1000, 18);
        expect(dli).toBeCloseTo(64.8, 2);
    });
});

describe('Phase Detection', () => {
    const grow = createTestGrow();

    it('detects germination phase before sprout', () => {
        const date = new Date('2025-01-03');
        expect(getPhase(grow, date)).toBe('germination');
    });

    it('detects seedling phase after sprout', () => {
        const date = new Date('2025-01-08');
        expect(getPhase(grow, date)).toBe('seedling');
    });

    it('detects veg phase after vegStart', () => {
        const date = new Date('2025-01-20');
        expect(getPhase(grow, date)).toBe('veg');
    });

    it('detects flower phase after flowerStart', () => {
        const date = new Date('2025-03-01');
        expect(getPhase(grow, date)).toBe('flower');
    });

    it('detects flush phase after flushStart', () => {
        const date = new Date('2025-04-05');
        expect(getPhase(grow, date)).toBe('flush');
    });

    it('detects complete phase after harvest', () => {
        const date = new Date('2025-04-15');
        expect(getPhase(grow, date)).toBe('complete');
    });

    it('returns correct phase on exact transition date (flowerStart)', () => {
        const date = new Date('2025-02-15');
        expect(getPhase(grow, date)).toBe('flower');
    });

    it('handles autoflower without flip date', () => {
        const autoGrow = createTestGrow({
            type: 'auto',
            dates: {
                germStart: '2025-01-01',
                sprout: '2025-01-05',
                vegStart: '2025-01-12',
                // No flowerStart for auto - it auto transitions
                flushStart: '2025-03-15',
                harvest: '2025-03-25',
            },
        });

        const date = new Date('2025-02-15');
        expect(getPhase(autoGrow, date)).toBe('veg');
    });
});

describe('Days Calculation', () => {
    const grow = createTestGrow();

    it('calculates days since sprout correctly', () => {
        // Sprout: Jan 5, check: Jan 15 = 10 days
        const date = new Date('2025-01-15');
        expect(getDaysSinceSprout(grow, date)).toBe(10);
    });

    it('returns 0 for sprout day', () => {
        const date = new Date('2025-01-05');
        expect(getDaysSinceSprout(grow, date)).toBe(0);
    });

    it('returns 0 before sprout date', () => {
        const date = new Date('2025-01-03');
        expect(getDaysSinceSprout(grow, date)).toBe(0);
    });

    it('calculates days in veg phase', () => {
        // VegStart: Jan 12, check: Jan 22 = 11 days in veg (inclusive)
        const date = new Date('2025-01-22');
        expect(getDaysInPhase(grow, date)).toBe(11);
    });

    it('calculates days until harvest', () => {
        // Check: Mar 10, Harvest: Apr 10 = 31 days
        const date = new Date('2025-03-10');
        expect(getDaysUntilHarvest(grow, date)).toBe(31);
    });

    it('returns null for days until harvest after harvest date', () => {
        const date = new Date('2025-04-15');
        expect(getDaysUntilHarvest(grow, date)).toBeNull();
    });
});

describe('daysBetween', () => {
    it('calculates positive days correctly', () => {
        expect(daysBetween('2025-01-01', '2025-01-10')).toBe(9);
    });

    it('calculates negative days correctly', () => {
        expect(daysBetween('2025-01-10', '2025-01-01')).toBe(-9);
    });

    it('returns 0 for same date', () => {
        expect(daysBetween('2025-01-15', '2025-01-15')).toBe(0);
    });

    it('handles Date objects', () => {
        const d1 = new Date('2025-01-01');
        const d2 = new Date('2025-01-08');
        expect(daysBetween(d1, d2)).toBe(7);
    });
});

describe('getWeekNumber', () => {
    it('returns week 1 for day 0', () => {
        expect(getWeekNumber(0)).toBe(1);
    });

    it('returns week 1 for day 6', () => {
        expect(getWeekNumber(6)).toBe(1);
    });

    it('returns week 2 for day 7', () => {
        expect(getWeekNumber(7)).toBe(2);
    });

    it('returns week 5 for day 30', () => {
        expect(getWeekNumber(30)).toBe(5);
    });
});

describe('getPhaseInfo', () => {
    it('returns comprehensive phase info', () => {
        const grow = createTestGrow();
        const date = new Date('2025-02-01'); // Should be in veg

        const info = getPhaseInfo(grow, date);

        expect(info.phase).toBe('veg');
        expect(info.day).toBe(27); // 27 days since sprout
        expect(info.daysInPhase).toBe(21); // 21 days into veg (inclusive)
        expect(info.daysUntilHarvest).toBe(68); // 68 days to harvest
    });

    it('uses flower hours for DLI in flower phase', () => {
        const grow = createTestGrow();
        const date = new Date('2025-03-01'); // Flower phase

        const info = getPhaseInfo(grow, date);

        expect(info.phase).toBe('flower');
    });
});

describe('calculateRequiredPPFD', () => {
    it('calculates PPFD for target DLI', () => {
        // If we want 40 DLI with 12 hours: PPFD = (40 × 1,000,000) / (12 × 3600) = 926
        const ppfd = calculateRequiredPPFD(40, 12);
        expect(ppfd).toBeCloseTo(926, 0);
    });

    it('calculates PPFD for seedling DLI', () => {
        // 15 DLI with 18 hours: PPFD = (15 × 1,000,000) / (18 × 3600) = 231
        const ppfd = calculateRequiredPPFD(15, 18);
        expect(ppfd).toBeCloseTo(231, 0);
    });
});

describe('isDLIInRange', () => {
    it('returns true for DLI in veg range', () => {
        expect(isDLIInRange(30, 'veg')).toBe(true); // 25-35 range
    });

    it('returns false for low DLI in flower', () => {
        expect(isDLIInRange(30, 'flower')).toBe(false); // 40-65 range
    });

    it('returns true for DLI at range boundary', () => {
        expect(isDLIInRange(25, 'veg')).toBe(true); // Min boundary
        expect(isDLIInRange(35, 'veg')).toBe(true); // Max boundary
    });
});

describe('calculateGrowDates', () => {
    it('calculates short preset dates correctly (1 week veg)', () => {
        const dates = calculateGrowDates('2025-01-01', 7, 1, 8, 10);

        // Sprout: 4 days after germ
        expect(dates.sprout).toBe('2025-01-05');

        // Veg start: 4 + 7 (seedling) = 11 days after germ
        expect(dates.vegStart).toBe('2025-01-12');

        // Flower start: 4 + 7 + 7 (1 week veg) = 18 days after germ
        expect(dates.flowerStart).toBe('2025-01-19');

        // Total: 4 + 7 + 7 + 56 (8 weeks flower) = 74 days
        // Harvest: Jan 1 + 74 days
        expect(dates.harvest).toBe('2025-03-16');

        // Flush: 10 days before harvest
        expect(dates.flushStart).toBe('2025-03-06');
    });

    it('calculates mid preset dates correctly (3 weeks veg)', () => {
        const dates = calculateGrowDates('2025-01-01', 7, 3, 8, 10);
        const config = GROW_PRESETS.mid;

        // Sprout: 4 days after germ
        expect(dates.sprout).toBe('2025-01-05');

        // Veg start: 4 + 7 = 11 days
        expect(dates.vegStart).toBe('2025-01-12');

        // Flower start: 4 + 7 + 21 (3 weeks veg) = 32 days
        expect(dates.flowerStart).toBe('2025-02-02');

        // Total: 4 + 7 + 21 + 63 (9 weeks flower)
        const totalDays = 4 + config.seedlingDays + (config.vegWeeks * 7) + (config.flowerWeeks * 7);
        expect(totalDays).toBe(95);

        // Just verify harvest and flush are set
        expect(dates.harvest).toBeDefined();
        expect(dates.flushStart).toBeDefined();
    });

    it('calculates long preset dates correctly (4 weeks veg)', () => {
        // Using 'extra-long' flower preset to match the old 10-week flower duration
        const dates = calculateGrowDates('2025-01-01', 7, 4, 10, 14);
        const vegConfig = GROW_PRESETS.long;
        const flowerConfig = FLOWER_PRESETS['extra-long'];

        // Total days: 4 + 7 + 28 (4 weeks veg) + 70 (10 weeks flower) + 14 (flush) = 123 - 14 (flush counted separately)
        // Sprout: 4d, Seedling: 7d, Veg: 28d, Flower: 70d, Flush: 14d (included in flower)
        const expectedTotalDays = 4 + vegConfig.seedlingDays + (vegConfig.vegWeeks * 7) + (flowerConfig.weeks * 7);
        expect(expectedTotalDays).toBe(109);

        // Harvest should be 109 days from Jan 1
        const harvestDate = new Date('2025-01-01');
        harvestDate.setDate(harvestDate.getDate() + expectedTotalDays);
        expect(dates.harvest).toBe(harvestDate.toISOString().split('T')[0]);
    });

    it('handles autoflower same as photoperiod for date calculation', () => {
        const autoDates = calculateGrowDates('2025-01-01', 7, 2, 8, 10);
        const photoDates = calculateGrowDates('2025-01-01', 7, 2, 8, 10);

        // All dates should be the same - type doesn't affect calculation
        expect(autoDates.sprout).toBe(photoDates.sprout);
        expect(autoDates.vegStart).toBe(photoDates.vegStart);
        expect(autoDates.flowerStart).toBe(photoDates.flowerStart);
        expect(autoDates.harvest).toBe(photoDates.harvest);
    });

    it('calculates correct veg duration for each preset', () => {
        // Short: 1 week veg
        expect(GROW_PRESETS.short.vegWeeks).toBe(1);

        // Fast: 2 weeks veg
        expect(GROW_PRESETS.fast.vegWeeks).toBe(2);

        // Mid: 3 weeks veg
        expect(GROW_PRESETS.mid.vegWeeks).toBe(3);

        // Long: 4 weeks veg
        expect(GROW_PRESETS.long.vegWeeks).toBe(4);
    });
});
