/**
 * What goes over the wire, and what comes back.
 *
 * Every synced value (a grow, a tombstone, the strain list) is JSON, sealed with
 * the account's data key before it leaves the device and opened again after it
 * is fetched. Rows written before encryption existed are still plain JSON, so
 * reading tolerates both; `hasPlaintext` tells the engine to rewrite them sealed.
 *
 * Kept separate from the sync engine so the exact JSON → ciphertext → JSON
 * round-trip can be regression-tested without a network or a browser.
 */
import { decryptJson, encryptJson, isCiphertext, type Ciphertext } from './crypto';
import type { GrowTombstone, RemoteGrowRow } from './merge';
import type { Grow } from '../types';

/** What a synced settings row holds. */
export interface SyncSettings {
    strains?: string[];
}

export type RowPayload = Grow | GrowTombstone;
/** A row as it arrives: sealed, or plain JSON from before encryption. */
export type StoredRow<T> = Ciphertext | T | null;

export const sealRow = (payload: RowPayload, key: CryptoKey): Promise<Ciphertext> => encryptJson(payload, key);

export const sealSettings = (settings: SyncSettings, key: CryptoKey): Promise<Ciphertext> => encryptJson(settings, key);

/** Opens a value; a plaintext value from before encryption is passed through. */
export async function openValue<T>(stored: StoredRow<T>, key: CryptoKey): Promise<T | null> {
    if (stored === null || stored === undefined) return null;
    return isCiphertext(stored) ? decryptJson<T>(stored, key) : stored;
}

/** Decrypts a page of grow rows, keeping the row metadata (id, deleted, updated_at) as it is. */
export async function openRows(
    rows: Array<Omit<RemoteGrowRow, 'data'> & { data: StoredRow<RowPayload> }>,
    key: CryptoKey,
): Promise<RemoteGrowRow[]> {
    return Promise.all(rows.map(async row => ({ ...row, data: await openValue<RowPayload>(row.data, key) })));
}

/** The strain list out of a settings row (null when the account has none yet). */
export async function openSettings(stored: StoredRow<SyncSettings>, key: CryptoKey): Promise<string[] | null> {
    const value = await openValue<SyncSettings>(stored, key);
    return value === null ? null : value.strains ?? [];
}

/**
 * True when anything on the server is still unencrypted — the engine then
 * rewrites every row instead of only the changed ones.
 */
export function hasPlaintext(
    rows: Array<{ data: StoredRow<RowPayload> }>,
    settings: StoredRow<SyncSettings>,
): boolean {
    const plain = (value: StoredRow<unknown>) => value !== null && value !== undefined && !isCiphertext(value);
    return rows.some(row => plain(row.data)) || plain(settings);
}
