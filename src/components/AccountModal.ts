import { auth, AuthError } from '../sync/auth';
import { syncEngine, canUseSync, daysLeft, type SyncState } from '../sync/engine';
import { SyncHttpError, type Entitlement, type PlanOption } from '../sync/api';
import { describeDays, formatGrowKey, keyCharacters, normalizeGrowKey, redeemErrorMessage, type RedeemResult } from '../sync/keys';
import { CryptoError } from '../sync/crypto';
import { syncApi } from '../sync/api';
import { captchaEnabled, getCaptchaToken } from '../sync/captcha';
import { showError, showSuccess } from '../toast';

type View = 'sign-in' | 'sign-up' | 'reset' | 'new-password' | 'account';

const MIN_PASSWORD = 8;

/**
 * ☁️ Account, plan & sync modal. Renders into the shared #modal container;
 * closing (× / overlay) is handled by the modal host like every other modal.
 */
export class AccountModal {
    private container: HTMLElement;
    private view: View = 'sign-in';
    private email = '';
    private notice: { kind: 'info' | 'error'; text: string } | null = null;
    private showResend = false;
    private busy = false;
    private open = false;
    private userId: string | null = null;
    /** 🎟️ Grow Key / payment claim box in the account view */
    private perkMode: 'key' | 'claim' = 'key';
    private perkNotice: { kind: 'info' | 'error'; text: string } | null = null;
    private clearPerkInput = false;
    /** 🔐 how the user wants to open an encrypted cloud copy on this device */
    private unlockMode: 'password' | 'recovery' | 'fresh' = 'password';

    constructor(container: HTMLElement) {
        this.container = container;
        this.setupEvents();
        auth.onChange(session => { this.userId = session?.userId ?? null; });
        syncEngine.onState(() => {
            if (this.open && this.container.querySelector('.account-modal')) this.render();
        });
    }

