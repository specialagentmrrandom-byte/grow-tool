import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const localStorageMock = (() => {
    let data: Record<string, string> = {};
    return {
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => { data[key] = value; },
        removeItem: (key: string) => { delete data[key]; },
        clear: () => { data = {}; },
    };
})();
vi.stubGlobal('localStorage', localStorageMock);

import { store } from '../src/store';
import type { Grow } from '../src/types';

/**
 * Reminder visibility: a reminder shows from `date - reminderBuffer` up to and
 * including its date, and disappears once it is marked done. "Today" is the UTC
 * date, so the clock is frozen for these tests.
 */
const TODAY = '2026-05-10';

function seedGrow(): Grow {
    return store.addGrow({
        name: 'Reminder Test',
        strain: 'Northern Lights',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2026-04-01', sprout: '2026-04-05', vegStart: '2026-04-12' },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
    });
}

function addReminder(growId: string, date: string, reminderBuffer?: number) {
    return store.addEntry(growId, { date, type: 'reminder', title: `Feed on ${date}`, reminderBuffer })!;
}

describe('reminders', () => {
    let grow: Grow;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
        localStorage.clear();
        store['data'] = store['load']();
        grow = seedGrow();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when one is due', () => {
        it('shows a reminder on its own day', () => {
            addReminder(grow.id, TODAY);
            expect(store.getActiveReminders().map(r => r.date)).toEqual([TODAY]);
        });

        it('shows it early once the buffer window is open, and not before', () => {
            const open = addReminder(grow.id, '2026-05-13', 3);   // window opens on the 10th
            addReminder(grow.id, '2026-05-14', 3);                // window opens on the 11th
            expect(store.getActiveReminders().map(r => r.id)).toEqual([open.id]);
        });

        it('treats a missing buffer as "same day"', () => {
            addReminder(grow.id, '2026-05-11');
            expect(store.getActiveReminders()).toHaveLength(0);

            vi.setSystemTime(new Date('2026-05-11T09:00:00Z'));
            expect(store.getActiveReminders()).toHaveLength(1);
        });

        it('carries the grow it belongs to, so the bar can link to it', () => {
            addReminder(grow.id, TODAY);
            const [reminder] = store.getActiveReminders();
            expect(reminder.growId).toBe(grow.id);
            expect(reminder.growName).toBe('Reminder Test');
        });

        it('can be limited to a single grow', () => {
            addReminder(grow.id, TODAY);
            const other = seedGrow();
            addReminder(other.id, TODAY);

            expect(store.getActiveReminders()).toHaveLength(2);
            expect(store.getActiveReminders(grow.id)).toHaveLength(1);
            expect(store.getActiveReminders('nope')).toHaveLength(0);
        });

        it('sorts the due ones by date, soonest first', () => {
            addReminder(grow.id, '2026-05-16', 7);
            addReminder(grow.id, TODAY);
            addReminder(grow.id, '2026-05-12', 7);
            expect(store.getActiveReminders().map(r => r.date)).toEqual([TODAY, '2026-05-12', '2026-05-16']);
        });
    });

    describe('when one is not due', () => {
        it('leaves a reminder alone until its window opens', () => {
            addReminder(grow.id, '2026-06-01', 3);
            expect(store.getActiveReminders()).toHaveLength(0);
        });

        it('drops one whose day has passed', () => {
            addReminder(grow.id, '2026-05-09', 7);
            expect(store.getActiveReminders()).toHaveLength(0);
        });

        it('ignores entries that are not reminders', () => {
            store.addEntry(grow.id, { date: TODAY, type: 'watering', title: 'Watered' });
            store.addEntry(grow.id, { date: TODAY, type: 'note', title: 'Looking good' });
            expect(store.getActiveReminders()).toHaveLength(0);
        });
    });

    describe('marking one done', () => {
        it('removes it for good', () => {
            const entry = addReminder(grow.id, TODAY);
            expect(store.markReminderDone(grow.id, entry.id)).toBe(true);
            expect(store.getActiveReminders()).toHaveLength(0);
        });

        it('survives a reload', () => {
            const entry = addReminder(grow.id, TODAY);
            store.markReminderDone(grow.id, entry.id);

            store['data'] = store['load']();               // as if the app was restarted
            expect(store.getActiveReminders()).toHaveLength(0);
        });

        it('clears a dismissal at the same time', () => {
            const entry = addReminder(grow.id, TODAY);
            store.dismissReminder(grow.id, entry.id);
            store.markReminderDone(grow.id, entry.id);

            const saved = store.getGrow(grow.id)!.entries.find(e => e.id === entry.id)!;
            expect(saved.reminderDone).toBe(true);
            expect(saved.reminderDismissed).toBe(false);
        });

        it('refuses ids that are not a reminder of that grow', () => {
            const note = store.addEntry(grow.id, { date: TODAY, type: 'note', title: 'Note' })!;
            expect(store.markReminderDone(grow.id, note.id)).toBe(false);
            expect(store.markReminderDone(grow.id, 'entry_nope')).toBe(false);
            expect(store.markReminderDone('grow_nope', note.id)).toBe(false);
            expect(store.dismissReminder('grow_nope', note.id)).toBe(false);
            expect(store.undismissReminder('grow_nope', note.id)).toBe(false);
        });
    });

    describe('dismissing one', () => {
        // Note: dismissal is stored but nothing filters on it — getActiveReminders
        // keeps returning the reminder, so the bar comes back on the next render.
        it('flags the entry and can be taken back', () => {
            const entry = addReminder(grow.id, TODAY);

            expect(store.dismissReminder(grow.id, entry.id)).toBe(true);
            expect(store.getGrow(grow.id)!.entries[0].reminderDismissed).toBe(true);
            expect(store.getActiveReminders()).toHaveLength(1);

            expect(store.undismissReminder(grow.id, entry.id)).toBe(true);
            expect(store.getGrow(grow.id)!.entries[0].reminderDismissed).toBe(false);
            expect(store.getActiveReminders()).toHaveLength(1);
        });
    });
});
