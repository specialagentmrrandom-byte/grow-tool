/**
 * 🔐 End-to-end encryption for synced data.
 *
 * The server only ever sees ciphertext. How the keys fit together:
 *
 *   password ──PBKDF2(SHA-256, salt, 600k)──▶ KEK ──wraps──┐
 *                                                          ├──▶ data key (random 256 bit)
 *   recovery key (shown once) ──PBKDF2──────▶ RKEK ──wraps─┘        │
 *                                                                   ▼
 *                                          AES-GCM over grow JSON, settings and photos
 *
 * Both wrapped copies live in public.user_keys — useless without the password or
 * the recovery key, neither of which ever leaves the device. A password reset
 * therefore needs the recovery key to keep the cloud copy readable; the diary on
 * the device itself is never encrypted and never at risk.
 *
 * Only Web Crypto, no dependencies.
 */

export const KDF_ITERATIONS = 600_000;
export const CRYPTO_VERSION = 1;
const IV_BYTES = 12;

/** What the server stores for one account (public.user_keys). */
export interface KeyRecord {
    kdf_iterations: number;
    salt: string;                       // base64, for the password KEK
    wrapped_password: string;           // data key, wrapped with the password KEK
    recovery_salt: string;              // base64, for the recovery KEK
    wrapped_recovery: string;           // data key, wrapped with the recovery KEK
    version: number;
}

/** An encrypted value as stored in sync_grows.data / sync_settings.data. */
export interface Ciphertext {
    v: number;
    iv: string;
    ct: string;
}

export class CryptoError extends Error {
    constructor(message: string, public readonly code: 'wrong_password' | 'wrong_recovery_key' | 'corrupt' | 'unsupported') {
        super(message);
    }
}

// ───────────────────────── small helpers ─────────────────────────

const subtle = () => {
    const c = globalThis.crypto?.subtle;
    if (!c) throw new CryptoError('This browser has no Web Crypto — sync needs a secure (https) context.', 'unsupported');
    return c;
};

export function randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    globalThis.crypto.getRandomValues(out);
    return out;
}

export function toBase64(bytes: Uint8Array | ArrayBuffer): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
    return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

/** Recognises an encrypted payload, so plaintext rows from before can still be read. */
export function isCiphertext(value: unknown): value is Ciphertext {
    return Boolean(value) && typeof value === 'object'
        && typeof (value as Ciphertext).ct === 'string'
        && typeof (value as Ciphertext).iv === 'string';
}

// ───────────────────────── keys ─────────────────────────

async function deriveWrappingKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const material = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** A fresh, non-extractable data key. It never leaves the device in the clear. */
async function generateDataKey(): Promise<CryptoKey> {
    return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function wrapDataKey(dataKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
    const raw = await subtle().exportKey('raw', dataKey);
    const iv = randomBytes(IV_BYTES);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, wrappingKey, raw);
    return `${CRYPTO_VERSION}.${toBase64(iv)}.${toBase64(ct)}`;
}

