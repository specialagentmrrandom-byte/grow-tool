import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

/** Creating and editing a grow via the form (landing-page feature: Grow Diary). */
test.describe('Grow creation', () => {
    test('empty dashboard offers to start the first grow', async ({ page }) => {
        await openApp(page);
        await expect(page.locator('.empty-state')).toBeVisible();
        await page.locator('.new-grow-btn').first().click();
        await expect(page.locator('.grow-form')).toBeVisible();
    });

    test('creates a photoperiod grow with schedule sliders and tent preset', async ({ page }) => {
        await openApp(page);
        await page.locator('.new-grow-btn').first().click();

        await page.locator('#strain').fill('Playwright Kush');
        // Type: Photoflowering is default; veg-weeks slider visible
        await expect(page.locator('#veg-weeks')).toBeVisible();

        // Schedule via sliders
        await page.locator('#veg-weeks').fill('2');
        await page.locator('#flower-weeks').fill('9');
        await page.locator('#flush-days').fill('12');

        // Calculated schedule preview updates and shows emojis + durations
        const preview = page.locator('#date-preview');
        await expect(preview).toContainText('Calculated Schedule');
        await expect(preview).toContainText('(2w)');
        await expect(preview).toContainText('(9w)');
        await expect(preview).toContainText('Harvest');

        // Tent preset
        await page.locator('[data-tent-preset="2"]').click(); // 100×100cm
        await expect(page.locator('#tent-width')).toHaveValue('100');

        // A default plant exists; add another and set pot size via slider
        await page.locator('.add-plant-btn').click();
        await expect(page.locator('.plant-row:not(.plant-row-header)')).toHaveCount(2);
        await page.locator('.plant-pot-slider').first().fill('25');
        await expect(page.locator('.pot-size-display').first()).toHaveText('25L');

        await page.locator('.save-btn').click();

        // Grow detail popup opens with the new grow
        await expect(page.locator('.modal-grow .hero-name')).toHaveText('Playwright Kush');
        await expect(page.locator('.detail-stats')).toContainText('Plants');
    });

    test('autoflower type hides veg weeks', async ({ page }) => {
        await openApp(page);
        await page.locator('.new-grow-btn').first().click();

        await page.locator('.segment[data-type="auto"]').click();
        await expect(page.locator('#grow-type')).toHaveValue('auto');
        await expect(page.locator('#veg-weeks')).toBeHidden();

        // Switching back restores it with a sane default
        await page.locator('.segment[data-type="photo"]').click();
        await expect(page.locator('#veg-weeks')).toBeVisible();
        await expect(page.locator('#veg-weeks')).toHaveValue('3');
    });

    test('random grow name is prefilled', async ({ page }) => {
        await openApp(page);
        await page.locator('.new-grow-btn').first().click();
        const value = await page.locator('#strain').inputValue();
        expect(value.length).toBeGreaterThan(0);
    });

    test('cancel returns to the dashboard', async ({ page }) => {
        await openApp(page);
        await page.locator('.new-grow-btn').first().click();
        await page.locator('.cancel-btn').click();
        await expect(page.locator('.empty-state')).toBeVisible();
    });
});
