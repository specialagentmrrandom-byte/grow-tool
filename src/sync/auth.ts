/**
 * Minimal Supabase Auth client over fetch (no SDK): sign up, sign in, refresh,
 * password reset, resend confirmation. Tokens are refreshed a minute before expiry.
 */
import { syncConfig } from './config';
import { sessionStore, type Session } from './session';

export class AuthError extends Error {
    constructor(message: string, public readonly code: string, public readonly status = 0) {
        super(message);
    }
}

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email: string };
}

type Listener = (session: Session | null) => void;

/** Supabase reads the captcha token from this envelope; omitted when there is none. */
const security = (captchaToken?: string) =>
    captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {};

/** Translate Supabase error responses into friendly, actionable messages. */
export function friendlyAuthError(status: number, body: { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string }): AuthError {
    const code = String(body.error_code ?? body.code ?? '');
    const raw = String(body.msg ?? body.message ?? body.error_description ?? '');
    const lower = raw.toLowerCase();

    if (code === 'email_not_confirmed' || lower.includes('not confirmed')) {
        return new AuthError('Please confirm your email first — check your inbox (and spam), or resend the link below.', 'email_not_confirmed', status);
    }
    if (code === 'invalid_credentials' || lower.includes('invalid login')) {
        return new AuthError('Email or password is wrong. Try again or reset your password.', 'invalid_credentials', status);
    }
    if (code === 'weak_password' || lower.includes('password should')) {
        return new AuthError('That password is too short — use at least 8 characters.', 'weak_password', status);
    }
    if (code === 'over_email_send_rate_limit' || status === 429) {
        return new AuthError('Too many attempts. Please wait a few minutes and try again.', 'rate_limited', status);
    }
    if (code === 'validation_failed' || lower.includes('invalid format')) {
        return new AuthError('That email address doesn’t look right.', 'invalid_email', status);
    }
    return new AuthError(raw || `Something went wrong (${status}). Please try again.`, code || 'unknown', status);
}

class AuthClient {
    private session: Session | null = null;
    private loaded = false;
    private listeners: Listener[] = [];
    private refreshing: Promise<Session | null> | null = null;

    private async request<T>(path: string, body: unknown): Promise<T> {
        let response: Response;
        try {
            response = await fetch(`${syncConfig.url}/auth/v1/${path}`, {
                method: 'POST',
                headers: { apikey: syncConfig.publishableKey, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            throw new AuthError('No connection. Check your internet and try again.', 'offline');
        }
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw friendlyAuthError(response.status, json);
        return json as T;
    }

    private async setSession(token: TokenResponse): Promise<Session> {
        const session: Session = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: Date.now() + token.expires_in * 1000,
            userId: token.user.id,
            email: token.user.email,
        };
        this.session = session;
        await sessionStore.set(session);
        this.emit();
        return session;
    }

    private emit(): void {
        this.listeners.forEach(l => l(this.session));
    }

    onChange(listener: Listener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    async getSession(): Promise<Session | null> {
        if (!this.loaded) {
            this.session = await sessionStore.get();
            this.loaded = true;
        }
        return this.session;
    }

    /** A valid access token, refreshed if it expires within a minute. Null when signed out. */
    async getAccessToken(): Promise<string | null> {
        const session = await this.getSession();
        if (!session) return null;
        if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
        const refreshed = await this.refresh();
        return refreshed?.accessToken ?? null;
    }

    private refresh(): Promise<Session | null> {
        if (this.refreshing) return this.refreshing;
        this.refreshing = (async () => {
            const current = this.session;
            if (!current) return null;
            try {
                const token = await this.request<TokenResponse>('token?grant_type=refresh_token', {
                    refresh_token: current.refreshToken,
                });
                return await this.setSession(token);
            } catch (e) {
                // Rejected refresh token → sign out cleanly; offline → keep session for later
                if (e instanceof AuthError && (e.status === 400 || e.status === 401)) await this.signOut();
                return null;
            } finally {
                this.refreshing = null;
            }
        })();
        return this.refreshing;
    }

    async signIn(email: string, password: string, captchaToken?: string): Promise<Session> {
        const token = await this.request<TokenResponse>('token?grant_type=password', { email, password, ...security(captchaToken) });
        return this.setSession(token);
    }

    /**
     * Returns 'signed-in' when email confirmation is off, 'confirm-email' when a
     * link was sent. Throws for an address that is already registered.
     */
    async signUp(email: string, password: string, captchaToken?: string): Promise<'signed-in' | 'confirm-email'> {
        const result = await this.request<Partial<TokenResponse> & { identities?: unknown[]; user?: { identities?: unknown[] } }>(
            'signup',
            { email, password, ...security(captchaToken) },
        );
        if (result.access_token && result.user) {
            await this.setSession(result as TokenResponse);
            return 'signed-in';
        }
        // Supabase answers like a new sign-up for existing addresses, but with no identities
        const identities = result.identities ?? result.user?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
            throw new AuthError('This email already has an account. Sign in instead, or reset your password.', 'already_registered');
        }
        return 'confirm-email';
    }

    async resendConfirmation(email: string, captchaToken?: string): Promise<void> {
        await this.request('resend', { type: 'signup', email, ...security(captchaToken) });
    }

    async resetPassword(email: string, captchaToken?: string): Promise<void> {
        await this.request('recover', { email, ...security(captchaToken) });
    }

    /**
     * Handle the redirect from a confirmation or password-reset email
     * (`#access_token=…&refresh_token=…&type=signup|recovery`). Returns the link
     * type when a session was taken over, and removes the tokens from the URL.
     */
    async consumeRedirect(): Promise<'signup' | 'recovery' | 'other' | null> {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash.includes('access_token=') && !hash.includes('error_description=')) return null;
        const params = new URLSearchParams(hash);
        history.replaceState(null, '', window.location.pathname + window.location.search);

        const error = params.get('error_description');
        if (error) throw new AuthError(error.replace(/\+/g, ' '), params.get('error_code') ?? 'link_error');

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (!accessToken || !refreshToken) return null;

        const response = await fetch(`${syncConfig.url}/auth/v1/user`, {
            headers: { apikey: syncConfig.publishableKey, Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new AuthError('This link has expired. Please request a new one.', 'link_expired', response.status);
        const user = await response.json() as { id: string; email: string };

        await this.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: Number(params.get('expires_in') ?? 3600),
            user,
        });
        const type = params.get('type');
        return type === 'signup' || type === 'recovery' ? type : 'other';
    }

    async updatePassword(password: string): Promise<void> {
        const token = await this.getAccessToken();
        if (!token) throw new AuthError('Please sign in again.', 'signed_out');
        const response = await fetch(`${syncConfig.url}/auth/v1/user`, {
            method: 'PUT',
            headers: { apikey: syncConfig.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        }).catch(() => null);
        if (!response) throw new AuthError('No connection. Check your internet and try again.', 'offline');
        if (!response.ok) throw friendlyAuthError(response.status, await response.json().catch(() => ({})));
    }

    async signOut(): Promise<void> {
        const token = this.session?.accessToken;
        this.session = null;
        this.loaded = true;
        await sessionStore.clear();
        this.emit();
        if (token) {
            fetch(`${syncConfig.url}/auth/v1/logout`, {
                method: 'POST',
                headers: { apikey: syncConfig.publishableKey, Authorization: `Bearer ${token}` },
            }).catch(() => { /* best effort */ });
        }
    }
}

export const auth = new AuthClient();
