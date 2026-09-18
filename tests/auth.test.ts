import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The auth client against a fake Supabase: what it stores, when it refreshes,
 * and how server errors reach the user. The session store is replaced with an
 * in-memory one (the real one lives in IndexedDB).
 */
vi.mock('../src/sync/config', () => ({
    syncConfig: { url: 'https://project.test', publishableKey: 'sb_publishable_test' },
    isSyncConfigured: () => true,
}));

const stored: { session: unknown | null; cleared: number } = { session: null, cleared: 0 };
vi.mock('../src/sync/session', () => ({
    sessionStore: {
        get: async () => stored.session,
        set: async (s: unknown) => { stored.session = s; },
        clear: async () => { stored.session = null; stored.cleared++; },
    },
    dataKeyStore: { get: async () => null, set: async () => {}, clear: async () => {} },
}));

import { auth, AuthError, friendlyAuthError } from '../src/sync/auth';

const USER = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'grower@example.com' };
const tokenResponse = (expiresIn = 3600, refresh = 'refresh-1') =>
    ({ access_token: `access-${refresh}`, refresh_token: refresh, expires_in: expiresIn, user: USER });

interface Sent { url: string; method: string; body: Record<string, unknown> }
const sent: Sent[] = [];
let reply: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: tokenResponse() });
let offline = false;

vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    sent.push({
        url: String(url),
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : {},
    });
    if (offline) throw new TypeError('Failed to fetch');
    const { status, body } = reply(String(url));
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}));

/** The client is a singleton — start every test from a clean, signed-out state. */
async function resetClient() {
    stored.session = null;
    stored.cleared = 0;
    sent.length = 0;
    offline = false;
    reply = () => ({ status: 200, body: tokenResponse() });
    await auth.signOut();
    sent.length = 0;
    stored.cleared = 0;
}

beforeEach(resetClient);

describe('friendlyAuthError', () => {
    it('explains an unconfirmed email instead of repeating the code', () => {
        const error = friendlyAuthError(400, { error_code: 'email_not_confirmed' });
        expect(error.code).toBe('email_not_confirmed');
        expect(error.message).toMatch(/confirm your email/i);
        expect(error.status).toBe(400);
    });

    it('recognises the message even when the code is missing', () => {
        expect(friendlyAuthError(400, { msg: 'Email not confirmed' }).code).toBe('email_not_confirmed');
        expect(friendlyAuthError(400, { message: 'Invalid login credentials' }).code).toBe('invalid_credentials');
        expect(friendlyAuthError(422, { msg: 'Password should be at least 6 characters' }).code).toBe('weak_password');
        expect(friendlyAuthError(400, { error_description: 'Invalid format' }).code).toBe('invalid_email');
    });

    it('never blames the password for a wrong email, or the other way round', () => {
        expect(friendlyAuthError(400, { error_code: 'invalid_credentials' }).message)
            .toMatch(/email or password is wrong/i);
    });

    it('treats any 429 as rate limiting', () => {
        expect(friendlyAuthError(429, {}).code).toBe('rate_limited');
        expect(friendlyAuthError(400, { error_code: 'over_email_send_rate_limit' }).code).toBe('rate_limited');
    });

    it('keeps an unknown message, and says something useful when there is none', () => {
        expect(friendlyAuthError(418, { msg: 'Teapot refused' }).message).toBe('Teapot refused');
        expect(friendlyAuthError(503, {}).message).toContain('503');
        expect(friendlyAuthError(503, {}).code).toBe('unknown');
    });
});

describe('signing in', () => {
    it('stores the session and works out when the token expires', async () => {
        const before = Date.now();
        const session = await auth.signIn(USER.email, 'correct-horse');

        expect(sent[0].url).toContain('/auth/v1/token?grant_type=password');
        expect(sent[0].body).toMatchObject({ email: USER.email, password: 'correct-horse' });
        expect(session.userId).toBe(USER.id);
        expect(session.expiresAt).toBeGreaterThanOrEqual(before + 3600_000);
        expect(stored.session).toMatchObject({ accessToken: 'access-refresh-1' });
    });

    it('sends a captcha token only when there is one', async () => {
        await auth.signIn(USER.email, 'pw');
        expect(sent[0].body).not.toHaveProperty('gotrue_meta_security');

        await auth.signIn(USER.email, 'pw', 'captcha-abc');
        expect(sent[1].body).toMatchObject({ gotrue_meta_security: { captcha_token: 'captcha-abc' } });
    });

    it('turns a refusal into a friendly error and stores nothing', async () => {
        reply = () => ({ status: 400, body: { error_code: 'invalid_credentials' } });
        const error = await auth.signIn(USER.email, 'nope').catch(e => e);
        expect(error).toBeInstanceOf(AuthError);
        expect(error.code).toBe('invalid_credentials');
        expect(stored.session).toBeNull();
    });

    it('says so plainly when there is no connection', async () => {
        offline = true;
        await expect(auth.signIn(USER.email, 'pw')).rejects.toMatchObject({ code: 'offline' });
    });

    it('tells listeners about the change', async () => {
        const seen: Array<string | null> = [];
        const stop = auth.onChange(s => seen.push(s?.email ?? null));

        await auth.signIn(USER.email, 'pw');
        await auth.signOut();
        stop();
        await auth.signIn(USER.email, 'pw');

        expect(seen).toEqual([USER.email, null]);
    });
});

