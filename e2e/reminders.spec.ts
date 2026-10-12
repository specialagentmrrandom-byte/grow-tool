import { test, expect } from '@playwright/test';
import { openApp, makeSeedGrow, makeEntry, isoDaysFromNow } from './helpers';

/** Smart reminders (landing-page feature: buffer days, dismiss, mark done). */
test.describe('Reminders', () => {
    const reminderGrow = () => makeSeedGrow({
        entries: [makeEntry({
            type: 'reminder',
            title: 'Water the girls',
            date: isoDaysFromNow(2),
            reminderBuffer: 3,
        })],
    });

    test('active reminder appears in bar and today strip', async ({ page }) => {
        await openApp(page, [reminderGrow()]);
        await expect(page.locator('.reminder-bar')).toBeVisible();
        await expect(page.locator('.reminder-bar')).toContainText('Water the girls');
        await expect(page.locator('.today-strip')).toContainText('Water the girls');
        await expect(page.locator('.task-badge-due')).toContainText('1 due');
    });

    test('mark done clears the reminder permanently', async ({ page }) => {
        await openApp(page, [reminderGrow()]);
        // The reminder bar overlays the dashboard — close it first
        await page.locator('.reminder-close-btn').click();
        await page.locator('.today-strip .task-done').click();
        await expect(page.locator('.today-strip')).toContainText('All caught up');
        await page.reload();
        await expect(page.locator('.today-strip')).toContainText('All caught up');
    });

    test('future day on the disc creates a reminder with buffer', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        // Step one day ahead; the band then offers a reminder instead of an entry
        await page.locator('[data-wheel-step="next"]').click();
        await expect(page.locator('[data-action="disc-add"]')).toHaveText(/^\+ Reminder for Day \d+$/);
        await page.locator('[data-action="disc-add"]').click();

        await expect(page.locator('.entry-modal')).toBeVisible();
        // Future dates force the reminder type and show the buffer picker
        await expect(page.locator('.reminder-buffer-group')).toBeVisible();
        await page.locator('#entry-title').fill('Flip to 12/12');
        await page.locator('.entry-modal button[type="submit"]').click();

        await expect(page.locator('.disc-entry .entry-title')).toHaveText('Flip to 12/12');
    });

    test('reminder without buffer is not shown before its notify window', async ({ page }) => {
        await openApp(page, [makeSeedGrow({
            entries: [makeEntry({ type: 'reminder', title: 'Far future', date: isoDaysFromNow(10), reminderBuffer: 0 })],
        })]);
        await expect(page.locator('.reminder-bar')).toHaveCount(0);
    });
});
