import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeImport, LIMITS } from '../src/importGuard';
import { store } from '../src/store';
import type { StoreData } from '../src/types';

const defaults: StoreData = {
    grows: [],
    settings: { strains: [], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'auto' },
    version: 1,
};

const growFile = (over: Record<string, unknown> = {}) => ({
    grows: [{
        id: 'g1', name: 'Tent A', strain: 'Northern Lights', plantCount: 2, plants: [],
        type: 'photo', dates: { germStart: '2026-01-01' },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 }, entries: [],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
        ...over,
    }],
    settings: { strains: ['Northern Lights'], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'dark' },
    version: 1,
});

describe('import guard', () => {
    it('keeps a normal backup intact', () => {
        const { data, warnings } = sanitizeImport(growFile(), defaults);
        expect(warnings).toEqual([]);
        expect(data?.grows[0]).toMatchObject({ id: 'g1', strain: 'Northern Lights', plantCount: 2, type: 'photo' });
        expect(data?.settings.theme).toBe('dark');
    });

    it('refuses anything that is not a backup', () => {
        for (const junk of [null, 42, 'hello', [], {}, { grows: 'lots' }, { grows: {} }]) {
            expect(sanitizeImport(junk, defaults).data).toBeNull();
        }
    });

    it('drops unknown keys instead of copying them into the app', () => {
        const file = growFile({ evil: 'payload', onclick: 'alert(1)' }) as Record<string, unknown>;
        (file as { rogue?: unknown }).rogue = { a: 1 };
        const { data } = sanitizeImport(file, defaults);
        expect(data?.grows[0]).not.toHaveProperty('evil');
        expect(data?.grows[0]).not.toHaveProperty('onclick');
        expect(data).not.toHaveProperty('rogue');
    });

    it('cannot pollute the prototype', () => {
        const file = JSON.parse(`{
            "grows": [{"id":"g1","name":"x","strain":"x","plantCount":1,"plants":[],"type":"photo",
                       "dates":{"germStart":"2026-01-01"},"light":{},"entries":[],
                       "__proto__":{"polluted":"yes"}}],
            "deletedGrows": {"__proto__": "2026-01-01T00:00:00.000Z"},
            "__proto__": {"pollutedToo": "yes"}
        }`);
        const { data } = sanitizeImport(file, defaults);
        expect(data).not.toBeNull();
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(({} as Record<string, unknown>).pollutedToo).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(data!.deletedGrows ?? {}, '__proto__')).toBe(false);
    });

    it('keeps hostile text as text — it never becomes markup or a script source', () => {
        const nasty = '"><img src=x onerror=alert(1)><script>fetch("https://evil.example")</script>';
        const { data } = sanitizeImport(growFile({
            name: nasty,
            entries: [{
                id: 'e1', date: '2026-01-02', type: 'note', title: nasty, content: nasty,
                createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
            }],
        }), defaults);
        // The string survives (it is the user's text), but only as a string — rendering escapes it
        expect(data?.grows[0].name).toBe(nasty);
        expect(typeof data?.grows[0].entries[0].title).toBe('string');
        expect(data?.grows[0].entries[0]).not.toHaveProperty('onerror');
    });

    it('refuses photos that are not image data', () => {
        const { data } = sanitizeImport(growFile({
            entries: [{
                id: 'e1', date: '2026-01-02', type: 'note', title: 'photos',
                photo: 'javascript:alert(1)',
                photos: [
                    'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
                    'https://evil.example/tracker.png',
                    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
                ],
                createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
            }],
        }), defaults);
        const entry = data!.grows[0].entries[0];
        expect(entry.photo).toBeUndefined();
        expect(entry.photos).toEqual(['data:image/jpeg;base64,/9j/4AAQSkZJRg==']);   // svg, http and html dropped
    });

    it('repairs wrong types instead of trusting them', () => {
        const { data, warnings } = sanitizeImport({
            grows: [
                'not a grow',
                { id: 'g2', dates: { germStart: '2026-03-01' }, plantCount: '7', type: 'banana', light: { ppfd: 'lots' },
                  plants: [{ id: 'p1', name: 'Big Girl', potNumber: '2' }, 42],
                  entries: [{ id: 'e1', date: 'yesterday', title: 'no date' },
                            { id: 'e2', date: '2026-03-02', type: 'watering', title: 'ok', dli: 'bright' }] },
                { id: 'g3', dates: {} },
            ],
            settings: { theme: 'neon', strains: ['a', 5, null, 'b'] },
            version: '1',
        }, defaults);

        const grow = data!.grows[0];
        expect(data!.grows).toHaveLength(1);                       // the string and the dateless grow are gone
        expect(grow.plantCount).toBe(7);                           // "7" → 7
        expect(grow.type).toBe('photo');                           // "banana" → default
        expect(grow.light.ppfd).toBe(500);                         // "lots" → default
        expect(grow.plants).toHaveLength(1);
        expect(grow.plants[0].potNumber).toBe(2);
        expect(grow.entries).toHaveLength(1);                      // "yesterday" is not a date
        expect(grow.entries[0].dli).toBe(0);
        expect(data!.settings.theme).toBe('auto');
        expect(data!.settings.strains).toEqual(['a', 'b']);
        expect(warnings.length).toBeGreaterThan(0);
    });

    it('clamps sizes so one file cannot blow up the app', () => {
        const { data, warnings } = sanitizeImport({
            grows: Array.from({ length: LIMITS.grows + 5 }, (_, i) => ({
                id: `g${i}`, dates: { germStart: '2026-01-01' }, entries: [], plants: [],
            })),
        }, defaults);
        expect(data!.grows).toHaveLength(LIMITS.grows);
        expect(warnings.some(w => w.includes('first'))).toBe(true);

        const long = sanitizeImport(growFile({ name: 'x'.repeat(5000) }), defaults);
        expect(long.data!.grows[0].name).toHaveLength(LIMITS.shortText);
    });

    it('strips control characters from text', () => {
        const withControls = `Blue${String.fromCharCode(0)}Dream${String.fromCharCode(27)}[31m`;
        const { data } = sanitizeImport(growFile({ strain: withControls }), defaults);
        expect(data!.grows[0].strain).toBe('BlueDream[31m');
    });

    it('the store uses the guard and reports what it dropped', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(store.importJSON('not json')).toBe(false);
        expect(store.importJSON('{"nothing":true}')).toBe(false);

        const report = store.importWithReport(JSON.stringify({
            grows: [{ id: 'g1', dates: { germStart: '2026-01-01' }, entries: [], plants: [], strain: 'Test' }, 'junk'],
        }));
        expect(report.ok).toBe(true);
        expect(report.warnings.length).toBeGreaterThan(0);
        expect(store.getGrows()).toHaveLength(1);
        expect(store.getGrows()[0].strain).toBe('Test');

        warn.mockRestore();
        errorSpy.mockRestore();
    });
});

beforeEach(() => {
    localStorage.clear();
    store.clear();
});
