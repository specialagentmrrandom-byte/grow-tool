import { test, expect, type Page, type Route } from '@playwright/test';
import { makeSeedGrow, makeEntry } from './helpers';

/**
 * Premium sync against an in-memory fake of the Supabase REST APIs.
 * Two browser contexts act as two devices sharing one account.
 * Runs only when the dev server was started with VITE_SUPABASE_URL set.
 */
const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
test.skip(!SUPABASE, 'VITE_SUPABASE_URL not set — sync e2e skipped');

interface FakeServer {
    account: { tier: string; premium_until: string | null; sync_consent_at: string | null };
    rows: Map<string, { id: string; data: unknown; deleted: boolean; updated_at: string }>;
    strains: string[] | null;
    writes: number;
}

const USER = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com' };
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

function canSync(s: FakeServer) {
    return s.account.tier === 'premium' && !!s.account.sync_consent_at;
}

async function attachFake(page: Page, server: FakeServer) {
    await page.route(`${SUPABASE}/**`, async (route: Route) => {
        const req = route.request();
        const url = new URL(req.url());
        const json = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

        const p = url.pathname;
        if (p === '/auth/v1/token') {
            const body = req.postDataJSON();
            if (body.password !== 'correct-horse') return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
            return json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: USER });
        }
        if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
        if (p === '/rest/v1/accounts' && req.method() === 'GET') return json(200, [server.account]);
        if (p === '/rest/v1/accounts' && req.method() === 'PATCH') {
            Object.assign(server.account, req.postDataJSON());
            return json(200, [server.account]);
        }
        if (p === '/rest/v1/sync_grows' && req.method() === 'GET') return json(200, [...server.rows.values()]);
        if (p === '/rest/v1/sync_grows' && req.method() === 'POST') {
            if (!canSync(server)) return json(403, { message: 'row-level security' });
            for (const r of req.postDataJSON()) {
                server.rows.set(r.id, { id: r.id, data: r.data, deleted: r.deleted, updated_at: new Date().toISOString() });
                server.writes++;
            }
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p === '/rest/v1/sync_settings' && req.method() === 'GET') return json(200, server.strains ? [{ data: { strains: server.strains } }] : []);
        if (p === '/rest/v1/sync_settings' && req.method() === 'POST') {
            if (!canSync(server)) return json(403, {});
            server.strains = req.postDataJSON().data.strains;
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p.startsWith('/storage/v1/object/list/')) return json(200, []);
        return json(404, { message: `unmocked ${req.method()} ${p}` });
    });
}

async function openSettings(page: Page) {
    await page.locator('.settings-btn').first().click();
    await page.getByRole('button', { name: /Sign in or create account|Account & sync/ }).click();
    await expect(page.locator('.account-modal')).toBeVisible();
}

async function signIn(page: Page, password = 'correct-horse') {
    await page.locator('#account-email').fill(USER.email);
    await page.locator('#account-password').fill(password);
    await page.locator('.account-submit').click();
}

async function seed(page: Page, grows: unknown[]) {
    await page.addInitScript((data) => {
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
    await page.goto('/app.html');
}

test.describe('Premium sync', () => {
    test('wrong password shows a friendly error', async ({ page }) => {
        const server: FakeServer = { account: { tier: 'free', premium_until: null, sync_consent_at: null }, rows: new Map(), strains: null, writes: 0 };
        await attachFake(page, server);
        await seed(page, []);
        await openSettings(page);
        await signIn(page, 'nope');
        await expect(page.locator('.account-notice.error')).toContainText('Email or password is wrong');
    });

    test('free account uploads nothing; premium asks for consent, then syncs to a second device', async ({ browser }) => {
        const server: FakeServer = { account: { tier: 'free', premium_until: null, sync_consent_at: null }, rows: new Map(), strains: null, writes: 0 };

        // ── Device A: has a grow with an entry ──
        const ctxA = await browser.newContext();
        const pageA = await ctxA.newPage();
        await attachFake(pageA, server);
        await seed(pageA, [makeSeedGrow({ entries: [makeEntry({ id: 'entry_from_a', title: 'Topped today' })] })]);
        await openSettings(pageA);
        await signIn(pageA);

        await expect(pageA.locator('.account-badge')).toHaveText(/Free/);
        expect(server.writes).toBe(0);

        // Premium granted on the server → consent screen
        server.account.tier = 'premium';
        // (a background sync may pick this up first, so trigger a check without racing the re-render)
        await pageA.evaluate(async () => {
            const { syncEngine } = await import('/src/sync/engine.ts');
            await syncEngine.syncNow();
        });
        await expect(pageA.getByRole('button', { name: /Turn on sync/ })).toBeVisible();
        expect(server.writes).toBe(0);

        // Consent is required
        await pageA.getByRole('button', { name: /Turn on sync/ }).click();
        await expect(pageA.locator('.account-notice.error')).toContainText('tick the box');
        await pageA.locator('#account-consent').check();
        await pageA.getByRole('button', { name: /Turn on sync/ }).click();
        await expect(pageA.locator('.account-sync-status')).toContainText('Up to date');
        expect(server.rows.has('grow_e2e_1')).toBe(true);

        // ── Device B: empty, signs in, gets the grow ──
        const ctxB = await browser.newContext();
        const pageB = await ctxB.newPage();
        await attachFake(pageB, server);
        await seed(pageB, []);
        await openSettings(pageB);
        await signIn(pageB);
        await expect(pageB.locator('.account-sync-status')).toContainText('Up to date');
        await pageB.locator('.modal-close').first().click();
        await expect(pageB.getByText('E2E Test Grow').first()).toBeVisible();

        const stored = await pageB.evaluate(() => JSON.parse(localStorage.getItem('grow-tool-data')!));
        expect(stored.grows[0].entries.map((e: { id: string }) => e.id)).toContain('entry_from_a');

        // ── Device B deletes the grow → A loses it on next sync ──
        const beforeWrites = server.writes;
        await pageB.evaluate(async () => {
            const { store } = await import('/src/store.ts');
            store.deleteGrow('grow_e2e_1');
        });
        await expect.poll(() => server.writes, { timeout: 15_000 }).toBeGreaterThan(beforeWrites);
        expect(server.rows.get('grow_e2e_1')?.deleted).toBe(true);

        await pageA.locator('.modal-close').first().click();
        await pageA.evaluate(async () => {
            const { syncEngine } = await import('/src/sync/engine.ts');
            await syncEngine.syncNow();
        });
        await expect(pageA.getByText('E2E Test Grow')).toHaveCount(0);

        await ctxA.close();
        await ctxB.close();
    });
});
