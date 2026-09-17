import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * 🎟️ Grow Keys & supporter payment claims in the Account modal, against a small
 * in-memory fake of the Supabase APIs (entitlement, plans, redeem/claim RPCs).
 * Runs only when the dev server was started with VITE_SUPABASE_URL set.
 */
const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
test.skip(!SUPABASE, 'VITE_SUPABASE_URL not set — grow key e2e skipped');

const USER = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com' };
const VALID_KEY = '7K2FM9QX4HTP';
const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

interface Fake {
    paidUntil: string | null;
    redeemCalls: string[];
    claimCalls: string[];
    /** rows of public.app_flags; omitted keys default to on */
    flags?: Record<string, boolean>;
    freeSync?: boolean;
}

const newFake = (over: Partial<Fake> = {}): Fake => ({ paidUntil: null, redeemCalls: [], claimCalls: [], ...over });

async function attachFake(page: Page, fake: Fake) {
    await page.route(`${SUPABASE}/**`, async (route: Route) => {
        const req = route.request();
        const p = new URL(req.url()).pathname;
        const json = (status: number, body: unknown) =>
            route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

        if (p === '/auth/v1/token') return json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: USER });
        if (p === '/auth/v1/user') return json(200, USER);
        if (p === '/rest/v1/app_flags') {
            return json(200, Object.entries(fake.flags ?? {}).map(([key, enabled]) => ({ key, enabled })));
        }
        if (p === '/rest/v1/rpc/my_entitlement') {
            if (fake.freeSync) {
                return json(200, [{
                    plan_id: 'free', plan_name: 'Free · sync included', sync_enabled: true, photo_quota_mb: 500,
                    status: 'free', current_period_end: null, cancel_at_period_end: false, provider: null, sync_consent_at: null,
                }]);
            }
            const premium = fake.paidUntil !== null;
            return json(200, [{
                plan_id: premium ? 'premium' : 'free', plan_name: premium ? 'Premium' : 'Free',
                sync_enabled: premium, photo_quota_mb: premium ? 1000 : 0,
                status: premium ? 'active' : 'free', current_period_end: fake.paidUntil,
                cancel_at_period_end: false, provider: premium ? 'credit' : null, sync_consent_at: null,
            }]);
        }
        if (p === '/rest/v1/plans') {
            return json(200, [
                { id: 'free', name: 'Free', description: null, price_label: null, checkout_url: null, sync_enabled: false, photo_quota_mb: 0, rank: 0 },
                { id: 'premium', name: 'Premium', description: 'Sync grows and photos.', price_label: '€3 / month', checkout_url: 'https://ko-fi.com/rafime', sync_enabled: true, photo_quota_mb: 1000, rank: 10 },
            ]);
        }
        if (p === '/rest/v1/rpc/redeem_grow_key') {
            const code = String(req.postDataJSON().p_code);
            fake.redeemCalls.push(code);
            if (code.replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/^GROW/, '') !== VALID_KEY) {
                return json(200, { ok: false, error: 'key_invalid' });
            }
            fake.paidUntil = new Date(Date.now() + 31 * 86_400_000).toISOString();
            return json(200, { ok: true, plan_id: 'premium', plan_name: 'Premium', days: 31, paid_until: fake.paidUntil });
        }
        if (p === '/rest/v1/rpc/claim_supporter_payment') {
            fake.claimCalls.push(String(req.postDataJSON().p_reference));
            return json(200, { ok: false, error: 'claim_not_found' });
        }
        return json(404, { message: `unmocked ${req.method()} ${p}` });
    });
}

async function openAccount(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
        localStorage.setItem('og-grow-theme', 'dark');
    });
    await page.goto('/app.html');
    await page.locator('.settings-btn').first().click();
    await page.getByRole('button', { name: /Sign in or create free account|Account & sync/ }).click();
    await expect(page.locator('.account-modal')).toBeVisible();
    await page.locator('#account-email').fill(USER.email);
    await page.locator('#account-password').fill('correct-horse');
    await page.locator('.account-submit').click();
    await expect(page.locator('.account-badge')).toBeVisible();
}

