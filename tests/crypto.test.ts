// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    createKeyRecord, unlockWithPassword, unlockWithRecoveryKey, rewrapForPassword, replaceRecoveryKey,
    encryptJson, decryptJson, encryptBlob, decryptBlob, isCiphertext, generateRecoveryKey,
    normalizeRecoveryKey, CryptoError, KDF_ITERATIONS,
} from '../src/sync/crypto';

// PBKDF2 with 600k iterations is deliberately slow — one setup for the whole file.
const PASSWORD = 'correct-horse-battery';
const setup = createKeyRecord(PASSWORD);

describe('end-to-end encryption', () => {
    it('wraps the data key for both the password and the recovery key', async () => {
        const { record, recoveryKey } = await setup;
        expect(record.kdf_iterations).toBe(KDF_ITERATIONS);
        expect(record.wrapped_password).not.toBe(record.wrapped_recovery);
        expect(record.salt).not.toBe(record.recovery_salt);
        // nothing in the stored record reveals the password or the key
        expect(JSON.stringify(record)).not.toContain(PASSWORD);
        expect(JSON.stringify(record)).not.toContain(normalizeRecoveryKey(recoveryKey));
        expect(recoveryKey).toMatch(/^RCVR-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    }, 30_000);

    it('round-trips a grow through the password key', async () => {
        const { record } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const grow = { id: 'g1', strain: 'Blue <3 Dream', entries: [{ id: 'e1', title: 'Topped 🌿' }] };
        const payload = await encryptJson(grow, key);

        expect(isCiphertext(payload)).toBe(true);
        expect(JSON.stringify(payload)).not.toContain('Blue');
        expect(JSON.stringify(payload)).not.toContain('Topped');
        expect(await decryptJson(payload, key)).toEqual(grow);
    }, 30_000);

    it('gives a different ciphertext every time (fresh iv)', async () => {
        const { record } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const a = await encryptJson({ x: 1 }, key);
        const b = await encryptJson({ x: 1 }, key);
        expect(a.ct).not.toBe(b.ct);
        expect(a.iv).not.toBe(b.iv);
    }, 30_000);

    it('refuses a wrong password and a wrong recovery key', async () => {
        const { record } = await setup;
        await expect(unlockWithPassword(record, 'not-the-password')).rejects.toMatchObject({ code: 'wrong_password' });
        await expect(unlockWithRecoveryKey(record, generateRecoveryKey())).rejects.toMatchObject({ code: 'wrong_recovery_key' });
    }, 30_000);

    it('opens with the recovery key, however it was typed', async () => {
        const { record, recoveryKey } = await setup;
        const viaPassword = await unlockWithPassword(record, PASSWORD);
        const sloppy = recoveryKey.toLowerCase().replace(/-/g, ' ');
        const viaRecovery = await unlockWithRecoveryKey(record, sloppy);
        const payload = await encryptJson({ note: 'day 42' }, viaPassword);
        expect(await decryptJson(payload, viaRecovery)).toEqual({ note: 'day 42' });
    }, 30_000);

    it('keeps the data readable after a password change, without re-uploading', async () => {
        const { record } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const payload = await encryptJson({ note: 'day 9' }, key);

        const updated = await rewrapForPassword(record, key, 'a-brand-new-password');
        await expect(unlockWithPassword(updated, PASSWORD)).rejects.toMatchObject({ code: 'wrong_password' });
        const newKey = await unlockWithPassword(updated, 'a-brand-new-password');
        expect(await decryptJson(payload, newKey)).toEqual({ note: 'day 9' });
        // the old recovery key still works
        expect(updated.wrapped_recovery).toBe(record.wrapped_recovery);
    }, 60_000);

    it('can replace the recovery key', async () => {
        const { record, recoveryKey } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const { record: updated, recoveryKey: fresh } = await replaceRecoveryKey(record, key);
        expect(fresh).not.toBe(recoveryKey);
        await expect(unlockWithRecoveryKey(updated, recoveryKey)).rejects.toMatchObject({ code: 'wrong_recovery_key' });
        const viaFresh = await unlockWithRecoveryKey(updated, fresh);
        expect(await decryptJson(await encryptJson({ ok: true }, key), viaFresh)).toEqual({ ok: true });
    }, 60_000);

    it('encrypts and restores a photo byte for byte', async () => {
        const { record } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const original = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' });

        const sealed = await encryptBlob(original, key);
        expect(sealed.type).toBe('application/octet-stream');
        const sealedBytes = new Uint8Array(await sealed.arrayBuffer());
        expect(sealedBytes.slice(0, 4)).not.toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));   // no JPEG header left
        expect(sealed.size).toBeGreaterThan(original.size);                                       // iv + auth tag

        const back = await decryptBlob(sealed, key);
        expect(back.type).toBe('image/jpeg');
        expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
    }, 30_000);

    it('detects tampering and corrupt data', async () => {
        const { record } = await setup;
        const key = await unlockWithPassword(record, PASSWORD);
        const payload = await encryptJson({ days: 31 }, key);

        const flipped = { ...payload, ct: payload.ct.slice(0, -4) + (payload.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
        await expect(decryptJson(flipped, key)).rejects.toBeInstanceOf(CryptoError);
        await expect(decryptJson({ ...payload, v: 99 }, key)).rejects.toMatchObject({ code: 'unsupported' });
        await expect(decryptBlob(new Blob([new Uint8Array(4)]), key)).rejects.toMatchObject({ code: 'corrupt' });
    }, 30_000);

    it('a second account cannot read the first one\'s data', async () => {
        const { record } = await setup;
        const mine = await unlockWithPassword(record, PASSWORD);
        const other = await createKeyRecord('someone-elses-password');
        const theirs = await unlockWithPassword(other.record, 'someone-elses-password');
        const payload = await encryptJson({ secret: 'my grow' }, mine);
        await expect(decryptJson(payload, theirs)).rejects.toMatchObject({ code: 'corrupt' });
    }, 60_000);

    it('recognises plaintext rows from before encryption', () => {
        expect(isCiphertext({ id: 'g1', strain: 'Test' })).toBe(false);
        expect(isCiphertext(null)).toBe(false);
        expect(isCiphertext({ v: 1, iv: 'x', ct: 'y' })).toBe(true);
    });
});
