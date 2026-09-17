/**
 * PhotoStore - IndexedDB wrapper for storing photo blobs
 * 
 * Provides 50MB+ storage for photos instead of localStorage's 5MB limit.
 * Photos are stored as Blobs (not base64) for ~33% better efficiency.
 */

const DB_NAME = 'grow-tool-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const CRITICAL_THRESHOLD = 0.95; // 95%

interface PhotoRecord {
    id: string;
    blob: Blob;
    mimeType: string;
    createdAt: string;
}

class PhotoStore {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase> | null = null;

    /**
     * Initialize and get the IndexedDB database
     */
    private async getDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open PhotoStore database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });

        return this.dbPromise;
    }

    /**
     * Save a photo blob to IndexedDB
     */
    async savePhoto(id: string, blob: Blob): Promise<string> {
        // Check quota before saving
        const estimate = await this.getStorageEstimate();
        const currentUsedMB = estimate.used / (1024 * 1024);
        const newSizeMB = blob.size / (1024 * 1024);
        const projectedUsedMB = currentUsedMB + newSizeMB;
        const maxMB = estimate.quota ? estimate.quota / (1024 * 1024) : 50; // Default 50MB

        if (projectedUsedMB > maxMB * CRITICAL_THRESHOLD) {
            throw new Error(`Storage quota exceeded. Current: ${currentUsedMB.toFixed(1)}MB, Adding: ${newSizeMB.toFixed(1)}MB, Limit: ${maxMB.toFixed(1)}MB`);
        }

        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const record: PhotoRecord = {
                id,
                blob,
                mimeType: blob.type || 'image/jpeg',
                createdAt: new Date().toISOString(),
            };

            const request = store.put(record);

            request.onsuccess = () => resolve(id);
            request.onerror = () => {
                console.error('Failed to save photo:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a photo blob by ID
     */
    async getPhoto(id: string): Promise<Blob | null> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                const record = request.result as PhotoRecord | undefined;
                resolve(record?.blob ?? null);
            };

            request.onerror = () => {
                console.error('Failed to get photo:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a photo as a data URL (for display in img src)
     */
    async getPhotoAsDataURL(id: string): Promise<string | null> {
        const blob = await this.getPhoto(id);
        if (!blob) return null;

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Delete a photo by ID
     */
    async deletePhoto(id: string): Promise<void> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('Failed to delete photo:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete multiple photos by IDs
     */
    async deletePhotos(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            let completed = 0;
            let hasError = false;

            for (const id of ids) {
                const request = store.delete(id);
                request.onsuccess = () => {
                    completed++;
                    if (completed === ids.length && !hasError) resolve();
                };
                request.onerror = () => {
                    if (!hasError) {
                        hasError = true;
                        reject(request.error);
                    }
                };
            }
        });
    }

    /**
     * Get all photo IDs in the store
     */
    async getAllPhotoIds(): Promise<string[]> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                resolve(request.result as string[]);
            };

            request.onerror = () => {
                console.error('Failed to get photo IDs:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get storage usage estimate
     */
    async getStorageEstimate(): Promise<{ used: number; quota: number; usagePercent: number }> {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const used = estimate.usage ?? 0;
            const quota = estimate.quota ?? 0;
            return {
                used,
                quota,
                usagePercent: quota > 0 ? used / quota : 0,
            };
        }
        return { used: 0, quota: 0, usagePercent: 0 };
    }

    /**
     * Convert a base64 data URL to a Blob
     */
    dataURLToBlob(dataURL: string): Blob {
        const parts = dataURL.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64 = parts[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }

        return new Blob([array], { type: mimeType });
    }

    /**
     * Generate a unique photo ID
     */
    generatePhotoId(): string {
        return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}

// Export singleton instance
export const photoStore = new PhotoStore();
