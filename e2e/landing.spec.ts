import { test, expect } from '@playwright/test';

/** Landing page: hero, feature promises, navigation into the app, theming. */
test.describe('Landing page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('shows the brand, hero headline and all eight features', async ({ page }) => {
        await expect(page.locator('.nav-logo')).toContainText('OG Grow Journal');
        await expect(page.locator('.hero h1')).toBeVisible();

        await expect(page.locator('.feature')).toHaveCount(8);
        const titles = await page.locator('.feature h3').allTextContents();
        for (const feature of [
            'Grow diary', 'Visual timeline', 'DLI light planning', 'Smart reminders',
            'Tent planner', 'Photo gallery', 'Reports & export', 'Works everywhere',
        ]) {
            expect(titles).toContain(feature);
        }
    });

    test('the primary hero CTA links into the app', async ({ page }) => {
        await page.locator('.hero-cta a.btn-primary').click();
        await expect(page).toHaveURL(/app\.html/);
        await expect(page.locator('#app')).toBeVisible();
    });

    test('theme toggle switches and persists', async ({ page }) => {
        const html = page.locator('html');
        const before = await html.getAttribute('data-theme');
        await page.locator('#theme-toggle').click();
        const after = await html.getAttribute('data-theme');
        expect(after).not.toBe(before);
        await page.reload();
        await expect(html).toHaveAttribute('data-theme', after!);
    });

    test('links to the help guide and Overgrow', async ({ page }) => {
        await expect(page.locator('footer a[href="help.html"]')).toBeVisible();
        await expect(page.locator('a[href*="overgrow.com"]').first()).toBeVisible();
    });

    test('no horizontal overflow', async ({ page }) => {
        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });
});