test.describe('Grow Keys', () => {
    test('sign-in screen mentions keys and supporter payments', async ({ page }) => {
        await attachFake(page, newFake());
        await page.goto('/app.html');
        await page.locator('.settings-btn').first().click();
        await page.getByRole('button', { name: /Sign in or create free account/ }).click();
        await expect(page.locator('.account-pitch')).toContainText('Grow Key');
    });

    test('formats while typing, rejects malformed keys locally, shows server errors, redeems a valid key', async ({ page }) => {
        const fake = newFake();
        await attachFake(page, fake);
        await openAccount(page);

        const input = page.locator('#account-grow-key');
        await expect(input).toBeVisible();
        await input.pressSequentially('7k2fm9');
        await expect(input).toHaveValue('GROW-7K2F-M9');

        // incomplete → local hint, no server call
        await page.getByRole('button', { name: /Redeem key/ }).click();
        await expect(page.locator('.account-perk .account-notice.error')).toContainText('12 characters');
        expect(fake.redeemCalls).toHaveLength(0);

        // well-formed but unknown → server error text
        await input.fill('GROW-AAAA-BBBB-CCCC');
        await page.getByRole('button', { name: /Redeem key/ }).click();
        await expect(page.locator('.account-perk .account-notice.error')).toContainText("doesn't exist");

        // valid → toast, badge turns Premium, "Active until", field cleared
        await input.fill('grow 7k2f m9qx 4htp');
        await page.getByRole('button', { name: /Redeem key/ }).click();
        await expect(page.locator('.account-perk .account-notice')).toContainText('+1 month of Premium');
        await expect(page.locator('.account-badge')).toHaveText(/Premium/);
        await expect(page.locator('.account-card')).toContainText('Active until');
        await expect(page.locator('#account-grow-key')).toHaveValue('');
        expect(fake.redeemCalls.at(-1)).toBe(VALID_KEY);   // sent normalised
    });

    test('switches to claiming a payment by transaction id', async ({ page }) => {
        const fake = newFake();
        await attachFake(page, fake);
        await openAccount(page);

        await expect(page.locator('.account-modal')).toContainText('adds the time automatically');
        await page.getByRole('button', { name: /another email/ }).click();
        await expect(page.getByRole('heading', { name: /Add a supporter payment/ })).toBeVisible();
        await page.locator('#account-reference').fill('abc');
        await page.getByRole('button', { name: /Add payment/ }).click();
        await expect(page.locator('.account-perk .account-notice.error')).toContainText('transaction ID');
        expect(fake.claimCalls).toHaveLength(0);

        await page.locator('#account-reference').fill('kofi-tx-123456');
        await page.getByRole('button', { name: /Add payment/ }).click();
        await expect(page.locator('.account-perk .account-notice.error')).toContainText("couldn't find");
        expect(fake.claimCalls).toEqual(['kofi-tx-123456']);

        await page.getByRole('button', { name: /Grow Key instead/ }).click();
        await expect(page.locator('#account-grow-key')).toBeVisible();
    });

    test('feature flags hide the key box, the claim link and the upgrade cards', async ({ page }) => {
        await attachFake(page, newFake({ flags: { grow_keys: false } }));
        await openAccount(page);
        await expect(page.locator('#account-grow-key')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /Add a supporter payment/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /Grow Key instead/ })).toHaveCount(0);
    });

    test('everything off leaves a plain account screen', async ({ page }) => {
        await attachFake(page, newFake({ flags: { grow_keys: false, supporter_claims: false, plans: false } }));
        await openAccount(page);
        await expect(page.locator('.account-perk')).toHaveCount(0);
        await expect(page.locator('.plan-card')).toHaveCount(0);
        await expect(page.locator('.account-modal')).toContainText("isn't open to new accounts");
        await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible();
    });

    test('free-sync mode: every account may sync, with the free quota', async ({ page }) => {
        await attachFake(page, newFake({ flags: { paid_tiers: false }, freeSync: true }));
        await openAccount(page);
        await expect(page.locator('.account-badge')).toHaveText(/sync included/);
        await expect(page.getByRole('heading', { name: /free for everyone/ })).toBeVisible();
        await expect(page.locator('.account-modal')).toContainText('up to 500 MB');
        await expect(page.locator('.plan-card')).toHaveCount(0);
    });
});
