import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The REST layer against a fake server: what it sends (URLs, headers, bodies)
 * and how it turns failures into SyncHttpError. Nothing here touches a real
 * project — config and the token are stubbed.
 */
vi.mock('../src/sync/config', () => ({
    syncConfig: { url: 'https://project.test', publishableKey: 'sb_publishable_test' },
    isSyncConfigured: () => true,
}));

let token: string | null = 'access-token';
vi.mock('../src/sync/auth', () => ({
    auth: { getAccessToken: async () => token },
}));

import { syncApi, SyncHttpError, restCall, json } from '../src/sync/api';
import type { Ciphertext } from '../src/sync/crypto';

const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CIPHER: Ciphertext = { v: 1, iv: 'aXY=', ct: 'Y3Q=' } as unknown as Ciphertext;

interface Sent { url: string; method: string; headers: Record<string, string>; body: unknown }

const sent: Sent[] = [];
let reply: (url: string, init: RequestInit) => unknown = () => [];
let failWith: 'network' | null = null;

const response = (status: number, body: unknown): Response => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    blob: async () => body,
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    sent.push({
        url: String(url),
        method: init.method ?? 'GET',
        headers: (init.headers ?? {}) as Record<string, string>,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    });
    if (failWith === 'network') throw new TypeError('Failed to fetch');
    const result = reply(String(url), init);
    return result instanceof Object && 'ok' in result ? result as Response : response(200, result);
}));

const lastCall = () => sent[sent.length - 1];

beforeEach(() => {
    sent.length = 0;
    token = 'access-token';
    failWith = null;
    reply = () => [];
});

describe('authenticated calls', () => {
    it('sends the project key and the user\'s token', async () => {
        await restCall('/rest/v1/anything');
        expect(lastCall().url).toBe('https://project.test/rest/v1/anything');
        expect(lastCall().headers).toMatchObject({
            apikey: 'sb_publishable_test',
            Authorization: 'Bearer access-token',
        });
    });

    it('refuses to call the server while signed out', async () => {
        token = null;
        await expect(restCall('/rest/v1/anything')).rejects.toMatchObject({ status: 401 });
        expect(sent).toHaveLength(0);
    });

    it('turns a dead connection into an offline error (status 0)', async () => {
        failWith = 'network';
        await expect(restCall('/rest/v1/anything')).rejects.toMatchObject({ status: 0, message: 'Offline' });
    });

    it('passes the server\'s own message through with its status', async () => {
        reply = () => response(403, 'new row violates row-level security policy');
        const error = await restCall('/rest/v1/sync_grows').catch(e => e);
        expect(error).toBeInstanceOf(SyncHttpError);
        expect(error.status).toBe(403);
        expect(error.message).toContain('row-level security');
    });

    it('falls back to the status text when the body is empty', async () => {
        reply = () => response(500, '');
        await expect(restCall('/x')).rejects.toMatchObject({ status: 500, message: 'status 500' });
    });
});

describe('what the account may do', () => {
    it('reads the first row the server returns', async () => {
        reply = () => [{ sync_enabled: true, photo_quota_mb: 500, sync_consent_at: null }];
        await expect(syncApi.getAccess()).resolves.toMatchObject({ sync_enabled: true, photo_quota_mb: 500 });
        expect(lastCall().url).toContain('/rest/v1/rpc/my_entitlement');
        expect(lastCall().method).toBe('POST');
    });

    it('answers null when the server has no row for this account', async () => {
        reply = () => [];
        await expect(syncApi.getAccess()).resolves.toBeNull();
    });
});

describe('feature switches', () => {
    it('reads them without a login, so the app knows what to show', async () => {
        token = null;                                   // signed out on purpose
        reply = () => [{ key: 'alpha', enabled: false }];
        await expect(syncApi.getFlags()).resolves.toEqual({ alpha: false });

        expect(lastCall().url).toContain('/rest/v1/app_flags?select=key,enabled');
        expect(lastCall().headers.apikey).toBe('sb_publishable_test');
        expect(lastCall().headers.Authorization).toBeUndefined();
    });

    it('reports a failed read instead of inventing switches', async () => {
        reply = () => response(500, 'boom');
        await expect(syncApi.getFlags()).rejects.toBeInstanceOf(SyncHttpError);
    });
});

describe('key material', () => {
    it('asks only for the wrapped fields', async () => {
        reply = () => [{ version: 1 }];
        await syncApi.getKeyRecord();
        expect(lastCall().url).toContain('user_keys?select=version,kdf_iterations,salt,wrapped_password,recovery_salt,wrapped_recovery');
    });

    it('answers null for a brand new account', async () => {
        reply = () => [];
        await expect(syncApi.getKeyRecord()).resolves.toBeNull();
    });

    it('stores the record under the user id, replacing what was there', async () => {
        const record = { version: 1, kdf_iterations: 600000, salt: 's', wrapped_password: 'w', recovery_salt: 'r', wrapped_recovery: 'x' };
        await syncApi.putKeyRecord(USER, record);
        expect(lastCall().headers.Prefer).toContain('resolution=merge-duplicates');
        expect(lastCall().body).toEqual({ id: USER, ...record });
    });
});

