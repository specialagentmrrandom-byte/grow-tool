import { test, expect, type Page, type Route } from '@playwright/test';
import { makeSeedGrow, makeEntry } from './helpers';

/**
 * 🔐 End-to-end encryption in a real browser: the key is made on the device, the
 * recovery key is shown once, and everything that leaves the app is ciphertext.
 * Runs only when the dev server was started with VITE_SUPABASE_URL set.
 */
const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
test.skip(!SUPABASE, 'VITE_SUPABASE_URL not set — encryption e2e skipped');

const USER = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com' };
const PASSWORD = 'correct-horse-battery';
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

interface Server {
    keyRecord: Record<string, unknown> | null;
    grows: Array<{ id: string; data: unknown; deleted: boolean }>;
    settings: unknown;
    consent: boolean;
}

const newServer = (over: Partial<Server> = {}): Server => ({ keyRecord: null, grows: [], settings: null, consent: true, ...over });

async function attachFake(page: Page, server: Server) {
    await page.route(`${SUPABASE}/**`, async (route: Route) => {
        const req = route.request();
        const p = new URL(req.url()).pathname;
        const method = req.method();
        const json = (status: number, body: unknown) =>
            route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

        if (p === '/auth/v1/token') return json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: USER });
        if (p === '/auth/v1/user') return json(200, USER);
        if (p === '/rest/v1/app_flags') return json(200, []);   // no switches set → defaults
        if (p === '/rest/v1/rpc/my_entitlement') {
            return json(200, [{
                plan_id: 'free', plan_name: 'Free · sync included', sync_enabled: true, photo_quota_mb: 500,
                status: 'free', current_period_end: null, cancel_at_period_end: false, provider: null,
                sync_consent_at: server.consent ? new Date().toISOString() : null,
            }]);
        }
        if (p === '/rest/v1/user_keys') {
            if (method === 'GET') return json(200, server.keyRecord ? [server.keyRecord] : []);
            server.keyRecord = req.postDataJSON();
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p === '/rest/v1/sync_grows') {
            if (method === 'GET') return json(200, server.grows);
            for (const row of req.postDataJSON()) {
                server.grows = [...server.grows.filter(r => r.id !== row.id), row];
            }
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p === '/rest/v1/sync_settings') {
            if (method === 'GET') return json(200, server.settings ? [{ data: server.settings }] : []);
            server.settings = req.postDataJSON().data;
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p.startsWith('/storage/v1/object/list/')) return json(200, []);
        if (p === '/rest/v1/plans') return json(200, []);
        return json(200, []);
    });
}

async function signIn(page: Page, server: Server) {
    await attachFake(page, server);
    await page.addInitScript(() => {
        localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
        localStorage.setItem('og-grow-theme', 'dark');
    });
    await page.addInitScript((grow) => {
        localStorage.setItem('grow-tool-data', JSON.stringify({
            grows: [grow],
            settings: { strains: ['Northern Lights'], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'dark' },
            version: 1,
        }));
    }, makeSeedGrow({ strain: 'Secret Strain', entries: [makeEntry({ id: 'e1', title: 'Topped today', notes: 'looking great' })] }));

    await page.goto('/app.html');
    await page.locator('.settings-btn').first().click();
    await page.getByRole('button', { name: /Sign in or create free account|Account & sync/ }).click();
    await page.locator('#account-email').fill(USER.email);
    await page.locator('#account-password').fill(PASSWORD);
    await page.locator('.account-submit').click();
}

test.describe('End-to-end encryption', () => {
    test('first sign-in creates a key, shows the recovery key once, and uploads only ciphertext', async ({ page }) => {
        const server = newServer();
        await signIn(page, server);

        // the recovery key is shown exactly once, and looks the part
        const code = page.locator('.recovery-code');
        await expect(code).toBeVisible({ timeout: 20_000 });
        await expect(code).toHaveText(/^RCVR-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
        const recoveryKey = (await code.textContent())!.trim();

        // what the server got for the key: wrapped twice, no password inside
        expect(server.keyRecord).toBeTruthy();
        const record = JSON.stringify(server.keyRecord);
        expect(record).not.toContain(PASSWORD);
        expect(record).not.toContain(recoveryKey.replace(/-/g, '').replace('RCVR', ''));
        expect(server.keyRecord!.kdf_iterations).toBe(600000);

        // the diary went up encrypted
        await expect.poll(() => server.grows.length, { timeout: 20_000 }).toBeGreaterThan(0);
        const uploaded = JSON.stringify(server.grows);
        expect(uploaded).not.toContain('Secret Strain');
        expect(uploaded).not.toContain('Topped today');
        expect(uploaded).not.toContain('looking great');
        expect(server.grows[0].data).toHaveProperty('ct');
        expect(server.grows[0].data).toHaveProperty('iv');

        // strains too
        await expect.poll(() => server.settings, { timeout: 20_000 }).toBeTruthy();
        expect(JSON.stringify(server.settings)).not.toContain('Northern Lights');

        await page.getByRole('button', { name: /I wrote it down/ }).click();
        await expect(code).toHaveCount(0);
    });

    test('a second device is locked until the password opens the copy', async ({ browser }) => {
        const server = newServer();

        const first = await browser.newContext();
        const pageA = await first.newPage();
        await signIn(pageA, server);
        await expect(pageA.locator('.recovery-code')).toBeVisible({ timeout: 20_000 });
        await expect.poll(() => server.grows.length, { timeout: 20_000 }).toBeGreaterThan(0);

        // second device: same account, no key in this browser
        const second = await browser.newContext();
        const pageB = await second.newPage();
        await attachFake(pageB, server);
        await pageB.addInitScript(() => {
            localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
            localStorage.setItem('og-grow-theme', 'dark');
            // a signed-in session without the key, as after a password reset on another machine
            const open = indexedDB.open('grow-tool-account', 1);
            open.onupgradeneeded = () => open.result.createObjectStore('kv');
            open.onsuccess = () => {
                open.result.transaction('kv', 'readwrite').objectStore('kv').put({
                    accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600_000,
                    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com',
                }, 'session');
            };
        });
        await pageB.goto('/app.html');
        await pageB.locator('.settings-btn').first().click();
        await pageB.getByRole('button', { name: /Account & sync|Sign in or create free account/ }).click();

        await expect(pageB.getByRole('heading', { name: /Unlock your cloud copy/ })).toBeVisible({ timeout: 20_000 });
        await pageB.locator('#account-unlock-password').fill('wrong-password');
        await pageB.getByRole('button', { name: /Unlock/ }).click();
        await expect(pageB.locator('.account-notice.error')).toContainText('does not open', { timeout: 20_000 });

        // the right password opens it, and the grow from device A arrives
        await pageB.getByRole('button', { name: /Use my password/ }).click();
        await pageB.locator('#account-unlock-password').fill(PASSWORD);
        await pageB.getByRole('button', { name: /Unlock/ }).click();
        await expect(pageB.locator('.account-sync-status')).toContainText(/Up to date|Ready/, { timeout: 30_000 });
        await pageB.locator('.modal-close').click();
        await expect(pageB.locator('.grow-card, .dashboard-grow, .grow-list-item').first()).toBeVisible({ timeout: 20_000 });
    });
});
