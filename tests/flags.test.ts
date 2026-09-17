import { describe, it, expect } from 'vitest';
import { parseFlags, flagOn, DEFAULT_FLAGS } from '../src/sync/flags';

describe('feature flags', () => {
    it('reads the switches the server sends', () => {
        expect(parseFlags([{ key: 'alpha', enabled: false }, { key: 'beta', enabled: true }]))
            .toEqual({ alpha: false, beta: true });
        expect(parseFlags([])).toEqual({});
        expect(parseFlags(null)).toEqual(DEFAULT_FLAGS);
        expect(parseFlags(undefined)).toEqual(DEFAULT_FLAGS);
    });

    it('takes anything else as a switch too, and ignores broken rows', () => {
        expect(parseFlags([
            { key: 'some_number_setting', enabled: true },
            { key: 'gamma', enabled: false },
            null as unknown as { key: string; enabled: boolean },
        ])).toEqual({ some_number_setting: true, gamma: false });
    });

    it('treats an unknown switch as on, so a failed read never hides a feature', () => {
        expect(flagOn(DEFAULT_FLAGS, 'never_heard_of_it')).toBe(true);
        expect(flagOn(parseFlags([]), 'alpha')).toBe(true);
        expect(flagOn(parseFlags([{ key: 'alpha', enabled: false }]), 'alpha')).toBe(false);
        expect(flagOn(parseFlags([{ key: 'alpha', enabled: true }]), 'alpha')).toBe(true);
    });
});
