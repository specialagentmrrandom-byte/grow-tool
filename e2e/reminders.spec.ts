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

    test('future timeline day creates a reminder with buffer', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        // Open a future day (they carry the "Add reminder" title)
        const futureDay = page.locator('.timeline-day.is-future').first();
        await futureDay.scrollIntoViewIfNeeded();
        await futureDay.locator('.add-entry-btn').click();

        await expect(page.locator('.entry-modal')).toBeVisible();
        // Future dates force the reminder type and show the buffer picker
        await expect(page.locator('.reminder-buffer-group')).toBeVisible();
        await page.locator('#entry-title').fill('Flip to 12/12');
        await page.locator('.entry-modal button[type="submit"]').click();

        await expect(page.locator('.timeline-entry .entry-title')).toHaveText('Flip to 12/12');
    });

    test('reminder without buffer is not shown before its notify window', async ({ page }) => {
        await openApp(page, [makeSeedGrow({
            entries: [makeEntry({ type: 'reminder', title: 'Far future', date: isoDaysFromNow(10), reminderBuffer: 0 })],
        })]);
        await expect(page.locator('.reminder-bar')).toHaveCount(0);
    });
});
