/**
 * Sync engine: keeps this device's diary in step with the server for premium
 * accounts. Offline-first — the app never waits for it; failures only change
 * the status and are retried later.
 *
 * One run:  pull rows → merge (merge.ts) → apply locally → upload missing photos
 *           → push changed rows → download missing photos → clean old orphans.
 */
import { store } from '../store';
import { photoStore } from '../photoStore';
import { auth } from './auth';
import { dataKeyStore } from './session';
import {
    createKeyRecord, decryptBlob, decryptJson, encryptBlob, encryptJson, isCiphertext,
    rewrapForPassword, replaceRecoveryKey, unlockWithPassword, unlockWithRecoveryKey,
} from './crypto';
import { isSyncConfigured } from './config';
import { syncApi, SyncHttpError, type Entitlement, type PlanOption } from './api';
import { mergeAll, stableStringify, type GrowTombstone, type RemoteGrowRow } from './merge';
import type { Grow } from '../types';
import { compressForSync } from './compress';
import { DEFAULT_FLAGS, type AppFlags, type RedeemResult } from './keys';

export type SyncStatus =
    | 'disabled'       // not configured in this build
    | 'signed-out'
    | 'free'           // signed in, current plan has no sync (free account)
    | 'needs-consent'  // plan includes sync, but consent not given yet
    | 'locked'         // encrypted cloud copy on the server, no key on this device yet
    | 'idle'
    | 'syncing'
    | 'offline'
    | 'error';

export interface SyncState {
    status: SyncStatus;
    email: string | null;
    entitlement: Entitlement | null;
    plans: PlanOption[];
    /** What is switched on server-side (public.app_flags) */
    flags: AppFlags;
    /** Shown once, right after the key was created or replaced — never stored anywhere. */
    recoveryKey: string | null;
    lastSyncedAt: string | null;
    error: string | null;
    photosUploaded: number;
    photosDownloaded: number;
}

/** Orphaned remote photos are only removed after this, so a device mid-upload can't lose them. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 4000;
const INTERVAL_MS = 5 * 60 * 1000;

/** The server decides; this only reads its answer. */
export function canUseSync(entitlement: Entitlement | null): boolean {
    return Boolean(entitlement?.sync_enabled);
}

/** Days until the current paid period ends (negative = already over), or null for no end. */
export function daysLeft(entitlement: Entitlement | null, now = Date.now()): number | null {
    if (!entitlement?.current_period_end) return null;
    return Math.ceil((Date.parse(entitlement.current_period_end) - now) / 86_400_000);
}

type Listener = (state: SyncState) => void;

class SyncEngine {
    private state: SyncState = {
        status: isSyncConfigured() ? 'signed-out' : 'disabled',
        email: null,
        entitlement: null,
        plans: [],
        flags: DEFAULT_FLAGS,
        recoveryKey: null,
        lastSyncedAt: null,
        error: null,
        photosUploaded: 0,
        photosDownloaded: 0,
    };
    private listeners: Listener[] = [];
    private dataListeners: Array<() => void> = [];
    private running: Promise<void> | null = null;
    private rerun = false;
    private applying = false;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private started = false;
    /** The key that opens the cloud copy. In memory + IndexedDB, never on the server. */
    private dataKey: CryptoKey | null = null;

    getState(): SyncState {
        return this.state;
    }

    onState(listener: Listener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    /** Fires after synced changes from another device were written into the local store. */
    onRemoteData(listener: () => void): () => void {
        this.dataListeners.push(listener);
        return () => { this.dataListeners = this.dataListeners.filter(l => l !== listener); };
    }

    private set(patch: Partial<SyncState>): void {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach(l => l(this.state));
    }

    /** Wire up triggers once at app start. Safe to call when sync isn't configured. */
    start(): void {
        if (this.started || !isSyncConfigured()) return;
        this.started = true;

        store.onChange(() => {
            if (!this.applying) this.schedule();
        });
        auth.onChange(session => {
            this.set({ email: session?.email ?? null });
            if (session) void this.syncNow();
            else {
                this.dataKey = null;
                this.set({ status: 'signed-out', entitlement: null, plans: [], error: null, recoveryKey: null });
            }
        });
        window.addEventListener('online', () => void this.syncNow());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void this.syncNow();
        });
        setInterval(() => {
            if (document.visibilityState === 'visible') void this.syncNow();
        }, INTERVAL_MS);

