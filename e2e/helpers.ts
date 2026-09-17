import { type Page } from '@playwright/test';

/**
 * Shared E2E helpers.
 *
 * Seeding goes through localStorage using the same shape the store persists
 * (`grow-tool-data`, version 1). Keep in sync with src/types.ts.
 */

export const APP_URL = '/app.html';

/** Days offset from today as ISO date (yyyy-mm-dd). */
export function isoDaysFromNow(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
}

/** A photoperiod grow that sprouted ~40 days ago (mid-flower by defaults). */
export function makeSeedGrow(overrides: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return {
        id: 'grow_e2e_1',
        name: 'E2E Test Grow',
        strain: 'E2E Test Grow',
        plantCount: 2,
        plants: [
            { id: 'plant_e2e_1', potNumber: 1, name: 'Plant 1', strain: 'E2E Test Grow', seedType: 'feminized', potLiters: 11 },
            { id: 'plant_e2e_2', potNumber: 2, name: 'Plant 2', strain: 'E2E Test Grow', seedType: 'feminized', potLiters: 15 },
        ],
        type: 'photo',
        dates: {
            germStart: isoDaysFromNow(-44),
            sprout: isoDaysFromNow(-40),
            vegStart: isoDaysFromNow(-33),
            flowerStart: isoDaysFromNow(-12),
            flushStart: isoDaysFromNow(+40),
            harvest: isoDaysFromNow(+50),
        },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        tent: { width: 80, depth: 80 },
        entries: [],
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

export function makeEntry(overrides: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return {
        id: `entry_e2e_${Math.random().toString(36).slice(2, 8)}`,
        date: isoDaysFromNow(0),
        day: 40,
        phase: 'flower',
        type: 'note',
        title: 'Seeded entry',
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

/**
 * Open the app with seeded data. Also marks the grow-form tutorial as seen so
 * the overlay doesn't intercept clicks in tests that open the form.
 */
export async function openApp(page: Page, grows: unknown[] = []): Promise<void> {
    await page.addInitScript((data) => {
        // Init scripts run on every navigation (including reloads) — only seed
        // once per context so state persisted by the app survives page.reload().
        if (localStorage.getItem('e2e-seeded')) return;
        localStorage.setItem('e2e-seeded', 'true');
        localStorage.setItem('grow-tool-data', JSON.stringify({
            grows: data,
            settings: { strains: [], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'dark' },
            version: 1,
        }));
        localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
        localStorage.setItem('og-grow-theme', 'dark');
    }, grows);
    await page.goto(APP_URL);
}