    private setupEvents(): void {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // The modal host closes on × / overlay (for every modal) — just remember we're gone
            if (target.closest('.modal-close') || target.classList.contains('modal-overlay')) {
                this.open = false;
                return;
            }
            if (!target.closest('.account-modal')) return;
            const action = target.closest<HTMLElement>('[data-account-action]')?.dataset.accountAction;
            if (!action) return;
            e.preventDefault();
            void this.handleAction(action);
        });

        // GROW-XXXX-XXXX-XXXX formatting while typing (only when typing at the end, so the caret doesn't jump)
        this.container.addEventListener('input', (e) => {
            const input = e.target as HTMLInputElement;
            if (input.name !== 'grow-key' || !input.closest('.account-modal')) return;
            if (input.selectionStart !== input.value.length) return;
            const pretty = formatGrowKey(input.value);
            if (pretty !== input.value && keyCharacters(input.value).length > 0) input.value = pretty;
        });

        this.container.addEventListener('submit', (e) => {
            const form = (e.target as HTMLElement).closest<HTMLFormElement>('.account-modal form');
            if (!form) return;
            e.preventDefault();
            void this.handleSubmit(form);
        });
    }

    /** Open the modal; `view` forces a screen (e.g. after a password-reset link). */
    async show(view?: View): Promise<void> {
        this.open = true;
        const session = await auth.getSession();
        this.userId = session?.userId ?? null;
        this.view = view ?? (session ? 'account' : 'sign-in');
        this.notice = null;
        this.showResend = false;
        this.render();
        if (session && this.view === 'account') void syncEngine.syncNow();
    }

    private switchView(view: View): void {
        this.view = view;
        this.notice = null;
        this.showResend = false;
        this.render();
    }

    private async handleAction(action: string): Promise<void> {
        switch (action) {
            case 'to-sign-up': return this.switchView('sign-up');
            case 'to-sign-in': return this.switchView('sign-in');
            case 'to-reset': return this.switchView('reset');
            case 'toggle-password': {
                const input = this.container.querySelector<HTMLInputElement>('.account-modal input[name="password"]');
                if (input) input.type = input.type === 'password' ? 'text' : 'password';
                return;
            }
            case 'resend':
                return this.withBusy(async () => {
                    await auth.resendConfirmation(this.email, await getCaptchaToken(this.container.querySelector('#account-captcha')));
                    this.notice = { kind: 'info', text: `New confirmation link sent to ${this.email}.` };
                });
            case 'sync-now':
                return void syncEngine.syncNow();
            case 'unlock-password':
            case 'unlock-recovery':
            case 'unlock-fresh':
                this.unlockMode = action === 'unlock-password' ? 'password' : action === 'unlock-recovery' ? 'recovery' : 'fresh';
                this.notice = null;
                this.render();
                this.container.querySelector<HTMLInputElement>('.account-unlock input')?.focus();
                return;
            case 'recovery-copy': {
                const key = syncEngine.getState().recoveryKey;
                if (key) {
                    await navigator.clipboard.writeText(key).then(
                        () => showSuccess('Copied', 'Keep it somewhere safe — it is shown only once.'),
                        () => showError('Copy failed', 'Please write the key down by hand.'));
                }
                return;
            }
            case 'recovery-done':
                syncEngine.dismissRecoveryKey();
                this.render();
                return;
            case 'new-recovery-key':
                return this.withBusy(async () => {
                    await syncEngine.newRecoveryKey();
                    showSuccess('New recovery key', 'The old one no longer works.');
                });
            case 'delete-account': {
                const email = syncEngine.getState().email ?? '';
                if (!confirm(`Delete the account ${email} for good?\n\nYour diary stays on this device. The account, the cloud copy and its photos are deleted and cannot be restored.`)) return;
                return this.withBusy(async () => {
                    await syncApi.deleteAccount();
                    await auth.signOut();
                    showSuccess('Account deleted', 'Your diary is still here on this device.');
                    this.unlockMode = 'password';
                    this.switchView('sign-in');
                });
            }
            case 'perk-key':
            case 'perk-claim':
                this.perkMode = action === 'perk-key' ? 'key' : 'claim';
                this.perkNotice = null;
                this.render();
                this.container.querySelector<HTMLInputElement>('.account-perk input')?.focus();
                return;
            case 'consent': {
                const box = this.container.querySelector<HTMLInputElement>('#account-consent');
                if (!box?.checked) {
                    this.notice = { kind: 'error', text: 'Please tick the box to agree first.' };
                    return this.render();
                }
                return this.withBusy(async () => {
                    await syncEngine.giveConsent();
                    showSuccess('Sync is on', 'Your diary will now stay up to date on all your devices.');
                });
            }
            case 'delete-synced':
                if (!confirm('Delete all synced diaries and photos from the server and turn sync off?\n\nEverything on this device stays as it is.')) return;
                return this.withBusy(async () => {
                    await syncEngine.deleteSyncedData();
                    showSuccess('Synced data deleted', 'Your diaries are still on this device.');
                });
            case 'sign-out':
                await auth.signOut();
                showSuccess('Signed out', 'Your diary stays on this device.');
                return this.switchView('sign-in');
        }
    }

    private async handleSubmit(form: HTMLFormElement): Promise<void> {
        if (form.dataset.accountForm === 'perk') return this.handlePerk(form);
        if (form.dataset.accountForm === 'unlock') return this.handleUnlock(form);
        const data = new FormData(form);
        const email = String(data.get('email') ?? '').trim();
        const password = String(data.get('password') ?? '');
        if (email) this.email = email;

        // Optional bot protection; undefined when it is off or could not load
        const captcha = await getCaptchaToken(this.container.querySelector('#account-captcha'));

        await this.withBusy(async () => {
            if (this.view === 'sign-in') {
                await auth.signIn(email, password, captcha);
                showSuccess('Signed in', 'Welcome back!');
                this.view = 'account';
                await this.unlock(() => syncEngine.unlockWithPassword(password));
            } else if (this.view === 'sign-up') {
                if (password.length < MIN_PASSWORD) {
                    throw new AuthError(`Use at least ${MIN_PASSWORD} characters for your password.`, 'weak_password');
                }
                const result = await auth.signUp(email, password, captcha);
                if (result === 'signed-in') {
                    showSuccess('Free account created', 'You are signed in.');
                    this.view = 'account';
                    await this.unlock(() => syncEngine.unlockWithPassword(password));
                } else {
                    this.view = 'sign-in';
                    this.showResend = true;
                    this.notice = { kind: 'info', text: `Almost done — we sent a confirmation link to ${email}. Open it, then sign in here.` };
                }
            } else if (this.view === 'reset') {
                await auth.resetPassword(email, captcha);
                this.view = 'sign-in';
                this.notice = { kind: 'info', text: `If ${email} has an account, a reset link is on its way.` };
            } else if (this.view === 'new-password') {
                if (password.length < MIN_PASSWORD) {
                    throw new AuthError(`Use at least ${MIN_PASSWORD} characters for your password.`, 'weak_password');
                }
                await auth.updatePassword(password);
                showSuccess('Password changed', 'You are signed in.');
                this.view = 'account';
                // Same key, new wrapping — nothing has to be uploaded again.
                // Without the key on this device, the cloud copy stays locked until
                // the recovery key is entered (the 🔐 section explains it).
                const rewrapped = await syncEngine.rewrapAfterPasswordChange(password).catch(() => false);
                if (!rewrapped) this.unlockMode = 'recovery';
            }
        });
    }

    /** Runs an unlock step and turns crypto errors into a notice instead of a toast. */
    private async unlock(run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (e) {
            if (e instanceof CryptoError) {
                this.notice = { kind: 'error', text: e.message };
                this.unlockMode = e.code === 'wrong_password' ? 'recovery' : this.unlockMode;
            } else {
                this.notice = { kind: 'error', text: 'The cloud copy could not be opened. Please try again.' };
            }
        }
    }

    private async handleUnlock(form: HTMLFormElement): Promise<void> {
        const data = new FormData(form);
        const password = String(data.get('password') ?? '');
        const recovery = String(data.get('recovery-key') ?? '').trim();

        if (this.unlockMode !== 'recovery' && password.length < MIN_PASSWORD) {
            this.notice = { kind: 'error', text: `Passwords are at least ${MIN_PASSWORD} characters.` };
            return this.render();
        }
        if (this.unlockMode === 'recovery' && recovery.length < 20) {
            this.notice = { kind: 'error', text: 'A recovery key looks like RCVR-XXXXX-XXXXX-XXXXX-XXXXX.' };
            return this.render();
        }
        if (this.unlockMode === 'fresh'
            && !confirm('Delete the cloud copy and start again from this device?\n\nThe diary on this device stays exactly as it is. Anything that only exists in the cloud copy is lost.')) {
            return;
        }

        await this.withBusy(async () => {
            await this.unlock(async () => {
                if (this.unlockMode === 'password') await syncEngine.unlockWithPassword(password);
                else if (this.unlockMode === 'recovery') await syncEngine.unlockWithRecoveryKey(recovery);
                else await syncEngine.startFresh(password);
            });
            if (!this.notice) showSuccess('Unlocked', 'Your cloud copy is open on this device.');
        });
    }

    /** Redeem a Grow Key or claim a supporter payment. */
    private async handlePerk(form: HTMLFormElement): Promise<void> {
        const data = new FormData(form);
        const { grow_keys: keysOn, supporter_claims: claimsOn } = this.flags();
        const mode: 'key' | 'claim' = keysOn && (this.perkMode === 'key' || !claimsOn) ? 'key' : 'claim';
        if ((mode === 'key' && !keysOn) || (mode === 'claim' && !claimsOn)) return;
        const value = String(data.get(mode === 'key' ? 'grow-key' : 'reference') ?? '').trim();

        if (mode === 'key' && !normalizeGrowKey(value)) {
            this.perkNotice = { kind: 'error', text: 'A Grow Key has 12 characters, like GROW-7K2F-M9QX-4HTP.' };
            return this.render();
        }
        if (mode === 'claim' && value.length < 6) {
            this.perkNotice = { kind: 'error', text: 'Paste the transaction ID from your Ko-fi or Buy Me a Coffee receipt.' };
            return this.render();
        }

        if (this.busy) return;
        this.busy = true;
        this.perkNotice = null;
        this.render();
        try {
            const result: RedeemResult = mode === 'key'
                ? await syncEngine.redeemKey(normalizeGrowKey(value)!)
                : await syncEngine.claimPayment(value);
            if (result.ok) {
                const until = new Date(result.paid_until).toLocaleDateString();
                const added = `+${describeDays(result.days)} of ${result.plan_name}`;
                showSuccess(mode === 'key' ? '🎟️ Key redeemed' : '💚 Thanks for your support', `${added} — active until ${until}.`);
                this.perkNotice = { kind: 'info', text: `✨ ${added} added. Active until ${until}.` };
                this.clearPerkInput = true;
            } else {
                this.perkNotice = { kind: 'error', text: redeemErrorMessage(result.error) };
            }
        } catch (e) {
            this.perkNotice = {
                kind: 'error',
                text: e instanceof SyncHttpError && e.status === 0
                    ? "📴 You're offline — connect to the internet and try again."
                    : 'Something went wrong. Please try again.',
            };
        } finally {
            this.busy = false;
            if (this.open && this.container.querySelector('.account-modal')) this.render();
        }
    }

    private async withBusy(fn: () => Promise<void>): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        this.notice = null;
        this.render();
        try {
            await fn();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
            this.notice = { kind: 'error', text: message };
            this.showResend = e instanceof AuthError && e.code === 'email_not_confirmed';
            if (!(e instanceof AuthError)) showError('Account', message);
        } finally {
            this.busy = false;
            if (this.open && this.container.querySelector('.account-modal')) this.render();
        }
    }

    render(): void {
        // Sync status updates re-render the modal — keep whatever is typed into
        // the key / claim / unlock fields instead of wiping it mid-sentence
        const typed = this.container.querySelector<HTMLInputElement>('.account-perk input, .account-unlock input');
        const kept = typed && !this.clearPerkInput
            ? { name: typed.name, value: typed.value, focused: document.activeElement === typed }
            : null;

        this.clearPerkInput = false;

        const body = this.view === 'account' ? this.renderAccount(syncEngine.getState()) : this.renderAuthForm();
        this.container.innerHTML = `
      <div class="modal-overlay">
        <div class="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <header class="modal-header">
            <h3 id="account-title">☁️ Sync across devices</h3>
            <button class="modal-close icon-btn" aria-label="Close">×</button>
          </header>
          <div class="modal-body">
            ${this.notice ? `<p class="account-notice ${this.notice.kind}" role="${this.notice.kind === 'error' ? 'alert' : 'status'}">${this.escapeHtml(this.notice.text)}</p>` : ''}
            ${body}
          </div>
        </div>
      </div>`;
        if (kept) {
            const input = this.container.querySelector<HTMLInputElement>(`.account-perk input[name="${kept.name}"], .account-unlock input[name="${kept.name}"]`);
            if (input) {
                input.value = kept.value;
                if (kept.focused) input.focus();
            }
        }
        // Autofocus only on the sign-in style screens, not over the account overview (no surprise keyboard on phones)
        if (this.view === 'account') return;
        const firstInput = this.container.querySelector<HTMLInputElement>('.account-modal input:not([type="hidden"])');
        if (firstInput && !firstInput.value) firstInput.focus();
    }

    private renderAuthForm(): string {
        const disabled = this.busy ? 'disabled' : '';
        const email = this.escapeHtml(this.email);

        if (this.view === 'reset') {
            return `
        <form class="account-form" novalidate>
          <p class="modal-info">Enter your email and we'll send you a link to set a new password.</p>
          <div class="form-group">
            <label for="account-email">Email</label>
            <input id="account-email" name="email" type="email" autocomplete="username" required value="${email}">
          </div>
          ${captchaEnabled() ? '<div id="account-captcha" class="account-captcha"></div>' : ''}
          <button type="submit" class="btn-primary account-submit" ${disabled}>${this.busy ? 'Sending…' : '📧 Send reset link'}</button>
        </form>
        <div class="account-switch"><button class="link-btn" data-account-action="to-sign-in">← Back to sign in</button></div>`;
        }

        if (this.view === 'new-password') {
            return `
        <form class="account-form" novalidate>
          <p class="modal-info">Choose a new password for ${email || 'your account'}.</p>
          ${this.passwordField('new-password')}
          <button type="submit" class="btn-primary account-submit" ${disabled}>${this.busy ? 'Saving…' : '🔑 Save new password'}</button>
        </form>`;
        }

        const signUp = this.view === 'sign-up';
        const captchaSlot = captchaEnabled() ? '<div id="account-captcha" class="account-captcha"></div>' : '';
        return `
      <div class="account-pitch">
        ${signUp
            ? '<p><strong>Create your free account.</strong> It takes a few seconds and costs nothing. Plans with sync across devices can be added to it any time.</p>'
            : '<p><strong>Sign in to your account.</strong> Plans with sync keep your grows and photos on phone, tablet and computer.</p>'}
        <p class="form-hint">No account needed for the app itself — everything keeps working offline on this device.</p>
        ${this.flags().grow_keys || this.flags().supporter_claims
            ? '<p class="form-hint">🎟️ Got a Grow Key or supported us on Ko-fi / Buy Me a Coffee? Sign in or create a free account — you can add it right after.</p>'
            : ''}
      </div>
      <form class="account-form" novalidate>
        <div class="form-group">
          <label for="account-email">Email</label>
          <input id="account-email" name="email" type="email" autocomplete="username" required value="${email}">
        </div>
        ${this.passwordField(signUp ? 'new-password' : 'current-password')}
        ${captchaSlot}
        <button type="submit" class="btn-primary account-submit" ${disabled}>
          ${this.busy ? 'One moment…' : signUp ? '🌱 Create free account' : 'Sign in'}
        </button>
        ${signUp ? '' : '<button type="button" class="link-btn" data-account-action="to-reset">Forgot password?</button>'}
        ${this.showResend ? `<button type="button" class="link-btn" data-account-action="resend" ${disabled}>Resend confirmation email</button>` : ''}
      </form>
      <div class="account-switch">
        ${signUp
            ? 'Already have an account? <button class="link-btn" data-account-action="to-sign-in">Sign in</button>'
            : 'New here? <button class="link-btn" data-account-action="to-sign-up">Create a free account</button>'}
      </div>`;
    }

    private passwordField(autocomplete: 'current-password' | 'new-password'): string {
        const isNew = autocomplete === 'new-password';
        return `
      <div class="form-group">
        <label for="account-password">Password</label>
        <div class="account-password">
          <input id="account-password" name="password" type="password" autocomplete="${autocomplete}" required ${isNew ? `minlength="${MIN_PASSWORD}"` : ''}>
          <button type="button" class="icon-btn" data-account-action="toggle-password" aria-label="Show or hide password">👁️</button>
        </div>
        ${isNew ? `<span class="form-hint">At least ${MIN_PASSWORD} characters.</span>` : ''}
      </div>`;
    }

    private renderAccount(state: SyncState): string {
        const disabled = this.busy ? 'disabled' : '';
        const ent = state.entitlement;
        const hasSync = canUseSync(ent);

        const header = `
      <div class="account-card">
        <div class="account-row"><span class="account-label">Signed in as</span><strong>${this.escapeHtml(state.email ?? '')}</strong></div>
        <div class="account-row"><span class="account-label">Plan</span>
          <span class="account-badge ${hasSync && ent?.status !== 'free' ? 'premium' : ''}">${ent ? `${hasSync && ent.status !== 'free' ? '✨' : '🌱'} ${this.escapeHtml(ent.plan_name)}` : '…'}</span>
        </div>
        ${ent ? this.planStatusRows(ent) : ''}
      </div>`;

        let main = '';
        if (state.status === 'locked') {
            main = this.renderLocked();
        } else if (!ent) {
            main = `<p class="form-hint">${state.status === 'offline' ? '📴 Offline — your plan will show when you reconnect.' : 'Loading your plan…'}</p>`;
        } else if (!hasSync) {
            main = this.renderPlanOptions(state.plans, ent);
        } else if (!this.flags().paid_tiers && !ent.sync_consent_at) {
            main = `
        <div class="settings-section">
          <h4>🎁 Sync is free for everyone right now</h4>
          <p class="modal-info">Sync stores a copy of your grows — notes, dates, plants, reminders and compressed photos (up to ${ent.photo_quota_mb} MB) — on our server so your other devices can load it. Everything is <strong>encrypted on this device first</strong>, with a key only you hold, so we cannot read it. You can delete the synced copy and turn sync off at any time.</p>
          <label class="account-consent">
            <input type="checkbox" id="account-consent">
            <span>I agree that my grow diary and photos are stored on the server for syncing.</span>
          </label>
          <button class="btn-primary" data-account-action="consent" ${disabled}>☁️ Turn on sync</button>
        </div>`;
        } else if (!ent.sync_consent_at) {
            main = `
        <div class="settings-section">
          <h4>🔐 Before your diary leaves this device</h4>
          <p class="modal-info">Sync stores a copy of your grows — notes, dates, plants, reminders and compressed photos — on our server so your other devices can load it. Everything is <strong>encrypted on this device first</strong>, with a key only you hold, so we cannot read it. You can delete the synced copy and turn sync off at any time.</p>
          <label class="account-consent">
            <input type="checkbox" id="account-consent">
            <span>I agree that my grow diary and photos are stored on the server for syncing.</span>
          </label>
          <button class="btn-primary" data-account-action="consent" ${disabled}>☁️ Turn on sync</button>
        </div>`;
        } else {
            main = `
        <div class="settings-section">
          <h4>☁️ Sync</h4>
          <p class="account-sync-status ${state.status}">${this.statusText(state)}</p>
          ${state.error ? `<p class="account-notice error">${this.escapeHtml(state.error)}</p>` : ''}
          <div class="btn-group">
            <button class="btn-secondary" data-account-action="sync-now" ${state.status === 'syncing' ? 'disabled' : ''}>🔄 Sync now</button>
            <button class="btn-secondary" data-account-action="new-recovery-key" ${disabled}>🔑 New recovery key</button>
          </div>
          <p class="form-hint">🔐 End-to-end encrypted: your grows and photos are sealed on this device before upload. We cannot read them, and without your password or recovery key neither can anyone else.</p>
          <p class="form-hint">Changes sync automatically when you're online. Photos are uploaded in a smaller size (up to ${ent.photo_quota_mb} MB); the originals stay on this device.</p>
        </div>`;
        }

        return `
      ${this.renderRecoveryKey(state)}
      ${header}
      ${main}
      ${ent ? this.renderPerk() : ''}
      <div class="settings-section account-footer">
        <div class="btn-group">
          <button class="btn-secondary" data-account-action="sign-out">Sign out</button>
          ${ent?.sync_consent_at ? `<button class="btn-secondary account-danger" data-account-action="delete-synced" ${disabled}>🗑️ Delete synced data</button>` : ''}
        </div>
        <button class="link-btn account-danger" data-account-action="delete-account" ${disabled}>Delete my account permanently</button>
        <p class="form-hint">Your diary stays on this device — only the account and its cloud copy go.</p>
      </div>`;
    }

    private flags() {
        return syncEngine.getState().flags;
    }

    /** Shown once, right after the key was made: the only way back into the cloud copy. */
    private renderRecoveryKey(state: SyncState): string {
        if (!state.recoveryKey) return '';
        return `
      <div class="settings-section account-recovery">
        <h4>🔑 Your recovery key — write it down now</h4>
        <p class="modal-info">Your grows are encrypted on this device before they are uploaded, so nobody on our side can read them. If you ever forget your password, <strong>this key is the only way back into your cloud copy</strong>. It is shown this once.</p>
        <code class="recovery-code">${this.escapeHtml(state.recoveryKey)}</code>
        <div class="btn-group">
          <button class="btn-secondary" data-account-action="recovery-copy">📋 Copy</button>
          <button class="btn-primary" data-account-action="recovery-done">I wrote it down</button>
        </div>
        <p class="form-hint">Lost it? The diary on your devices is never affected — you can always start a fresh cloud copy.</p>
      </div>`;
    }

    /** The cloud copy is encrypted and this device has no key yet. */
    private renderLocked(): string {
        const disabled = this.busy ? 'disabled' : '';
        const mode = this.unlockMode;
        const field = mode === 'recovery'
            ? `<div class="form-group">
            <label for="account-recovery-key">Recovery key</label>
            <input id="account-recovery-key" name="recovery-key" type="text" autocomplete="off" spellcheck="false"
                   maxlength="40" placeholder="RCVR-XXXXX-XXXXX-XXXXX-XXXXX" class="account-key-input">
          </div>`
            : `<div class="form-group">
            <label for="account-unlock-password">${mode === 'fresh' ? 'Your current password' : 'Account password'}</label>
            <input id="account-unlock-password" name="password" type="password" autocomplete="current-password" required minlength="${MIN_PASSWORD}">
          </div>`;
        const intro = mode === 'recovery'
            ? 'Enter the recovery key you wrote down when you turned on sync.'
            : mode === 'fresh'
                ? 'This deletes the unreadable cloud copy and uploads this device\'s diary as the new one. Nothing on this device is touched.'
                : 'Your cloud copy is encrypted. Enter your password to open it on this device.';
        return `
      <div class="settings-section account-unlock">
        <h4>🔐 ${mode === 'fresh' ? 'Start a fresh cloud copy' : 'Unlock your cloud copy'}</h4>
        <p class="modal-info">${intro}</p>
        <form class="account-form" data-account-form="unlock" novalidate>
          ${field}
          <button type="submit" class="btn-primary account-submit" ${disabled}>
            ${this.busy ? 'One moment…' : mode === 'fresh' ? '🗑️ Replace the cloud copy' : '🔓 Unlock'}
          </button>
        </form>
        <div class="btn-group">
          ${mode !== 'password' ? '<button class="link-btn" data-account-action="unlock-password">Use my password</button>' : ''}
          ${mode !== 'recovery' ? '<button class="link-btn" data-account-action="unlock-recovery">I have a recovery key</button>' : ''}
          ${mode !== 'fresh' ? '<button class="link-btn account-danger" data-account-action="unlock-fresh">I have neither</button>' : ''}
        </div>
      </div>`;
    }

    /** 🎟️ Redeem a Grow Key, or claim a supporter payment made with another email. */
    private renderPerk(): string {
        const { grow_keys: keysOn, supporter_claims: claimsOn } = this.flags();
        if (!keysOn && !claimsOn) return '';           // both switched off in public.app_flags
        const disabled = this.busy ? 'disabled' : '';
        const isKey = keysOn && (this.perkMode === 'key' || !claimsOn);
        const notice = this.perkNotice
            ? `<p class="account-notice ${this.perkNotice.kind}" role="${this.perkNotice.kind === 'error' ? 'alert' : 'status'}">${this.escapeHtml(this.perkNotice.text)}</p>`
            : '';
        const field = isKey
            ? `<div class="form-group">
            <label for="account-grow-key">Grow Key</label>
            <input id="account-grow-key" name="grow-key" type="text" inputmode="text" autocomplete="off" autocapitalize="characters"
                   spellcheck="false" maxlength="24" placeholder="GROW-XXXX-XXXX-XXXX" class="account-key-input">
          </div>`
            : `<div class="form-group">
            <label for="account-reference">Transaction ID</label>
            <input id="account-reference" name="reference" type="text" autocomplete="off" spellcheck="false" maxlength="120"
                   placeholder="from your Ko-fi or Buy Me a Coffee receipt">
            <span class="form-hint">Only needed if you paid with a different email than <strong>${this.escapeHtml(syncEngine.getState().email ?? 'this account')}</strong> — payments with this email are added automatically.</span>
          </div>`;
        return `
      <div class="settings-section account-perk">
        <h4>${isKey ? '🎟️ Redeem a Grow Key' : '💚 Add a supporter payment'}</h4>
        <form class="account-form" data-account-form="perk" novalidate>
          ${field}
          ${notice}
          <button type="submit" class="btn-secondary account-submit" ${disabled}>
            ${this.busy ? 'One moment…' : isKey ? '🎟️ Redeem key' : '💚 Add payment'}
          </button>
        </form>
        ${keysOn && claimsOn ? `<button type="button" class="link-btn" data-account-action="${isKey ? 'perk-claim' : 'perk-key'}">
          ${isKey ? 'Supported on Ko-fi or Buy Me a Coffee with another email?' : '← I have a Grow Key instead'}
        </button>` : ''}
      </div>`;
    }

    /** Status lines under the plan, straight from the server's subscription data. */
    private planStatusRows(ent: Entitlement): string {
        const date = ent.current_period_end ? new Date(ent.current_period_end).toLocaleDateString() : null;
        const left = daysLeft(ent);
        const row = (label: string, value: string) =>
            `<div class="account-row"><span class="account-label">${label}</span><span>${value}</span></div>`;

        switch (ent.status) {
            case 'free':
                // free + sync = the paid tiers are switched off for everyone right now
                return row('Status', ent.sync_enabled ? 'Sync included, no plan needed' : 'Free account');
            case 'trialing':
                return row('Status', date ? `Trial until ${date}` : 'Trial');
            case 'active':
                if (!date) return row('Status', 'Active');
                // Time from Grow Keys and supporter payments doesn't renew by itself
                if (ent.provider === 'credit') {
                    return `${row('Active until', date)}${left !== null && left <= 7
                        ? `<p class="account-notice">⏳ ${left <= 0 ? 'Your time runs out today' : `${left} day${left === 1 ? '' : 's'} left`} — redeem a key or support again to keep syncing.</p>`
                        : ''}`;
                }
                return row(ent.cancel_at_period_end ? 'Ends on' : 'Renews on', date);
            case 'past_due':
                return `${row('Status', '⚠️ Payment overdue')}
          <p class="account-notice error">Your last payment didn't go through. Sync keeps working for a few days — please update your payment method${left !== null && left < 0 ? ' now' : ''}.</p>`;
            case 'canceled':
                return row('Ends on', date ?? '—');
            default:
                return row('Status', this.escapeHtml(ent.status));
        }
    }

    /** Upgrade options from public.plans — adding a plan row in the database adds a card here. */
    private renderPlanOptions(plans: PlanOption[], ent: Entitlement): string {
        if (!this.flags().plans) {
            return `
        <div class="settings-section">
          <h4>☁️ Sync across devices</h4>
          <p class="form-hint">Sync isn't open to new accounts at the moment. Your diary keeps working on this device.</p>
        </div>`;
        }
        const upgrades = plans.filter(p => p.sync_enabled && p.id !== ent.plan_id);
        if (upgrades.length === 0) {
            return `
        <div class="settings-section">
          <h4>✨ Sync across devices</h4>
          <p class="form-hint">Plans with sync are coming soon — your free account is ready for them.</p>
        </div>`;
        }
        const cards = upgrades.map(p => {
            const href = p.checkout_url ? this.checkoutLink(p.checkout_url) : null;
            return `
          <div class="plan-card">
            <div class="plan-card-head">
              <strong>✨ ${this.escapeHtml(p.name)}</strong>
              ${p.price_label ? `<span class="plan-price">${this.escapeHtml(p.price_label)}</span>` : ''}
            </div>
            ${p.description ? `<p class="plan-desc">${this.escapeHtml(p.description)}</p>` : ''}
            <ul class="account-benefits">
              <li>📱 Your grows on every device, always up to date</li>
              <li>📷 Photos included (compressed, up to ${p.photo_quota_mb >= 1000 ? `${Math.round(p.photo_quota_mb / 100) / 10} GB` : `${p.photo_quota_mb} MB`})</li>
              <li>🛟 Automatic backup if a phone gets lost</li>
            </ul>
            ${href
                ? `<a class="btn-primary account-cta" href="${this.escapeHtml(href)}" target="_blank" rel="noopener">Choose ${this.escapeHtml(p.name)}</a>`
                : '<p class="form-hint">Available soon.</p>'}
          </div>`;
        }).join('');
        return `
      <div class="settings-section">
        <h4>✨ Upgrade to sync across devices</h4>
        <div class="plan-list">${cards}</div>
        <p class="form-hint">💚 Supporting on Ko-fi or Buy Me a Coffee with <strong>${this.escapeHtml(syncEngine.getState().email ?? 'your account email')}</strong> adds the time automatically.</p>
        <p class="form-hint">Already paid? Activation can take a moment. <button class="link-btn" data-account-action="sync-now">Check again</button></p>
      </div>`;
    }

    /**
     * Checkout links may contain {email} and {user_id}; the payment provider passes
     * them back to the webhook so the payment lands on the right account.
     */
    private checkoutLink(template: string): string {
        const email = syncEngine.getState().email ?? '';
        return template
            .replace(/\{email\}/g, encodeURIComponent(email))
            .replace(/\{user_id\}/g, encodeURIComponent(this.userId ?? ''));
    }

    private statusText(state: SyncState): string {
        switch (state.status) {
            case 'syncing': return '🔄 Syncing…';
            case 'offline': return '📴 Offline — changes will sync when you reconnect.';
            case 'error': return '⚠️ Last sync failed — it will retry automatically.';
            default:
                return state.lastSyncedAt
                    ? `✅ Up to date · last synced ${new Date(state.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '✅ Ready';
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
