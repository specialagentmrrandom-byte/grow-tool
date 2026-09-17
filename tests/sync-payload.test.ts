// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createKeyRecord, unlockWithPassword, isCiphertext, type Ciphertext } from '../src/sync/crypto';
import { hasPlaintext, openRows, openSettings, openValue, sealRow, sealSettings } from '../src/sync/payload';
import { mergeAll, type RemoteGrowRow } from '../src/sync/merge';
import type { Entry, Grow } from '../src/types';

/**
 * Regression for the JSON format *through the encryption*: whatever the store
 * holds must come back byte-identical after a round trip, rows written before
 * encryption must still be readable, and the merge has to work on what comes out.
 */
const PASSWORD = 'correct-horse-battery';
const keyPromise = createKeyRecord(PASSWORD).then(({ record }) => unlockWithPassword(record, PASSWORD));

const entry = (over: Partial<Entry> = {}): Entry => ({
    id: 'entry_1',
    date: '2026-03-04',
    day: 42,
    phase: 'flower',
    type: 'note',
    title: 'Topped today 🌿',
    content: 'Notes with an emoji 🌱, an umlaut (Blüte), a quote " and markup <script>alert(1)</script>',
    photoIds: ['photo_1', 'photo_2'],
    tags: ['topping', 'lst'],
    plantIds: ['plant_1'],
    dli: 51.8,
    createdAt: '2026-03-04T08:00:00.000Z',
    updatedAt: '2026-03-04T09:30:00.000Z',
    ...over,
});

const grow = (over: Partial<Grow> = {}): Grow => ({
    id: 'grow_1',
    name: 'Tent A',
    strain: 'Nördliche Lichter "NL#5"',
    plantCount: 2,
    plants: [
        { id: 'plant_1', potNumber: 1, name: 'Big Girl', strain: 'NL', seedType: 'feminized', potLiters: 11, position: { x: 25.5, y: 60 } },
        { id: 'plant_2', potNumber: 2, name: 'Zwerg', strain: 'NL', potLiters: 15 },
    ],
    type: 'photo',
    dates: { germStart: '2026-01-20', sprout: '2026-01-24', vegStart: '2026-01-31', flowerStart: '2026-02-21' },
    light: { ppfd: 800, vegHours: 18, flowerHours: 12 },
    tent: { width: 100, depth: 100 },
    entries: [entry(), entry({ id: 'entry_2', type: 'watering', title: 'Watered · 1.2 L', content: undefined, photoIds: [] })],
    deletedEntries: { entry_old: '2026-02-01T10:00:00.000Z' },
    createdAt: '2026-01-20T07:00:00.000Z',
    updatedAt: '2026-03-04T09:30:00.000Z',
    ...over,
});

