/**
 * Thin REST wrappers for the Supabase Data (PostgREST) and Storage APIs.
 * Every call needs a signed-in user; row access is enforced by RLS on the server.
 */
import { syncConfig } from './config';
import { auth } from './auth';
import type { RemoteGrowRow, GrowTombstone } from './merge';
import type { Ciphertext, KeyRecord } from './crypto';
import { parseFlags, type AppFlags, type RedeemResult } from './keys';

export class SyncHttpError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

export type SubscriptionStatus =
    | 'pending' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'refunded' | 'paused';

/**
 * What the signed-in user may do right now — computed by the server
 * (public.my_entitlement) from their subscriptions. `status` is 'free' when no
 * paid subscription currently grants access.
 */
export interface Entitlement {
    plan_id: string;
    plan_name: string;
    sync_enabled: boolean;
    photo_quota_mb: number;
    status: SubscriptionStatus | 'free';
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    provider: string | null;
    sync_consent_at: string | null;
}

/** A tier option from public.plans. */
export interface PlanOption {
    id: string;
    name: string;
    description: string | null;
    price_label: string | null;
    checkout_url: string | null;
    sync_enabled: boolean;
    photo_quota_mb: number;
    rank: number;
}

export interface RemotePhoto {
    /** "<photoId>.bin" (encrypted) or "<photoId>.jpg" (written before encryption) */
    name: string;
    id: string;
    encrypted: boolean;
    created_at: string;
    size: number;
}

const PHOTO_BUCKET = 'photos';

async function call(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
    const token = await auth.getAccessToken();
    if (!token) throw new SyncHttpError('Not signed in', 401);
    let response: Response;
    try {
        response = await fetch(`${syncConfig.url}${path}`, {
            ...init,
            headers: {
                apikey: syncConfig.publishableKey,
                Authorization: `Bearer ${token}`,
                ...init.headers,
            },
        });
    } catch {
        throw new SyncHttpError('Offline', 0);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new SyncHttpError(text || response.statusText, response.status);
    }
    return response;
}

const json = { 'Content-Type': 'application/json' };

