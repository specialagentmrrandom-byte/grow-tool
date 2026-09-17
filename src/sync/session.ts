/**
 * Persists the login session in its own small IndexedDB database
 * (`grow-tool-account`) — separate from diary data and photos, and less exposed
 * than localStorage.
 */
export interface Session {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // epoch ms
    userId: string;
    email: string;
}

const DB_NAME = 'grow-tool-account';
const KEY_ENTRY = 'data-key';
const STORE_NAME = 'kv';
const SESSION_KEY = 'session';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => { dbPromise = null; reject(request.error); };
        request.onblocked = () => { dbPromise = null; reject(new Error('Account storage is blocked by another tab')); };
    });
    return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = fn(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
    });
}

/**
 * The unlocked data key (a CryptoKey, never its raw bytes as text). It stays in
 * this browser so the app doesn't ask for the password on every start, and is
 * wiped on sign-out.
 */
export const dataKeyStore = {
    async get(): Promise<CryptoKey | null> {
        try {
            return (await run<CryptoKey | undefined>('readonly', s => s.get(KEY_ENTRY))) ?? null;
        } catch {
            return null;
        }
    },
    async set(key: CryptoKey): Promise<void> {
        try {
            await run('readwrite', s => s.put(key, KEY_ENTRY));
        } catch {
            /* private mode: keep it in memory for this session only */
        }
    },
    async clear(): Promise<void> {
        try {
            await run('readwrite', s => s.delete(KEY_ENTRY));
        } catch {
            /* nothing stored */
        }
    },
};

export const sessionStore = {
    async get(): Promise<Session | null> {
        try {
            return (await run<Session | undefined>('readonly', s => s.get(SESSION_KEY))) ?? null;
        } catch {
            return null;
        }
    },
    async set(session: Session): Promise<void> {
        await run('readwrite', s => s.put(session, SESSION_KEY));
    },
    async clear(): Promise<void> {
        try {
            await run('readwrite', s => s.delete(SESSION_KEY));
        } catch {
            /* nothing stored */
        }
        await dataKeyStore.clear();   // signing out always drops the key
    },
};
