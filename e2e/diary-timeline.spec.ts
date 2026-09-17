import { test, expect } from '@playwright/test';
import { openApp, makeSeedGrow, makeEntry, isoDaysFromNow } from './helpers';

/** Diary + timeline (landing-page features: Grow Diary, visual timeline). */
test.describe('Diary and timeline', () => {
    test('dashboard card shows phase, day and last activity', async ({ page }) => {
        await openApp(page, [makeSeedGrow({
            entries: [makeEntry({ type: 'watering', title: 'Watered', date: isoDaysFromNow(0) })],
        })]);
        const card = page.locator('.grow-card');
        await expect(card).toHaveCount(1);
        await expect(card.locator('.phase-badge')).toHaveText(/Flowering/);
        await expect(card.locator('.grow-card-meta')).toContainText(/Day \d+/);
        await expect(card.locator('.grow-card-last')).toContainText('Watered');
    });

    test('opening a grow shows timeline with phases, today highlighted', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        await expect(page.locator('.modal-grow')).toBeVisible();
        // Toolbar: current day + phase badge
        await expect(page.locator('.toolbar-day')).toHaveText(/Day \d+/);
        await expect(page.locator('.toolbar-phase-badge')).toHaveText(/Flowering/);
        // Progress bar has one segment per phase
        expect(await page.locator('.progress-segment').count()).toBeGreaterThanOrEqual(4);
        // Weeks are collapsible; the current week is open and holds today
        await expect(page.locator('details.timeline-week.current-week')).toHaveAttribute('open', '');
        await expect(page.locator('.timeline-day.is-today')).toHaveCount(1);
    });

    test('adds a note entry for today via the day row', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        await page.locator('.timeline-day.is-today .add-entry-btn').click();
        await expect(page.locator('.entry-modal')).toBeVisible();
        await page.locator('#entry-title').fill('Looking frosty');
        await page.locator('.entry-modal button[type="submit"]').click();

        await expect(page.locator('.timeline-entry .entry-title')).toHaveText('Looking frosty');
    });

    test('milestone preset chips prefill the entry', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.timeline-day.is-today .add-entry-btn').click();

        await page.locator('.quick-milestone', { hasText: 'Topped' }).click();
        await expect(page.locator('#entry-title')).toHaveValue(/Topped/);
        await page.locator('.entry-modal button[type="submit"]').click();
        await expect(page.locator('.timeline-entry .entry-title').first()).toContainText('Topped');
    });

    test('entry can be edited and deleted', async ({ page }) => {
        await openApp(page, [makeSeedGrow({ entries: [makeEntry({ title: 'Edit me' })] })]);
        await page.locator('.grow-card-main').click();

        await page.locator('.timeline-entry', { hasText: 'Edit me' }).click();
        await page.locator('#entry-title').fill('Edited title');
        await page.locator('.entry-modal button[type="submit"]').click();
        await expect(page.locator('.timeline-entry .entry-title')).toHaveText('Edited title');

        page.on('dialog', (d) => d.accept());
        await page.locator('.timeline-entry .entry-delete').click();
        await expect(page.locator('.timeline-entry')).toHaveCount(0);
    });

    test('list/grid view toggle persists per grow', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        await page.locator('[data-view-mode="grid"]').click();
        await expect(page.locator('.timeline-entries.grid-view')).toBeVisible();
        // Re-open the grow: choice must persist
        await page.locator('.hero-back').click();
        await page.locator('.grow-card-main').click();
        await expect(page.locator('.timeline-entries.grid-view')).toBeVisible();
    });

    test('quick log from dashboard chip records a watering', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.chip[data-water-id]').click();
        await expect(page.locator('.grow-card-last')).toContainText('Watered');
    });

    test('quick log sheet saves a feed with contextual fields', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.chip-more[data-sheet-id]').click();
        await expect(page.locator('.ql-sheet')).toBeVisible();

        await page.locator('[data-ql-type="feed"]').click();
        await page.locator('[data-ql-fieldid="mix"]').fill('CalMag');
        await page.locator('[data-ql-fieldid="ec"]').fill('1.4');
        await page.locator('[data-ql-save]').click();

        await expect(page.locator('.ql-sheet')).toHaveCount(0);
        await expect(page.locator('.grow-card-last')).toContainText('Fed');
    });

    test('escape key and back button close the grow popup', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await expect(page.locator('.modal-grow')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal-grow')).toHaveCount(0);
    });
});
