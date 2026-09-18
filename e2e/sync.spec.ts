import { test, expect, type Page, type Route } from '@playwright/test';
import { makeSeedGrow, makeEntry } from './helpers';

/**
 * ☁️ Sync against an in-memory fake of the Supabase REST APIs: an account that
 * may not sync uploads nothing, and consent comes before the first upload.
 * Runs only when the dev server was started with VITE_SUPABASE_URL set.
 */
const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
test.skip(!SUPABASE, 'VITE_SUPABASE_URL not set — sync e2e skipped');

const USER = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com' };
const PASSWORD = 'correct-horse';
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

interface FakeServer {
    /** What the server says this account may do. */
    syncEnabled: boolean;
    consentAt: string | null;
    keyRecord: Record<string, unknown> | null;
    rows: Map<string, { id: string; data: unknown; deleted: boolean; updated_at: string }>;
    settings: unknown;
    writes: number;
}

const newServer = (over: Partial<FakeServer> = {}): FakeServer => ({
    syncEnabled: false, consentAt: null, keyRecord: null, rows: new Map(), settings: null, writes: 0, ...over,
});

/** The server's own gate — the same one RLS enforces in the real project. */
const mayWrite = (s: FakeServer) => s.syncEnabled && !!s.consentAt;

async function attachFake(page: Page, server: FakeServer) {
    await page.route(`${SUPABASE}/**`, async (route: Route) => {
        const req = route.request();
        const p = new URL(req.url()).pathname;
        const method = req.method();
        const json = (status: number, body: unknown) =>
            route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

        if (p === '/auth/v1/token') {
            const body = req.postDataJSON();
            if (body.password !== PASSWORD) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
            return json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: USER });
        }
        if (p === '/auth/v1/user') return json(200, USER);
        if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
        if (p === '/rest/v1/app_flags') return json(200, []);   // no switches set → defaults
        if (p === '/rest/v1/rpc/my_entitlement') {
            return json(200, [{
                sync_enabled: server.syncEnabled,
                photo_quota_mb: server.syncEnabled ? 500 : 0,
                sync_consent_at: server.consentAt,
            }]);
        }
        if (p === '/rest/v1/accounts' && method === 'PATCH') {
            server.consentAt = new Date().toISOString();
            return json(200, [{ sync_consent_at: server.consentAt }]);
        }
        if (p === '/rest/v1/user_keys') {
            if (method === 'GET') return json(200, server.keyRecord ? [server.keyRecord] : []);
            server.keyRecord = req.postDataJSON();
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p === '/rest/v1/sync_grows') {
            if (method === 'GET') return json(200, [...server.rows.values()]);
            if (!mayWrite(server)) return json(403, { message: 'row-level security' });
            for (const row of req.postDataJSON()) {
                server.rows.set(row.id, { id: row.id, data: row.data, deleted: row.deleted, updated_at: new Date().toISOString() });
                server.writes++;
            }
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p === '/rest/v1/sync_settings') {
            if (method === 'GET') return json(200, server.settings ? [{ data: server.settings }] : []);
            if (!mayWrite(server)) return json(403, { message: 'row-level security' });
            server.settings = req.postDataJSON().data;
            return route.fulfill({ status: 201, headers: cors });
        }
        if (p.startsWith('/storage/v1/object/list/')) return json(200, []);
        return json(200, []);
    });
}

async function openAccount(page: Page, server: FakeServer, grows: unknown[]) {
    await attachFake(page, server);
    await page.addInitScript((data) => {
        localStorage.setItem('grow-tool-data', JSON.stringify({
            grows: data,
            settings: { strains: [], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'dark' },
            version: 1,
        }));
        localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
        localStorage.setItem('og-grow-theme', 'dark');
    }, grows);
    await page.goto('/app.html');
    await page.locator('.settings-btn').first().click();
    await page.getByRole('button', { name: /Sign in or create free account|Account & sync/ }).click();
    await expect(page.locator('.account-modal')).toBeVisible();
}

async function signIn(page: Page, password = PASSWORD) {
    await page.locator('#account-email').fill(USER.email);
    await page.locator('#account-password').fill(password);
    await page.locator('.account-submit').first().click();
}

test.describe('Sync', () => {
    test('wrong password shows a friendly error', async ({ page }) => {
        await openAccount(page, newServer(), []);
        await signIn(page, 'nope');
        await expect(page.locator('.account-notice.error')).toContainText('Email or password is wrong');
    });

    test('an account without sync uploads nothing; consent comes before the first upload', async ({ page }) => {
        const server = newServer();
        await openAccount(page, server, [makeSeedGrow({ entries: [makeEntry({ id: 'entry_from_a', title: 'Topped today' })] })]);
        await signIn(page);

        // Signed in, but the server does not allow sync for this account
        await expect(page.locator('.account-footer')).toBeVisible();
        await expect(page.getByRole('button', { name: /Turn on sync/ })).toHaveCount(0);
        expect(server.writes).toBe(0);

        // The server allows it now → the diary still waits for consent
        server.syncEnabled = true;
        await page.evaluate(async () => {
            const { syncEngine } = await import('/src/sync/engine.ts');
            await syncEngine.syncNow();
        });
        await expect(page.getByRole('button', { name: /Turn on sync/ })).toBeVisible();
        expect(server.writes).toBe(0);

        // Ticking the box is required
        await page.getByRole('button', { name: /Turn on sync/ }).click();
        await expect(page.locator('.account-notice.error')).toContainText('tick the box');
        await page.locator('#account-consent').check();
        await page.getByRole('button', { name: /Turn on sync/ }).click();

        await expect(page.locator('.account-sync-status')).toContainText('Up to date');
        expect(server.writes).toBeGreaterThan(0);
        // and what arrived is sealed, not the diary in the clear
        expect(JSON.stringify([...server.rows.values()])).not.toContain('Topped today');
    });
});