describe('synced JSON through the encryption', () => {
    it('a full grow survives seal → open unchanged', async () => {
        const key = await keyPromise;
        const original = grow();
        const sealed = await sealRow(original, key);

        expect(isCiphertext(sealed)).toBe(true);
        expect(await openValue<Grow>(sealed, key)).toEqual(original);
        // deep-equal is not enough on its own: compare the serialisations too
        expect(JSON.stringify(await openValue<Grow>(sealed, key))).toBe(JSON.stringify(original));
    }, 30_000);

    it('nothing readable is left in the ciphertext', async () => {
        const key = await keyPromise;
        const sealed = JSON.stringify(await sealRow(grow(), key));
        for (const secret of ['Nördliche', 'NL#5', 'Big Girl', 'Topped today', 'photo_1', '2026-01-20', 'flower']) {
            expect(sealed).not.toContain(secret);
        }
        expect(Object.keys(await sealRow(grow(), key)).sort()).toEqual(['ct', 'iv', 'v']);
    }, 30_000);

    it('tombstones and the strain list round-trip too', async () => {
        const key = await keyPromise;
        const tombstone = { deletedAt: '2026-03-05T12:00:00.000Z' };
        expect(await openValue(await sealRow(tombstone, key), key)).toEqual(tombstone);

        const strains = ['Northern Lights', 'Gorilla Glue #4', 'Süße Kirsche 🍒'];
        expect(await openSettings(await sealSettings({ strains }, key), key)).toEqual(strains);
        expect(await openSettings(await sealSettings({}, key), key)).toEqual([]);
        expect(await openSettings(null, key)).toBeNull();
    }, 30_000);

    it('rows written before encryption are still readable, and are recognised as plaintext', async () => {
        const key = await keyPromise;
        const legacy = grow({ id: 'grow_legacy' });
        const sealed = await sealRow(grow({ id: 'grow_new' }), key);

        const rows = [
            { id: 'grow_legacy', data: legacy, deleted: false, updated_at: '2026-03-01T00:00:00.000Z' },
            { id: 'grow_new', data: sealed, deleted: false, updated_at: '2026-03-04T00:00:00.000Z' },
            { id: 'grow_gone', data: null, deleted: true, updated_at: '2026-03-02T00:00:00.000Z' },
        ];

        const opened = await openRows(rows, key);
        expect(opened[0].data).toEqual(legacy);      // passed through untouched
        expect(opened[1].data).toEqual(grow({ id: 'grow_new' }));
        expect(opened[2].data).toBeNull();
        expect(opened.map(r => r.updated_at)).toEqual(rows.map(r => r.updated_at));   // metadata stays

        expect(hasPlaintext(rows, null)).toBe(true);
        expect(hasPlaintext([rows[1], rows[2]], null)).toBe(false);
        expect(hasPlaintext([rows[1]], { strains: ['plain'] })).toBe(true);
        expect(hasPlaintext([rows[1]], await sealSettings({ strains: ['sealed'] }, key))).toBe(false);
    }, 30_000);

    it('the merge works on decrypted rows exactly as on plain ones', async () => {
        const key = await keyPromise;
        const local = { grows: [grow()], deletedGrows: {}, strains: ['Northern Lights'] };
        const remoteGrow = grow({
            entries: [entry({ id: 'entry_3', title: 'From the phone', updatedAt: '2026-03-05T10:00:00.000Z' })],
            updatedAt: '2026-03-05T10:00:00.000Z',
        });

        const plainResult = mergeAll(local, [{ id: 'grow_1', data: remoteGrow, deleted: false }] as RemoteGrowRow[], ['Gorilla Glue #4']);
        const opened = await openRows([{ id: 'grow_1', data: await sealRow(remoteGrow, key), deleted: false }], key);
        const sealedResult = mergeAll(local, opened, ['Gorilla Glue #4']);

        expect(sealedResult.local).toEqual(plainResult.local);
        expect(sealedResult.push).toEqual(plainResult.push);
        expect(sealedResult.local.grows[0].entries.map(e => e.id).sort()).toEqual(['entry_1', 'entry_2', 'entry_3']);
    }, 30_000);

    it('a changed byte is refused, and another account cannot open the row', async () => {
        const key = await keyPromise;
        const other = await createKeyRecord('someone-else').then(({ record }) => unlockWithPassword(record, 'someone-else'));
        const sealed = await sealRow(grow(), key) as Ciphertext;

        await expect(openValue<Grow>(sealed, other)).rejects.toMatchObject({ code: 'corrupt' });
        const tampered = { ...sealed, ct: `${sealed.ct.slice(0, -4)}${sealed.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA'}` };
        await expect(openValue<Grow>(tampered, key)).rejects.toMatchObject({ code: 'corrupt' });
    }, 60_000);

    it('keeps values JSON is picky about', async () => {
        const key = await keyPromise;
        const awkward = grow({
            name: '', strain: '🌱'.repeat(50), plantCount: 0,
            entries: [entry({ dli: 0, day: -3, content: 'line 1\nline 2\ttabbed \\ backslash "quoted"' })],
        });
        const back = await openValue<Grow>(await sealRow(awkward, key), key);
        expect(back).toEqual(awkward);
        expect(back!.entries[0].content).toContain('\n');
        expect(back!.entries[0].dli).toBe(0);        // not dropped as falsy
        expect(back!.plantCount).toBe(0);
    }, 30_000);
});
