/**
 * Shrinks a photo for upload: max 1600 px on the long edge, JPEG, stepping the
 * quality (and if needed the size) down until it fits the target (~350 KB).
 * Local photos stay untouched — only the synced copy is compressed.
 */
export const SYNC_PHOTO_TARGET_BYTES = 350 * 1024;
const MAX_EDGE = 1600;

export async function compressForSync(blob: Blob, targetBytes = SYNC_PHOTO_TARGET_BYTES): Promise<Blob> {
    if (blob.type === 'image/jpeg' && blob.size <= targetBytes) return blob;

    const bitmap = await createImageBitmap(blob);
    try {
        let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        for (let attempt = 0; attempt < 4; attempt++) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#fff'; // transparent PNGs would turn black as JPEG
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

            let smallest: Blob | null = null;
            for (const quality of [0.82, 0.7, 0.58, 0.46]) {
                const out = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality));
                if (!out) continue;
                if (out.size <= targetBytes) return out;
                smallest = out;
            }
            if (attempt === 3 && smallest) return smallest;
            scale *= 0.75;
        }
        throw new Error('Could not compress photo');
    } finally {
        bitmap.close();
    }
}