async function unwrapDataKey(wrapped: string, wrappingKey: CryptoKey, wrongCode: 'wrong_password' | 'wrong_recovery_key'): Promise<CryptoKey> {
    const [version, iv, ct] = wrapped.split('.');
    if (Number(version) !== CRYPTO_VERSION || !iv || !ct) {
        throw new CryptoError('This cloud copy was written by a newer version of the app.', 'unsupported');
    }
    let raw: ArrayBuffer;
    try {
        raw = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(iv) as BufferSource }, wrappingKey, fromBase64(ct) as BufferSource);
    } catch {
        throw new CryptoError(
            wrongCode === 'wrong_password'
                ? 'That password does not open this cloud copy.'
                : 'That recovery key does not open this cloud copy.',
            wrongCode,
        );
    }
    // Extractable, so a later password change can re-wrap it without asking again
    return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Recovery key: 20 characters from an unambiguous alphabet (~100 bits),
 * shown as RCVR-XXXXX-XXXXX-XXXXX-XXXXX. The only way back into the cloud copy
 * after a forgotten password.
 */
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRecoveryKey(): string {
    const bytes = randomBytes(20);
    let out = '';
    for (const b of bytes) out += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    return `RCVR-${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

/** Accepts the key however it was typed or pasted. */
export function normalizeRecoveryKey(input: string): string {
    let chars = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    while (chars.startsWith('RCVR')) chars = chars.slice(4);
    return chars;
}

/** First set-up: a new data key, wrapped twice. Returns what to store and the recovery key to show once. */
export async function createKeyRecord(password: string): Promise<{ record: KeyRecord; dataKey: CryptoKey; recoveryKey: string }> {
    const dataKey = await generateDataKey();
    const recoveryKey = generateRecoveryKey();
    const salt = randomBytes(16);
    const recoverySalt = randomBytes(16);

    const record: KeyRecord = {
        kdf_iterations: KDF_ITERATIONS,
        salt: toBase64(salt),
        wrapped_password: await wrapDataKey(dataKey, await deriveWrappingKey(password, salt, KDF_ITERATIONS)),
        recovery_salt: toBase64(recoverySalt),
        wrapped_recovery: await wrapDataKey(dataKey, await deriveWrappingKey(normalizeRecoveryKey(recoveryKey), recoverySalt, KDF_ITERATIONS)),
        version: CRYPTO_VERSION,
    };
    return { record, dataKey, recoveryKey };
}

export async function unlockWithPassword(record: KeyRecord, password: string): Promise<CryptoKey> {
    const kek = await deriveWrappingKey(password, fromBase64(record.salt), record.kdf_iterations || KDF_ITERATIONS);
    return unwrapDataKey(record.wrapped_password, kek, 'wrong_password');
}

export async function unlockWithRecoveryKey(record: KeyRecord, recoveryKey: string): Promise<CryptoKey> {
    const kek = await deriveWrappingKey(normalizeRecoveryKey(recoveryKey), fromBase64(record.recovery_salt), record.kdf_iterations || KDF_ITERATIONS);
    return unwrapDataKey(record.wrapped_recovery, kek, 'wrong_recovery_key');
}

/** After a password change: same data key, wrapped with the new password. Nothing has to be re-uploaded. */
export async function rewrapForPassword(record: KeyRecord, dataKey: CryptoKey, newPassword: string): Promise<KeyRecord> {
    const salt = randomBytes(16);
    return {
        ...record,
        kdf_iterations: KDF_ITERATIONS,
        salt: toBase64(salt),
        wrapped_password: await wrapDataKey(dataKey, await deriveWrappingKey(newPassword, salt, KDF_ITERATIONS)),
        version: CRYPTO_VERSION,
    };
}

/** Replace the recovery key (e.g. after it was used or lost). Returns the record and the new key to show once. */
export async function replaceRecoveryKey(record: KeyRecord, dataKey: CryptoKey): Promise<{ record: KeyRecord; recoveryKey: string }> {
    const recoveryKey = generateRecoveryKey();
    const recoverySalt = randomBytes(16);
    return {
        record: {
            ...record,
            recovery_salt: toBase64(recoverySalt),
            wrapped_recovery: await wrapDataKey(dataKey, await deriveWrappingKey(normalizeRecoveryKey(recoveryKey), recoverySalt, KDF_ITERATIONS)),
        },
        recoveryKey,
    };
}

// ───────────────────────── data ─────────────────────────

/** JSON → {v, iv, ct}. Used for grow rows and the settings row. */
export async function encryptJson(value: unknown, dataKey: CryptoKey): Promise<Ciphertext> {
    const iv = randomBytes(IV_BYTES);
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, dataKey, plain as BufferSource);
    return { v: CRYPTO_VERSION, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptJson<T>(payload: Ciphertext, dataKey: CryptoKey): Promise<T> {
    if (payload.v !== CRYPTO_VERSION) throw new CryptoError('This cloud copy needs a newer version of the app.', 'unsupported');
    let plain: ArrayBuffer;
    try {
        plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource }, dataKey, fromBase64(payload.ct) as BufferSource);
    } catch {
        throw new CryptoError('A synced entry could not be decrypted.', 'corrupt');
    }
    return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Photo: [1 byte version][12 byte iv][ciphertext], uploaded as application/octet-stream. */
export async function encryptBlob(blob: Blob, dataKey: CryptoKey): Promise<Blob> {
    const iv = randomBytes(IV_BYTES);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, dataKey, await blob.arrayBuffer());
    const out = new Uint8Array(1 + iv.length + ct.byteLength);
    out[0] = CRYPTO_VERSION;
    out.set(iv, 1);
    out.set(new Uint8Array(ct), 1 + iv.length);
    return new Blob([out.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

export async function decryptBlob(blob: Blob, dataKey: CryptoKey, type = 'image/jpeg'): Promise<Blob> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 1 + IV_BYTES + 16) throw new CryptoError('This photo could not be decrypted.', 'corrupt');
    if (bytes[0] !== CRYPTO_VERSION) throw new CryptoError('This photo needs a newer version of the app.', 'unsupported');
    try {
        const plain = await subtle().decrypt(
            { name: 'AES-GCM', iv: bytes.subarray(1, 1 + IV_BYTES) as BufferSource },
            dataKey,
            bytes.subarray(1 + IV_BYTES) as BufferSource,
        );
        return new Blob([plain], { type });
    } catch {
        throw new CryptoError('This photo could not be decrypted.', 'corrupt');
    }
}
