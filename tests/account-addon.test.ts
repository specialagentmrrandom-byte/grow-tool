import { describe, it, expect, vi } from 'vitest';
import { createAccountAddon, type AccountAddon, type AccountAddonHost } from '../src/accountAddon';
import type { SyncAccess } from '../src/sync/api';

/**
 * The contract between the account dialog and whatever add-on a build happens
 * to carry (see src/accountAddon.ts). A build with no `src/addons/` folder gets
 * null back and uses the dialog's own plain sections — so this file has to pass
 * either way, and it is what keeps the two builds honest.
 */
const host: AccountAddonHost = {
    escapeHtml: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    isBusy: () => false,
    withBusy: async (run) => { await run(); },
    rerender: () => { /* the dialog would redraw here */ },
    container: document.createElement('div'),
};

const ACCESS: SyncAccess = { sync_enabled: false, photo_quota_mb: 0, sync_consent_at: null };

const addon: AccountAddon | null = createAccountAddon(host);

describe('the account add-on hook', () => {
    it('either finds an add-on or says there is none — never anything else', () => {
        expect(addon === null || typeof addon === 'object').toBe(true);
    });

    it('builds a fresh one per dialog, so two dialogs cannot share state', () => {
        const second = createAccountAddon(host);
        if (addon === null) {
            expect(second).toBeNull();
        } else {
            expect(second).not.toBe(addon);
        }
    });
});

describe.runIf(addon)('whatever add-on this build carries', () => {
    const it_ = it;                                   // only runs when there is one
    const a = addon as AccountAddon;

    it_('answers every question the dialog asks it', () => {
        for (const method of [
            'renderSignInHint', 'renderStatusRows', 'renderNoSync', 'renderSection',
            'limitsAccounts', 'formatInput', 'clearInputOnRerender', 'handleAction', 'handleSubmit',
        ] as const) {
            expect(typeof a[method], method).toBe('function');
        }
    });

    it_('returns markup, never undefined, from the render calls', () => {
        expect(typeof a.renderSignInHint()).toBe('string');
        expect(typeof a.renderStatusRows(ACCESS)).toBe('string');
        expect(typeof a.renderNoSync(ACCESS)).toBe('string');
        expect(typeof a.renderSection()).toBe('string');
    });

    it_('answers the two yes/no questions with booleans', () => {
        expect(typeof a.limitsAccounts()).toBe('boolean');
        expect(typeof a.clearInputOnRerender()).toBe('boolean');
    });

    it_('hands actions and forms it does not own back to the dialog', async () => {
        await expect(a.handleAction('sign-out')).resolves.toBe(false);
        await expect(a.handleAction('delete-account')).resolves.toBe(false);

        const form = document.createElement('form');
        form.dataset.accountForm = 'unlock';
        await expect(a.handleSubmit(form)).resolves.toBe(false);
    });

    it_('keeps its fingers off inputs that are not its own', () => {
        const input = document.createElement('input');
        input.name = 'password';
        input.value = 'correct horse';
        expect(() => a.formatInput(input)).not.toThrow();
        expect(input.value).toBe('correct horse');
    });

    it_('escapes through the dialog rather than writing raw values into the page', () => {
        const nasty = { ...ACCESS, plan_name: '<img src=x onerror=alert(1)>' } as SyncAccess;
        const spy = vi.spyOn(host, 'escapeHtml');
        const markup = a.renderStatusRows(nasty);
        spy.mockRestore();

        expect(markup).not.toContain('<img src=x');
    });
});