export const syncApi = {
    async getEntitlement(): Promise<Entitlement | null> {
        const res = await call('/rest/v1/rpc/my_entitlement', { method: 'POST', headers: json, body: '{}' });
        const rows = await res.json() as Entitlement[];
        return rows[0] ?? null;
    },

    /**
     * Feature flags (public.app_flags) — readable without a login, so the app knows
     * what to show before anyone signs in. Any failure keeps the defaults.
     */
    /** The wrapped key material of the signed-in user (null on a brand new account). */
    async getKeyRecord(): Promise<KeyRecord | null> {
        const res = await call('/rest/v1/user_keys?select=version,kdf_iterations,salt,wrapped_password,recovery_salt,wrapped_recovery');
        const rows = await res.json() as KeyRecord[];
        return rows[0] ?? null;
    },

    /** Store or replace the wrapped key material (after first set-up, a password change or a new recovery key). */
    async putKeyRecord(userId: string, record: KeyRecord): Promise<void> {
        await call('/rest/v1/user_keys?on_conflict=id', {
            method: 'POST',
            headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ id: userId, ...record }),
        });
    },

    /** Art. 17: delete the auth account, its cloud copy and its photos, for good. */
    async deleteAccount(): Promise<void> {
        const token = await auth.getAccessToken();
        if (!token) throw new SyncHttpError('Not signed in', 401);
        let res: Response;
        try {
            res = await fetch(`${syncConfig.url}/functions/v1/delete-account`, {
                method: 'POST',
                headers: { apikey: syncConfig.publishableKey, Authorization: `Bearer ${token}` },
            });
        } catch {
            throw new SyncHttpError('Offline', 0);
        }
        if (!res.ok) throw new SyncHttpError(await res.text().catch(() => '') || res.statusText, res.status);
    },

    async getFlags(): Promise<AppFlags> {
        const res = await fetch(`${syncConfig.url}/rest/v1/app_flags?select=key,enabled`, {
            headers: { apikey: syncConfig.publishableKey },
        });
        if (!res.ok) throw new SyncHttpError(await res.text().catch(() => '') || res.statusText, res.status);
        return parseFlags(await res.json());
    },

    /** 🎟️ Redeem a Grow Key → days on a plan (errors come back as {ok:false, error}). */
    async redeemGrowKey(code: string): Promise<RedeemResult> {
        const res = await call('/rest/v1/rpc/redeem_grow_key', { method: 'POST', headers: json, body: JSON.stringify({ p_code: code }) });
        return res.json();
    },

    /** Add a Ko-fi / Buy Me a Coffee payment made with another email, by its transaction id. */
    async claimSupporterPayment(reference: string): Promise<RedeemResult> {
        const res = await call('/rest/v1/rpc/claim_supporter_payment', { method: 'POST', headers: json, body: JSON.stringify({ p_reference: reference }) });
        return res.json();
    },

    async getPlans(): Promise<PlanOption[]> {
        const res = await call('/rest/v1/plans?select=id,name,description,price_label,checkout_url,sync_enabled,photo_quota_mb,rank&is_public=eq.true&order=rank.asc');
        return res.json();
    },

    async giveConsent(userId: string): Promise<void> {
        const res = await call(`/rest/v1/accounts?id=eq.${encodeURIComponent(userId)}&select=sync_consent_at`, {
            method: 'PATCH',
            headers: { ...json, Prefer: 'return=representation' },
            body: JSON.stringify({ sync_consent_at: new Date().toISOString() }),
        });
        const rows = await res.json() as Array<{ sync_consent_at: string | null }>;
        // An empty answer means no row was updated — that is a failure, not a success
        if (!rows[0]) throw new SyncHttpError('Your account is not set up on the server yet.', 404);
    },

    /** Withdraw consent and erase all synced rows + photos of this user (local data stays). */
    async deleteMySyncedData(userId: string): Promise<void> {
        const photos = await syncApi.listPhotos(userId);
        for (let i = 0; i < photos.length; i += 500) {
            await syncApi.deletePhotos(userId, photos.slice(i, i + 500).map(p => p.name));
        }
        await call('/rest/v1/rpc/delete_my_synced_data', { method: 'POST', headers: json, body: '{}' });
    },

    async getGrows(): Promise<RemoteGrowRow[]> {
        const res = await call('/rest/v1/sync_grows?select=id,data,deleted,updated_at');
        return res.json();
    },

    async upsertGrows(userId: string, rows: Array<{ id: string; data: Ciphertext | GrowTombstone; deleted: boolean }>): Promise<void> {
        if (rows.length === 0) return;
        await call('/rest/v1/sync_grows?on_conflict=owner,id', {
            method: 'POST',
            headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(rows.map(r => ({ owner: userId, ...r }))),
        });
    },

    /** Raw settings payload (encrypted, or plaintext when written before encryption). */
    async getSettingsRow(): Promise<Ciphertext | { strains?: string[] } | null> {
        const res = await call('/rest/v1/sync_settings?select=data');
        const rows = await res.json() as Array<{ data: Ciphertext | { strains?: string[] } }>;
        return rows[0]?.data ?? null;
    },

    async putStrains(userId: string, data: Ciphertext): Promise<void> {
        await call('/rest/v1/sync_settings?on_conflict=owner', {
            method: 'POST',
            headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ owner: userId, data }),
        });
    },

    async listPhotos(userId: string): Promise<RemotePhoto[]> {
        const all: RemotePhoto[] = [];
        const limit = 1000;
        for (let offset = 0; ; offset += limit) {
            const res = await call(`/storage/v1/object/list/${PHOTO_BUCKET}`, {
                method: 'POST',
                headers: json,
                body: JSON.stringify({ prefix: `${userId}/`, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
            });
            const page = await res.json() as Array<{ name: string; created_at: string; metadata?: { size?: number } }>;
            all.push(...page
                .filter(p => p.name.endsWith('.bin') || p.name.endsWith('.jpg'))
                .map(p => ({
                    name: p.name,
                    id: p.name.replace(/\.(bin|jpg)$/, ''),
                    encrypted: p.name.endsWith('.bin'),
                    created_at: p.created_at,
                    size: p.metadata?.size ?? 0,
                })));
            if (page.length < limit) return all;
        }
    },

    /** Uploads the encrypted blob as <user>/<photo id>.bin */
    async uploadPhoto(userId: string, photoId: string, blob: Blob): Promise<void> {
        await call(`/storage/v1/object/${PHOTO_BUCKET}/${userId}/${encodeURIComponent(photoId)}.bin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
            body: blob,
        });
    },

    async downloadPhoto(userId: string, photoId: string, encrypted = true): Promise<Blob> {
        const ext = encrypted ? 'bin' : 'jpg';
        const res = await call(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/${userId}/${encodeURIComponent(photoId)}.${ext}`);
        return res.blob();
    },

    /** Names are "<photo id>.bin" / "<photo id>.jpg" — pass what listPhotos returned. */
    async deletePhotos(userId: string, names: string[]): Promise<void> {
        if (names.length === 0) return;
        await call(`/storage/v1/object/${PHOTO_BUCKET}`, {
            method: 'DELETE',
            headers: json,
            body: JSON.stringify({ prefixes: names.map(name => `${userId}/${name}`) }),
        });
    },
};
