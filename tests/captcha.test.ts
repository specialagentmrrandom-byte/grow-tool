import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The captcha must never be the reason someone can't get to their own diary:
 * when it is switched off, unreachable, slow or broken, the form is submitted
 * anyway and the server decides. These tests pin that promise down.
 */
describe('captcha (switched off — the default build)', () => {
    it('reports itself as off and asks for nothing', async () => {
        const { captchaEnabled, getCaptchaToken } = await import('../src/sync/captcha');
        expect(captchaEnabled()).toBe(false);

        const container = document.createElement('div');
        await expect(getCaptchaToken(container)).resolves.toBeUndefined();
        expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
    });
});

describe('captcha (switched on)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
        document.head.innerHTML = '';
        delete (window as { turnstile?: unknown }).turnstile;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
        delete (window as { turnstile?: unknown }).turnstile;
    });

    it('reports itself as on', async () => {
        const { captchaEnabled } = await import('../src/sync/captcha');
        expect(captchaEnabled()).toBe(true);
    });

    it('hands back the token the widget produces', async () => {
        (window as { turnstile?: unknown }).turnstile = {
            render: (_el: HTMLElement, options: { callback: (t: string) => void }) => {
                options.callback('token-123');
                return 'widget-1';
            },
        };
        const { getCaptchaToken } = await import('../src/sync/captcha');
        await expect(getCaptchaToken(document.createElement('div'))).resolves.toBe('token-123');
    });

    it('lets the form through when the widget itself errors', async () => {
        (window as { turnstile?: unknown }).turnstile = {
            render: (_el: HTMLElement, options: { 'error-callback'?: () => void }) => {
                options['error-callback']?.();
                return 'widget-1';
            },
        };
        const { getCaptchaToken } = await import('../src/sync/captcha');
        await expect(getCaptchaToken(document.createElement('div'))).resolves.toBeUndefined();
    });

    it('lets the form through when rendering throws', async () => {
        (window as { turnstile?: unknown }).turnstile = {
            render: () => { throw new Error('widget exploded'); },
        };
        const { getCaptchaToken } = await import('../src/sync/captcha');
        await expect(getCaptchaToken(document.createElement('div'))).resolves.toBeUndefined();
    });

    it('lets the form through when the script is blocked', async () => {
        const { getCaptchaToken } = await import('../src/sync/captcha');
        const pending = getCaptchaToken(document.createElement('div'));

        const script = document.querySelector('script[src*="turnstile"]') as HTMLScriptElement;
        expect(script).not.toBeNull();                    // only loaded once a form needs it
        script.onerror?.(new Event('error'));

        await expect(pending).resolves.toBeUndefined();
    });

    it('gives up waiting rather than blocking the form forever', async () => {
        vi.useFakeTimers();
        const { getCaptchaToken } = await import('../src/sync/captcha');
        const pending = getCaptchaToken(document.createElement('div'));

        await vi.advanceTimersByTimeAsync(8000);          // script never answers
        await expect(pending).resolves.toBeUndefined();
    });

    it('does nothing without a place to put the widget', async () => {
        const { getCaptchaToken } = await import('../src/sync/captcha');
        await expect(getCaptchaToken(null)).resolves.toBeUndefined();
    });
});
