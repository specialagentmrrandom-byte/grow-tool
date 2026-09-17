import { describe, it, expect } from 'vitest';
import { describeDays, formatGrowKey, keyCharacters, normalizeGrowKey, redeemErrorMessage, parseFlags, DEFAULT_FLAGS, GROW_KEY_ALPHABET } from '../src/sync/keys';

describe('Grow Keys', () => {
    it('alphabet has 32 unambiguous characters', () => {
        expect(GROW_KEY_ALPHABET).toHaveLength(32);
        expect(GROW_KEY_ALPHABET).not.toMatch(/[01IO]/);
    });

    it('normalises sloppy input the same way the server does', () => {
        expect(normalizeGrowKey('GROW-7K2F-M9QX-4HTP')).toBe('7K2FM9QX4HTP');
        expect(normalizeGrowKey(' grow 7k2f m9qx 4htp ')).toBe('7K2FM9QX4HTP');
        expect(normalizeGrowKey('7k2f-m9qx-4htp')).toBe('7K2FM9QX4HTP');
    });

    it('rejects incomplete keys and look-alike characters', () => {
        expect(normalizeGrowKey('GROW-7K2F-M9QX')).toBeNull();
        expect(normalizeGrowKey('GROW-7K2F-M9QX-4HT0')).toBeNull();
        expect(normalizeGrowKey('GROW-7K2F-M9QX-4HTI')).toBeNull();
        expect(normalizeGrowKey('')).toBeNull();
    });

    it('formats while typing', () => {
        expect(formatGrowKey('7k2f')).toBe('GROW-7K2F');
        expect(formatGrowKey('7k2fm9')).toBe('GROW-7K2F-M9');
        expect(formatGrowKey('grow-7k2f-m9qx-4htp-extra')).toBe('GROW-7K2F-M9QX-4HTP');
        expect(formatGrowKey('---')).toBe('');
        expect(formatGrowKey('GROW-7K2F')).toBe('GROW-7K2F');
        expect(formatGrowKey('GROW-GROW7')).toBe('GROW-7');
        expect(keyCharacters('GROW')).toBe('');
    });

    it('has a message for every server error code', () => {
        for (const code of ['key_invalid', 'key_used_up', 'key_expired', 'key_already_redeemed', 'claim_not_found',
            'claim_already_yours', 'claim_already_used', 'too_many_attempts', 'not_signed_in', 'feature_off']) {
            expect(redeemErrorMessage(code)).not.toBe(redeemErrorMessage('???'));
        }
    });

    it('reads feature flags, treating anything missing as on', () => {
        expect(parseFlags([{ key: 'grow_keys', enabled: false }])).toEqual({ ...DEFAULT_FLAGS, grow_keys: false });
        expect(parseFlags([
            { key: 'paid_tiers', enabled: false },
            { key: 'plans', enabled: false },
            { key: 'free_sync_photo_quota_mb', enabled: true },   // not a UI flag, ignored here
            { key: 'something_new', enabled: false },
        ])).toEqual({ ...DEFAULT_FLAGS, paid_tiers: false, plans: false });
        expect(parseFlags([])).toEqual(DEFAULT_FLAGS);
        expect(parseFlags(null)).toEqual(DEFAULT_FLAGS);
        expect(Object.values(DEFAULT_FLAGS).every(Boolean)).toBe(true);
    });

    it('describes durations', () => {
        expect(describeDays(31)).toBe('1 month');
        expect(describeDays(62)).toBe('2 months');
        expect(describeDays(365)).toBe('1 year');
        expect(describeDays(14)).toBe('14 days');
        expect(describeDays(145)).toBe('145 days');
        expect(describeDays(1)).toBe('1 day');
    });
});