describe('diary rows', () => {
    it('sends nothing when there is nothing to send', async () => {
        await syncApi.upsertGrows(USER, []);
        expect(sent).toHaveLength(0);
    });

    it('stamps every row with its owner', async () => {
        await syncApi.upsertGrows(USER, [{ id: 'grow_1', data: CIPHER, deleted: false }]);
        expect(lastCall().url).toContain('on_conflict=owner,id');
        expect(lastCall().body).toEqual([{ owner: USER, id: 'grow_1', data: CIPHER, deleted: false }]);
    });

    it('reads the settings row, or null when there is none', async () => {
        reply = () => [{ data: CIPHER }];
        await expect(syncApi.getSettingsRow()).resolves.toEqual(CIPHER);
        reply = () => [];
        await expect(syncApi.getSettingsRow()).resolves.toBeNull();
    });
});

describe('photos', () => {
    const page = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({
        name: `photo_${offset + i}.bin`, created_at: '2026-05-01T00:00:00Z', metadata: { size: 1000 + i },
    }));

    it('keeps asking until the last page is short', async () => {
        reply = (_url, init) => {
            const body = JSON.parse(String(init.body));
            return body.offset === 0 ? page(1000) : page(3, 1000);
        };
        const photos = await syncApi.listPhotos(USER);
        expect(photos).toHaveLength(1003);
        expect(sent).toHaveLength(2);
        expect(sent.map(c => (c.body as { offset: number }).offset)).toEqual([0, 1000]);
        expect((sent[0].body as { prefix: string }).prefix).toBe(`${USER}/`);
    });

    it('reports the id and whether the file is encrypted', async () => {
        reply = () => [
            { name: 'a.bin', created_at: 'x', metadata: { size: 10 } },
            { name: 'b.jpg', created_at: 'x', metadata: { size: 20 } },
            { name: 'notes.txt', created_at: 'x' },      // not a photo → ignored
        ];
        const photos = await syncApi.listPhotos(USER);
        expect(photos).toEqual([
            { name: 'a.bin', id: 'a', encrypted: true, created_at: 'x', size: 10 },
            { name: 'b.jpg', id: 'b', encrypted: false, created_at: 'x', size: 20 },
        ]);
    });

    it('uploads encrypted bytes to <user>/<id>.bin', async () => {
        await syncApi.uploadPhoto(USER, 'photo/1', new Blob(['sealed']));
        expect(lastCall().url).toBe(`https://project.test/storage/v1/object/photos/${USER}/photo%2F1.bin`);
        expect(lastCall().headers['Content-Type']).toBe('application/octet-stream');
        expect(lastCall().headers['x-upsert']).toBe('true');
    });

    it('downloads .bin by default and .jpg for the old plaintext ones', async () => {
        reply = () => 'blob';
        await syncApi.downloadPhoto(USER, 'p1');
        expect(lastCall().url).toContain(`/authenticated/photos/${USER}/p1.bin`);
        await syncApi.downloadPhoto(USER, 'p1', false);
        expect(lastCall().url).toContain(`/authenticated/photos/${USER}/p1.jpg`);
    });

    it('deletes by full path, and skips the call for an empty list', async () => {
        await syncApi.deletePhotos(USER, []);
        expect(sent).toHaveLength(0);

        await syncApi.deletePhotos(USER, ['a.bin', 'b.jpg']);
        expect(lastCall().method).toBe('DELETE');
        expect(lastCall().body).toEqual({ prefixes: [`${USER}/a.bin`, `${USER}/b.jpg`] });
    });
});

describe('withdrawing consent', () => {
    it('clears the photos in batches, then the rows', async () => {
        const many = Array.from({ length: 501 }, (_, i) => ({ name: `p${i}.bin`, created_at: 'x', metadata: { size: 1 } }));
        reply = (url) => (url.includes('/storage/v1/object/list/') ? many : []);

        await syncApi.deleteMySyncedData(USER);

        const deletes = sent.filter(c => c.method === 'DELETE');
        expect(deletes).toHaveLength(2);                                   // 500 + 1
        expect((deletes[0].body as { prefixes: string[] }).prefixes).toHaveLength(500);
        expect((deletes[1].body as { prefixes: string[] }).prefixes).toHaveLength(1);
        expect(lastCall().url).toContain('/rest/v1/rpc/delete_my_synced_data');
    });
});

describe('consent', () => {
    it('records the moment the user agreed', async () => {
        reply = () => [{ sync_consent_at: '2026-05-10T09:00:00Z' }];
        await syncApi.giveConsent(USER);
        expect(lastCall().method).toBe('PATCH');
        expect(lastCall().url).toContain(`accounts?id=eq.${USER}`);
        expect(lastCall().body).toHaveProperty('sync_consent_at');
    });

    it('treats "no row updated" as a failure, not a success', async () => {
        reply = () => [];
        await expect(syncApi.giveConsent(USER)).rejects.toMatchObject({ status: 404 });
    });
});

describe('deleting the account', () => {
    it('calls the edge function with the user\'s own token', async () => {
        await syncApi.deleteAccount();
        expect(lastCall().url).toBe('https://project.test/functions/v1/delete-account');
        expect(lastCall().method).toBe('POST');
        expect(lastCall().headers.Authorization).toBe('Bearer access-token');
    });

    it('does not try while signed out', async () => {
        token = null;
        await expect(syncApi.deleteAccount()).rejects.toMatchObject({ status: 401 });
        expect(sent).toHaveLength(0);
    });

    it('reports a server refusal', async () => {
        reply = () => response(500, 'could not delete');
        await expect(syncApi.deleteAccount()).rejects.toMatchObject({ status: 500 });
    });
});

describe('the JSON header', () => {
    it('is what every write uses', () => {
        expect(json).toEqual({ 'Content-Type': 'application/json' });
    });
});
