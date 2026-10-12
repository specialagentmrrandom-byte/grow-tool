import { describe, it, expect } from 'vitest';
import { buildDiscModel, lastBefore, countEntries, isCareEntry, hasPhoto, dateKey } from '../src/disc';
import type { Grow, Entry } from '../src/types';

function entry(date: string, type: Entry['type'], title: string = type, extra: Partial<Entry> = {}): Entry {
    return { id: `${date}-${type}-${title}`, date, day: 0, phase: 'veg', type, title, createdAt: date, updatedAt: date, ...extra };
}

function grow(entries: Entry[] = [], harvest: string | null = '2026-03-01'): Grow {
    return {
        id: 'g1',
        name: 'Test',
        strain: 'Test Kush',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: {
            germStart: '2026-01-01',
            sprout: '2026-01-05',
            vegStart: '2026-01-12',
            flowerStart: '2026-02-01',
            flushStart: '2026-02-20',
            harvest: harvest ?? undefined,
        },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
        entries,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
    };
}

describe('grow disc model', () => {
    it('has one slot per day from germination through harvest', () => {
        const m = buildDiscModel(grow(), new Date('2026-01-20T12:00:00Z'));
        expect(m.days).toHaveLength(60);
        expect(m.days[0].key).toBe('2026-01-01');
        expect(m.days.at(-1)!.key).toBe('2026-03-01');
        expect(m.todayIndex).toBe(19);
        expect(m.days[19].day).toBe(15); // days since sprout
    });

    it('runs two weeks past today when no harvest date is set', () => {
        const m = buildDiscModel(grow([], null), new Date('2026-01-20T12:00:00Z'));
        expect(m.days.at(-1)!.key).toBe('2026-02-03');
    });

    it('marks today as null outside the grow', () => {
        expect(buildDiscModel(grow(), new Date('2026-05-01')).todayIndex).toBeNull();
    });

    it('splits the rim into contiguous phase spans in order', () => {
        const m = buildDiscModel(grow(), new Date('2026-01-20'));
        expect(m.phases.map((p) => p.phase)).toEqual(['germination', 'seedling', 'veg', 'flower', 'flush', 'complete']);
        for (let i = 1; i < m.phases.length; i++) expect(m.phases[i].from).toBe(m.phases[i - 1].to + 1);
        expect(m.phases[0].from).toBe(0);
        expect(m.phases.at(-1)!.to).toBe(m.days.length - 1);
        const flower = m.phases.find((p) => p.phase === 'flower')!;
        expect(m.days[flower.from].key).toBe('2026-02-01');
    });

    it('plans light by phase: dark germination, veg hours, flower hours, lamp off after harvest', () => {
        const m = buildDiscModel(grow(), new Date('2026-01-20'));
        const at = (key: string) => m.days[m.byKey.get(key)!].lightHours;
        expect(at('2026-01-02')).toBe(0);
        expect(at('2026-01-15')).toBe(18);
        expect(at('2026-02-10')).toBe(12);
        expect(at('2026-02-25')).toBe(12);
        expect(at('2026-03-01')).toBe(0);
    });

    it('files entries under their calendar day, ignoring the time', () => {
        const m = buildDiscModel(grow([entry('2026-01-20T21:30:00.000Z', 'watering'), entry('2026-01-20', 'note')]), new Date('2026-01-20'));
        expect(m.days[m.byKey.get('2026-01-20')!].entries).toHaveLength(2);
    });

    it('finds the last watering on or before a day and counts care entries', () => {
        const m = buildDiscModel(grow([
            entry('2026-01-10', 'watering'),
            entry('2026-01-14', 'watering', 'second'),
            entry('2026-01-15', 'feeding'),
        ]), new Date('2026-01-20'));
        const i = m.byKey.get('2026-01-18')!;
        expect(lastBefore(m, i, 'watering')?.daysAgo).toBe(4);
        expect(lastBefore(m, i, 'watering')?.entry.title).toBe('second');
        expect(lastBefore(m, m.byKey.get('2026-01-05')!, 'watering')).toBeNull();
        expect(countEntries(m, 'watering', m.byKey.get('2026-01-12')!)).toBe(1);
        expect(countEntries(m, 'feeding')).toBe(1);
    });

    it('classifies entries for the lanes', () => {
        expect(isCareEntry(entry('2026-01-01', 'feeding'))).toBe(true);
        expect(isCareEntry(entry('2026-01-01', 'milestone'))).toBe(false);
        expect(hasPhoto(entry('2026-01-01', 'note', 'x', { photoIds: ['p1'] }))).toBe(true);
        expect(hasPhoto(entry('2026-01-01', 'note'))).toBe(false);
        expect(dateKey(new Date('2026-01-01T23:00:00Z'))).toBe('2026-01-01');
    });
});
