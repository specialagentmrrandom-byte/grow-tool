import { test, expect } from '@playwright/test';
import { openApp, makeSeedGrow } from './helpers';

/** Tent planner, gallery, DLI calculator, export & settings modals. */
test.describe('Feature modals', () => {
    test('tent layout shows pots and auto-arrange', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.hero-action[data-action="tent-layout"]').click();

        await expect(page.locator('.tent-planner')).toBeVisible();
        await expect(page.locator('.tent-dimensions')).toHaveText('80×80cm');
        // One pot per plant
        expect(await page.locator('.tent-outline .plant-pot, .tent-outline [data-plant-id]').count()).toBeGreaterThanOrEqual(2);
        await page.locator('.auto-arrange-btn').click(); // must not throw
    });

    test('gallery opens (empty state without entries)', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.hero-action[data-action="gallery"]').click();

        // Without entries the gallery shows its empty state
        await expect(page.locator('.gallery-overlay')).toBeVisible();
        await expect(page.locator('.gallery-empty')).toContainText('No entries yet');
        await page.locator('.gallery-close').click();
        await expect(page.locator('.gallery-overlay')).toHaveCount(0);
    });

    test('DLI calculator computes from PPFD and hours', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.timeline-day.is-today .add-entry-btn').click();
        await page.locator('.calc-dli-btn').click();

        await expect(page.locator('#calc-ppfd')).toBeVisible();
        await page.locator('#calc-ppfd').fill('600');
        await page.locator('#calc-hours').fill('12');
        // DLI = 600 × 12 × 3600 / 1e6 = 25.9
        await expect(page.locator('#dli-result')).toContainText('25.9');
    });

    test('markdown export renders a forum-ready report', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.hero-action[data-action="export"]').click();

        await page.locator('.markdown-btn').click();
        const content = page.locator('.markdown-section .export-content');
        await expect(content).toBeVisible();
        await expect(content).toHaveValue(/# 🌱 E2E Test Grow - Grow Report/);
        await expect(content).toHaveValue(/By The Numbers/);
    });

    test('HTML report opens as a standalone page', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('.hero-action[data-action="export"]').click();

        // The report opens in a new tab (blob URL via window.open)
        const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
        await page.locator('.report-btn').click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        await expect(popup.locator('body')).toContainText('E2E Test Grow');
    });

    test('settings modal opens from the dashboard', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.settings-btn').click();
        await expect(page.locator('#modal .modal')).toBeVisible();
    });

    test('app theme toggle flips the theme', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        const html = page.locator('html');
        const before = await html.getAttribute('data-theme');
        await page.locator('.theme-toggle').click();
        await expect(html).not.toHaveAttribute('data-theme', before!);
    });
});

/** Responsive smoke checks (mobile project runs everything above too). */
test.describe('Responsive layout', () => {
    test('app has no horizontal overflow', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });

    test('grow popup fits the viewport', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        const box = await page.locator('.modal-grow').boundingBox();
        const viewport = page.viewportSize()!;
        expect(box!.width).toBeLessThanOrEqual(viewport.width + 1);
    });

    test('grow hero keeps its height so action icons do not overlap the stats', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        // The hero is a flex child whose children are all absolutely positioned;
        // without flex-shrink:0 it collapses to 0 and drops the action icons
        // onto the stats row. Guard against that regression.
        const hero = await page.locator('.grow-hero').boundingBox();
        expect(hero!.height).toBeGreaterThan(120);

        // Action icons must sit above the stats row, not on top of it.
        const actions = await page.locator('.hero-actions').boundingBox();
        const stats = await page.locator('.detail-stats').boundingBox();
        expect(actions!.y + actions!.height).toBeLessThanOrEqual(stats!.y + 1);
    });

    test('widescreen dialog fills the screen and gives the timeline the width', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        const viewport = page.viewportSize()!;
        const dialog = await page.locator('.modal-grow').boundingBox();
        // The dialog should use most of the screen width, not sit at 600px.
        expect(dialog!.width).toBeGreaterThan(viewport.width * 0.8);

        // Two-pane body: the timeline column should take the majority of the
        // dialog width (control rail is a narrow sidebar).
        const timeline = await page.locator('.timeline-container').boundingBox();
        expect(timeline!.width).toBeGreaterThan(dialog!.width * 0.55);

        // Control rail sits to the left of the timeline (side-by-side, not stacked).
        const controls = await page.locator('.grow-controls').boundingBox();
        expect(controls!.x + controls!.width).toBeLessThanOrEqual(timeline!.x + 1);
    });
});
