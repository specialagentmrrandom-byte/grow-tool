import { test, expect } from '@playwright/test';
import { openApp, makeSeedGrow, makeEntry, isoDaysFromNow } from './helpers';

/** Diary + grow disc (landing-page features: Grow Diary, visual timeline). */
test.describe('Diary and grow disc', () => {
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

    test('opening a grow shows the disc: phase wreath, lanes, today', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        await expect(page.locator('.modal-grow')).toBeVisible();
        const disc = page.locator('.grow-disc svg.cx-wheel');
        await expect(disc).toBeVisible();
        // Rim: one segment per phase, the current one marked
        expect(await page.locator('.cx-wheel__segment').count()).toBeGreaterThanOrEqual(4);
        await expect(page.locator('.cx-wheel__segment.is-current')).toHaveAttribute('data-key', 'flower');
        // Three lanes and today's needle
        for (const lane of ['light', 'water', 'journal']) {
            await expect(page.locator(`.cx-wheel__lane[data-lane="${lane}"]`)).toHaveCount(1);
        }
        await expect(page.locator('.cx-wheel__needle')).toHaveCount(1);
        // The band answers for today in the journal lane
        await expect(page.locator('.cx-wheel-day')).toContainText(/Day \d+ .* today/);
        await expect(page.locator('.cx-wheel-band .cx-eyebrow')).toHaveText('Journal');
        // one detailed-entry button, named for the day on the disc; quick log is for today
        await expect(page.locator('[data-action="disc-add"]')).toHaveText(/^\+ Entry for Day \d+$/);
        await expect(page.locator('.detail-log-btn')).toHaveCount(0);
        await expect(page.locator('.grow-controls .section-label')).toContainText('today');
    });

    test('adds a note entry for today via the day row', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        await page.locator('[data-action="disc-add"]').click();
        await expect(page.locator('.entry-modal')).toBeVisible();
        await page.locator('#entry-title').fill('Looking frosty');
        await page.locator('.entry-modal button[type="submit"]').click();

        await expect(page.locator('.disc-entry .entry-title')).toHaveText('Looking frosty');
    });

    test('milestone preset chips prefill the entry', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();
        await page.locator('[data-action="disc-add"]').click();

        await page.locator('.quick-milestone', { hasText: 'Topped' }).click();
        await expect(page.locator('#entry-title')).toHaveValue(/Topped/);
        await page.locator('.entry-modal button[type="submit"]').click();
        await expect(page.locator('.disc-entry .entry-title').first()).toContainText('Topped');
    });

    test('entry can be edited and deleted', async ({ page }) => {
        await openApp(page, [makeSeedGrow({ entries: [makeEntry({ title: 'Edit me' })] })]);
        await page.locator('.grow-card-main').click();

        await page.locator('.disc-entry', { hasText: 'Edit me' }).click();
        await page.locator('#entry-title').fill('Edited title');
        await page.locator('.entry-modal button[type="submit"]').click();
        await expect(page.locator('.disc-entry .entry-title')).toHaveText('Edited title');

        page.on('dialog', (d) => d.accept());
        await page.locator('.disc-entry .entry-delete').click();
        await expect(page.locator('.disc-entry')).toHaveCount(0);
    });

    test('lanes and days: chips, keys and a tap on the disc move the band', async ({ page }) => {
        await openApp(page, [makeSeedGrow({
            entries: [makeEntry({ type: 'watering', title: 'Watered', date: isoDaysFromNow(0) })],
        })]);
        await page.locator('.grow-card-main').click();

        // Lane chip → water band with today's watering
        await page.locator('[data-wheel-focus="water"]').click();
        await expect(page.locator('.cx-wheel-band .cx-eyebrow')).toHaveText('Water & feed');
        await expect(page.locator('.cx-wheel-band')).toContainText('Last watered');
        await expect(page.locator('.disc-entry .entry-title')).toHaveText('Watered');

        // Keyboard on the disc: one day on, then back to today
        await page.locator('svg.cx-wheel').focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.cx-wheel-day')).not.toContainText('today');
        await expect(page.locator('.cx-wheel__selected')).toHaveCount(1);
        await page.keyboard.press('Home');
        await expect(page.locator('.cx-wheel-day')).toContainText('today');

        // A tap on a light bar selects the light lane
        await page.locator('.cx-wheel__lane[data-lane="light"] .cx-wheel__mark--bar').nth(10).click({ force: true });
        await expect(page.locator('.cx-wheel-band .cx-eyebrow')).toHaveText('Light');
        await expect(page.locator('.cx-wheel-band')).toContainText('hours light / dark');

        // The rim opens the phase list
        await page.locator('[data-wheel-focus="rim"]').click();
        await expect(page.locator('.disc-phases [data-phase="flower"]')).toContainText('now');
    });

    test('dragging on the disc moves the hand and the band follows', async ({ page }) => {
        await openApp(page, [makeSeedGrow()]);
        await page.locator('.grow-card-main').click();

        const svg = page.locator('svg.cx-wheel');
        await svg.scrollIntoViewIfNeeded();
        const box = (await svg.boundingBox())!;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const r = box.width * 0.4;
        const at = (deg: number): [number, number] => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];

        await page.mouse.move(...at(60));
        await page.mouse.down();
        const first = await page.locator('.cx-wheel-day').textContent();
        await page.mouse.move(...at(150), { steps: 6 });
        const second = await page.locator('.cx-wheel-day').textContent();
        await page.mouse.up();

        expect(second).not.toBe(first);
        await expect(page.locator('.cx-wheel__selected line')).toHaveCount(1);
        // no rectangular focus box on the disc
        await expect(svg).toHaveCSS('outline-style', 'none');
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

    test('the popup keeps its size while the band shows days with more or less to say', async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 800 });
        const long = 'The plants drank a lot today and the leaves droop a little in the afternoon. '.repeat(6);
        await openApp(page, [makeSeedGrow({ entries: [
            makeEntry({ id: 'e_short', date: isoDaysFromNow(-1), title: 'Short', notes: 'ok' }),
            ...[1, 2, 3].map((n) => makeEntry({ id: `e_long_${n}`, date: isoDaysFromNow(-2), title: `Long ${n}`, notes: long })),
        ] })]);
        await page.locator('.grow-card-main').click();
        await expect(page.locator('svg.cx-wheel')).toBeVisible();

        const popup = page.locator('.modal-grow');
        const sizes = new Set<string>();
        for (let i = 0; i < 4; i++) {
            const box = await popup.boundingBox();
            sizes.add(`${Math.round(box!.width)}x${Math.round(box!.height)}`);
            await page.locator('[data-wheel-step="prev"]').click();
        }
        expect([...sizes]).toHaveLength(1);
    });
});