describe('signing up', () => {
    it('signs the user straight in when confirmation is off', async () => {
        reply = () => ({ status: 200, body: tokenResponse() });
        await expect(auth.signUp(USER.email, 'correct-horse')).resolves.toBe('signed-in');
        expect(stored.session).not.toBeNull();
    });

    it('asks for the confirmation link when there is no token yet', async () => {
        reply = () => ({ status: 200, body: { user: { id: USER.id, identities: [{ id: 'x' }] } } });
        await expect(auth.signUp(USER.email, 'correct-horse')).resolves.toBe('confirm-email');
        expect(stored.session).toBeNull();
    });

    it('spots the "already registered" answer Supabase disguises as a new sign-up', async () => {
        reply = () => ({ status: 200, body: { user: { id: USER.id, identities: [] } } });
        const error = await auth.signUp(USER.email, 'correct-horse').catch(e => e);
        expect(error.code).toBe('already_registered');
        expect(error.message).toMatch(/already has an account/i);
    });
});

describe('the access token', () => {
    it('is null while signed out', async () => {
        await expect(auth.getAccessToken()).resolves.toBeNull();
    });

    it('is handed out as-is while it is still good', async () => {
        await auth.signIn(USER.email, 'pw');
        sent.length = 0;
        await expect(auth.getAccessToken()).resolves.toBe('access-refresh-1');
        expect(sent).toHaveLength(0);                     // no needless refresh
    });

    it('is refreshed a minute before it expires', async () => {
        reply = () => ({ status: 200, body: tokenResponse(30) });   // expires in 30s
        await auth.signIn(USER.email, 'pw');
        sent.length = 0;

        reply = () => ({ status: 200, body: tokenResponse(3600, 'refresh-2') });
        await expect(auth.getAccessToken()).resolves.toBe('access-refresh-2');
        expect(sent[0].url).toContain('grant_type=refresh_token');
        expect(sent[0].body).toEqual({ refresh_token: 'refresh-1' });
    });

    it('refreshes once even when several calls ask at the same time', async () => {
        reply = () => ({ status: 200, body: tokenResponse(30) });
        await auth.signIn(USER.email, 'pw');
        sent.length = 0;

        reply = () => ({ status: 200, body: tokenResponse(3600, 'refresh-2') });
        const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

        expect(tokens).toEqual(['access-refresh-2', 'access-refresh-2', 'access-refresh-2']);
        expect(sent.filter(c => c.url.includes('refresh_token'))).toHaveLength(1);
    });

    it('signs out when the server rejects the refresh token', async () => {
        reply = () => ({ status: 200, body: tokenResponse(30) });
        await auth.signIn(USER.email, 'pw');

        reply = () => ({ status: 400, body: { error_code: 'refresh_token_not_found' } });
        await expect(auth.getAccessToken()).resolves.toBeNull();
        expect(stored.session).toBeNull();
        await expect(auth.getSession()).resolves.toBeNull();
    });

    it('keeps the session when the refresh only failed for lack of network', async () => {
        reply = () => ({ status: 200, body: tokenResponse(30) });
        await auth.signIn(USER.email, 'pw');

        offline = true;
        await expect(auth.getAccessToken()).resolves.toBeNull();
        expect(stored.session).not.toBeNull();            // still there for when we are back online
    });
});

describe('signing out', () => {
    it('drops the session before telling the server, so it cannot get stuck', async () => {
        await auth.signIn(USER.email, 'pw');
        sent.length = 0;
        offline = true;                                   // logout call fails

        await auth.signOut();

        expect(stored.session).toBeNull();
        expect(stored.cleared).toBeGreaterThan(0);
        await expect(auth.getSession()).resolves.toBeNull();
    });
});

describe('changing the password', () => {
    it('needs a signed-in user', async () => {
        await expect(auth.updatePassword('new-password')).rejects.toMatchObject({ code: 'signed_out' });
    });

    it('sends the new password with the current token', async () => {
        await auth.signIn(USER.email, 'pw');
        sent.length = 0;

        await auth.updatePassword('a-longer-password');
        expect(sent[0].url).toBe('https://project.test/auth/v1/user');
        expect(sent[0].method).toBe('PUT');
        expect(sent[0].body).toEqual({ password: 'a-longer-password' });
    });

    it('passes a rejection on in plain words', async () => {
        await auth.signIn(USER.email, 'pw');
        reply = () => ({ status: 422, body: { error_code: 'weak_password' } });
        await expect(auth.updatePassword('short')).rejects.toMatchObject({ code: 'weak_password' });
    });
});

describe('links from confirmation and reset emails', () => {
    const setHash = (hash: string) => {
        window.location.hash = hash;
    };

    beforeEach(() => setHash(''));

    it('ignores a normal page load', async () => {
        await expect(auth.consumeRedirect()).resolves.toBeNull();
    });

    it('takes over the session and cleans the tokens out of the URL', async () => {
        reply = (url) => (url.endsWith('/auth/v1/user') ? { status: 200, body: USER } : { status: 200, body: {} });
        setHash('#access_token=at&refresh_token=rt&expires_in=3600&type=recovery');

        await expect(auth.consumeRedirect()).resolves.toBe('recovery');
        expect(stored.session).toMatchObject({ accessToken: 'at', refreshToken: 'rt', email: USER.email });
        expect(window.location.hash).toBe('');
    });

    it('explains an expired link instead of failing silently', async () => {
        reply = () => ({ status: 401, body: {} });
        setHash('#access_token=old&refresh_token=rt');
        await expect(auth.consumeRedirect()).rejects.toMatchObject({ code: 'link_expired' });
    });

    it('surfaces the error the link itself carries', async () => {
        setHash('#error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
        const error = await auth.consumeRedirect().catch(e => e);
        expect(error.code).toBe('otp_expired');
        expect(error.message).toBe('Email link is invalid or has expired');
    });
});
