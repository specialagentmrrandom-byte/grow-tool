import { test, expect, type Page } from '@playwright/test';

/**
 * Nothing about a grower's visit may reach a third party: no CDN for the emoji,
 * no Google for the fonts. Everything is served from this site, which also means
 * the very first load already works offline.
 */
const PAGES = ['/', '/app.html', '/help.html'];

/** The app's own backend is allowed to be external; nothing else is. */
const BACKEND = process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).host : '';

function recordRequests(page: Page): string[] {
    const foreign: string[] = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.protocol === 'data:' || url.protocol === 'blob:') return;
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.host === BACKEND) return;
        foreign.push(request.url());
    });
    return foreign;
}

test.describe('no third-party requests', () => {
    for (const path of PAGES) {
        test(`${path} loads everything from this site`, async ({ page }) => {
            const foreign = recordRequests(page);
            await page.goto(path, { waitUntil: 'load' });
            await page.waitForTimeout(1500);           // let fonts, emoji and the service worker settle
            expect(foreign, `these went to another host: ${foreign.join(', ')}`).toEqual([]);
        });
    }

    test('emoji come from /emoji and unknown ones stay native', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
            localStorage.setItem('og-grow-theme', 'dark');
        });
        await page.goto('/app.html', { waitUntil: 'load' });
        await page.waitForTimeout(1000);

        const sources = await page.locator('img.emoji').evaluateAll(imgs => imgs.map(i => (i as HTMLImageElement).getAttribute('src') ?? ''));
        expect(sources.length).toBeGreaterThan(0);
        for (const src of sources) expect(src.startsWith('/emoji/svg/')).toBe(true);

        // every bundled file really exists (a 404 would show as a broken image)
        for (const src of sources.slice(0, 5)) {
            const response = await page.request.get(src);
            expect(response.status(), src).toBe(200);
        }

        // an emoji that is not bundled is left alone instead of pointing at a CDN
        const left = await page.evaluate(() => {
            const el = document.createElement('div');
            el.textContent = '🫠';                      // not used anywhere in the app
            document.body.appendChild(el);
            window.twemoji?.parse(el, {
                base: '/emoji/', folder: 'svg', ext: '.svg',
                callback: (icon: string) => (window.GROW_EMOJI?.has(icon) ? `/emoji/svg/${icon}.svg` : false),
            });
            const html = el.innerHTML;
            el.remove();
            return html;
        });
        expect(left).toBe('🫠');
    });

    test('the landing page uses the self-hosted fonts', async ({ page }) => {
        await page.goto('/', { waitUntil: 'load' });
        const fontUrls = await page.evaluate(() =>
            [...document.styleSheets]
                .flatMap(sheet => {
                    try {
                        return [...sheet.cssRules];
                    } catch {
                        return [];
                    }
                })
                .filter(rule => rule.constructor.name === 'CSSFontFaceRule')
                .map(rule => rule.cssText));
        expect(fontUrls.length).toBeGreaterThan(0);
        for (const rule of fontUrls) {
            expect(rule).toContain('/fonts/');
            expect(rule).not.toContain('gstatic');
        }
    });
});