        void this.refreshFlags();

        void (async () => {
            const session = await auth.getSession();
            this.set({ email: session?.email ?? null });
            if (session) await this.syncNow();
        })();
    }

    private schedule(): void {
        if (this.running) {
            this.rerun = true;
            return;
        }
        if (this.state.status !== 'idle' && this.state.status !== 'error' && this.state.status !== 'offline') return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => void this.syncNow(), DEBOUNCE_MS);
    }

    async giveConsent(): Promise<void> {
        const session = await auth.getSession();
        if (!session) return;
        await syncApi.giveConsent(session.userId);
        await this.syncNow();
    }

    /**
     * 🔐 Open (or create) the encrypted cloud copy with the account password.
     * Called right after signing in or signing up, while the password is at hand.
     * A brand-new account gets a fresh key and a recovery key to write down.
     */
    async unlockWithPassword(password: string): Promise<void> {
        const session = await auth.getSession();
        if (!session) return;
        const record = await syncApi.getKeyRecord();
        if (!record) {
            const created = await createKeyRecord(password);
            await syncApi.putKeyRecord(session.userId, created.record);
            await this.useDataKey(created.dataKey);
            this.set({ recoveryKey: created.recoveryKey });
        } else {
            await this.useDataKey(await unlockWithPassword(record, password));
        }
        await this.syncNow();
    }

    /** Open the cloud copy with the recovery key (after a forgotten password). */
    async unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
        const record = await syncApi.getKeyRecord();
        if (!record) throw new Error('There is no cloud copy for this account yet.');
        await this.useDataKey(await unlockWithRecoveryKey(record, recoveryKey));
        await this.syncNow();
    }

    /** After a password change: re-wrap the same key, so nothing has to be re-uploaded. */
    async rewrapAfterPasswordChange(newPassword: string): Promise<boolean> {
        const session = await auth.getSession();
        const key = await this.getDataKey();
        if (!session || !key) return false;
        const record = await syncApi.getKeyRecord();
        if (!record) return false;
        await syncApi.putKeyRecord(session.userId, await rewrapForPassword(record, key, newPassword));
        return true;
    }

    /** Hand out a fresh recovery key (the old one stops working). */
    async newRecoveryKey(): Promise<string> {
        const session = await auth.getSession();
        const key = await this.getDataKey();
        const record = session ? await syncApi.getKeyRecord() : null;
        if (!session || !key || !record) throw new Error('Unlock the cloud copy first.');
        const { record: updated, recoveryKey } = await replaceRecoveryKey(record, key);
        await syncApi.putKeyRecord(session.userId, updated);
        this.set({ recoveryKey });
        return recoveryKey;
    }

    /**
     * Last resort when both the password and the recovery key are gone: throw the
     * unreadable cloud copy away and start again from this device's diary.
     */
    async startFresh(password: string): Promise<void> {
        const session = await auth.getSession();
        if (!session) return;
        await syncApi.deleteMySyncedData(session.userId).catch(() => { /* nothing there yet */ });
        const created = await createKeyRecord(password);
        await syncApi.putKeyRecord(session.userId, created.record);
        await this.useDataKey(created.dataKey);
        this.set({ recoveryKey: created.recoveryKey });
        await this.syncNow();
    }

    /** The recovery key is shown once; this clears it from the state afterwards. */
    dismissRecoveryKey(): void {
        if (this.state.recoveryKey) this.set({ recoveryKey: null });
    }

    private async useDataKey(key: CryptoKey): Promise<void> {
        this.dataKey = key;
        await dataKeyStore.set(key);
    }

    private async getDataKey(): Promise<CryptoKey | null> {
        if (!this.dataKey) this.dataKey = await dataKeyStore.get();
        return this.dataKey;
    }

    /** Load the feature flags; they are public, so this works signed out too. */
    private async refreshFlags(): Promise<void> {
        try {
            this.set({ flags: await syncApi.getFlags() });
        } catch {
            /* keep the current flags — a failed read must not hide a feature */
        }
    }

    /** Redeem a Grow Key; on success the new plan time is loaded right away. */
    async redeemKey(code: string): Promise<RedeemResult> {
        const result = await syncApi.redeemGrowKey(code);
        if (result.ok) await this.syncNow();
        return result;
    }

    /** Claim a supporter payment by transaction id; on success the new plan time is loaded right away. */
    async claimPayment(reference: string): Promise<RedeemResult> {
        const result = await syncApi.claimSupporterPayment(reference);
        if (result.ok) await this.syncNow();
        return result;
    }

    async deleteSyncedData(): Promise<void> {
        const session = await auth.getSession();
        if (!session) return;
        await this.running;
        await syncApi.deleteMySyncedData(session.userId);
        this.set({ entitlement: this.state.entitlement ? { ...this.state.entitlement, sync_consent_at: null } : null, lastSyncedAt: null });
        await this.syncNow();
    }

    /** Run a sync now (or once more right after the current run). */
    syncNow(): Promise<void> {
        if (!isSyncConfigured()) return Promise.resolve();
        if (this.running) {
            this.rerun = true;
            return this.running;
        }
        this.running = (async () => {
            try {
                do {
                    this.rerun = false;
                    await this.runOnce();
                } while (this.rerun);
            } finally {
                this.running = null;
            }
        })();
        return this.running;
    }

    private async runOnce(): Promise<void> {
        const session = await auth.getSession();
        if (!session) {
            this.set({ status: 'signed-out', entitlement: null, plans: [] });
            return;
        }
        if (!navigator.onLine) {
            this.set({ status: 'offline' });
            return;
        }

        try {
            await this.refreshFlags();
            // Re-checked on every run, so a cancellation or failed payment takes effect without re-login
            const entitlement = await syncApi.getEntitlement();
            if (!canUseSync(entitlement)) {
                const plans = await syncApi.getPlans().catch(() => this.state.plans);
                this.set({ status: 'free', entitlement, plans, error: null });
                return;
            }
            if (!entitlement?.sync_consent_at) {
                this.set({ status: 'needs-consent', entitlement, error: null });
                return;
            }
            const dataKey = await this.getDataKey();
            if (!dataKey) {
                // The cloud copy is encrypted and this device has no key yet
                this.set({ status: 'locked', entitlement, error: null });
                return;
            }
            this.set({ status: 'syncing', entitlement, error: null });

            const [rawRows, rawSettings] = await Promise.all([syncApi.getGrows(), syncApi.getSettingsRow()]);
            const rows = await Promise.all(rawRows.map(async row => ({
                ...row,
                data: isCiphertext(row.data) ? await decryptJson<RemoteGrowRow['data']>(row.data, dataKey) : row.data,
            })));
            const remoteStrains = rawSettings === null
                ? null
                : (isCiphertext(rawSettings)
                    ? (await decryptJson<{ strains?: string[] }>(rawSettings, dataKey)).strains ?? []
                    : rawSettings.strains ?? []);
            // Anything still in the clear was written before encryption — rewrite it
            const plaintextLeft = rawRows.some(r => r.data !== null && !isCiphertext(r.data))
                || (rawSettings !== null && !isCiphertext(rawSettings));

            const local = store.getSyncSnapshot();
            const result = mergeAll(local, rows, remoteStrains ?? []);

            if (result.localChanged) {
                this.applying = true;
                try {
                    store.applySyncResult(result.local);
                } finally {
                    this.applying = false;
                }
                this.dataListeners.forEach(l => l());
            }

            const referenced = new Set(result.local.grows.flatMap(g => g.entries.flatMap(e => e.photoIds ?? [])));
            const remotePhotos = await syncApi.listPhotos(session.userId);
            const encryptedIds = new Set(remotePhotos.filter(p => p.encrypted).map(p => p.id));
            const localIds = new Set(await photoStore.getAllPhotoIds());

            // Photos written before encryption: fetch what this device is missing, then re-upload sealed
            const legacy = remotePhotos.filter(p => !p.encrypted && !encryptedIds.has(p.id));
            for (const photo of legacy) {
                if (!localIds.has(photo.id)) {
                    const blob = await syncApi.downloadPhoto(session.userId, photo.id, false).catch(() => null);
                    if (blob) {
                        await photoStore.savePhoto(photo.id, blob);
                        localIds.add(photo.id);
                    }
                }
            }

            // Photos first, so another device never sees an entry whose photo isn't there yet
            const uploaded = await this.uploadMissing(
                session.userId, referenced, localIds, encryptedIds, remotePhotos.filter(p => p.encrypted),
                entitlement.photo_quota_mb, dataKey);

            // After the switch to encryption, every row is rewritten once — not just the changed ones
            const push: Array<{ id: string; data: Grow | GrowTombstone; deleted: boolean }> = plaintextLeft
                ? [
                    ...result.local.grows.map(g => ({ id: g.id, data: g, deleted: false })),
                    ...result.push.filter(r => r.deleted),
                ]
                : result.push;
            await syncApi.upsertGrows(session.userId, await Promise.all(push.map(async row => ({
                ...row,
                data: await encryptJson(row.data, dataKey),
            }))));
            if (plaintextLeft || remoteStrains === null
                || stableStringify([...remoteStrains].sort()) !== stableStringify([...result.local.strains].sort())) {
                await syncApi.putStrains(session.userId, await encryptJson({ strains: result.local.strains }, dataKey));
            }

            const downloaded = await this.downloadMissing(session.userId, referenced, localIds, encryptedIds, dataKey);

            const cutoff = Date.now() - ORPHAN_GRACE_MS;
            const staleNames = remotePhotos
                .filter(p => (!referenced.has(p.id) && Date.parse(p.created_at) < cutoff)
                    // a plaintext copy goes as soon as the sealed one is there
                    || (!p.encrypted && encryptedIds.has(p.id)))
                .map(p => p.name);
            await syncApi.deletePhotos(session.userId, staleNames).catch(() => { /* retry next run */ });

            this.set({
                status: 'idle',
                lastSyncedAt: new Date().toISOString(),
                error: null,
                photosUploaded: this.state.photosUploaded + uploaded,
                photosDownloaded: this.state.photosDownloaded + downloaded,
            });
        } catch (e) {
            if (e instanceof SyncHttpError && e.status === 0) {
                this.set({ status: 'offline' });
            } else if (e instanceof SyncHttpError && e.status === 401) {
                await auth.signOut();
            } else if (e instanceof SyncHttpError && e.status === 403) {
                // The server's gate said no (plan ended or consent withdrawn meanwhile) — re-read the entitlement
                this.rerun = true;
            } else {
                console.error('Sync failed:', e);
                this.set({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed' });
            }
        }
    }

    private async uploadMissing(
        userId: string,
        referenced: Set<string>,
        localIds: Set<string>,
        remoteIds: Set<string>,
        remotePhotos: Array<{ size: number }>,
        quotaMb: number,
        dataKey: CryptoKey,
    ): Promise<number> {
        let usedBytes = remotePhotos.reduce((sum, p) => sum + p.size, 0);
        const maxBytes = quotaMb * 1024 * 1024;
        let count = 0;
        for (const id of referenced) {
            if (remoteIds.has(id) || !localIds.has(id)) continue;
            const original = await photoStore.getPhoto(id);
            if (!original) continue;
            try {
                const small = await encryptBlob(await compressForSync(original), dataKey);
                if (usedBytes + small.size > maxBytes) {
                    this.set({ error: `Photo storage limit of your plan (${quotaMb} MB) reached — new photos stay on this device.` });
                    break;
                }
                await syncApi.uploadPhoto(userId, id, small);
                usedBytes += small.size;
                count++;
            } catch (e) {
                if (e instanceof SyncHttpError && (e.status === 0 || e.status === 401 || e.status === 403)) throw e;
                console.warn(`Skipping photo ${id}:`, e); // e.g. unreadable image — don't block the rest
            }
        }
        return count;
    }

    private async downloadMissing(userId: string, referenced: Set<string>, localIds: Set<string>, remoteIds: Set<string>, dataKey: CryptoKey): Promise<number> {
        let count = 0;
        let changed = false;
        for (const id of referenced) {
            if (localIds.has(id) || !remoteIds.has(id)) continue;
            try {
                const blob = await decryptBlob(await syncApi.downloadPhoto(userId, id), dataKey);
                await photoStore.savePhoto(id, blob);
                count++;
                changed = true;
            } catch (e) {
                if (e instanceof SyncHttpError && (e.status === 0 || e.status === 401)) throw e;
                console.warn(`Could not download photo ${id}:`, e);
            }
        }
        if (changed) this.dataListeners.forEach(l => l());
        return count;
    }
}

export const syncEngine = new SyncEngine();
