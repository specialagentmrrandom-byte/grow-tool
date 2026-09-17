/**
 * 🛡️ Cloudflare Turnstile — optional bot protection for sign-up, sign-in,
 * password reset and "resend confirmation".
 *
 * Switched on by setting VITE_TURNSTILE_SITE_KEY at build time *and* the secret
 * in Supabase (Authentication → Attack Protection). Two rules keep it from
 * locking people out of their own data:
 *
 *  1. The widget is only loaded when a form is actually opened.
 *  2. If it fails to load or times out, the form is still submitted. Supabase
 *     checks the token server-side — if it insists, it says so, and that is a
 *     server decision, not one made by a blocked third-party script.
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 8000;

interface Turnstile {
    render(el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; size?: string; theme?: string }): string;
    reset(id?: string): void;
    remove(id?: string): void;
}

declare global {
    interface Window { turnstile?: Turnstile }
}

export const captchaEnabled = (): boolean => Boolean(SITE_KEY);

let scriptPromise: Promise<Turnstile | null> | null = null;

function loadScript(): Promise<Turnstile | null> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(resolve => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.turnstile ?? null);
        script.onerror = () => resolve(null);          // blocked by an extension or a firewall
        document.head.appendChild(script);
        setTimeout(() => resolve(window.turnstile ?? null), TIMEOUT_MS);
    });
    return scriptPromise;
}

/**
 * A token for the given container, or undefined when Turnstile is off,
 * unreachable or slow. Never rejects — the caller always gets to submit.
 */
export async function getCaptchaToken(container: HTMLElement | null): Promise<string | undefined> {
    if (!SITE_KEY || !container) return undefined;
    const turnstile = await loadScript();
    if (!turnstile) return undefined;

    return new Promise<string | undefined>(resolve => {
        let done = false;
        const finish = (token?: string) => {
            if (done) return;
            done = true;
            resolve(token);
        };
        try {
            container.innerHTML = '';
            turnstile.render(container, {
                sitekey: SITE_KEY,
                size: 'flexible',
                theme: 'auto',
                callback: token => finish(token),
                'error-callback': () => finish(undefined),
            });
        } catch {
            finish(undefined);
        }
        setTimeout(() => finish(undefined), TIMEOUT_MS);
    });
}
