/**
 * Public build: the account screen has no extra sections.
 *
 * This app keeps accounts, end-to-end encrypted sync and the whole diary. The
 * account dialog asks this module whether it should render anything extra and
 * gets nothing back, so it renders the plain version.
 */
import type { Entitlement, PlanOption } from '../sync/api';

export const PREMIUM_BUILD = false;

export interface PremiumHost {
    escapeHtml(value: string): string;
    isBusy(): boolean;
    withBusy(run: () => Promise<void>): Promise<void>;
    rerender(): void;
    container: HTMLElement;
}

export class PremiumPanel {
    constructor(_host: PremiumHost) { /* nothing to set up */ }

    formatKeyInput(_input: HTMLInputElement): void { /* no key field in this build */ }

    takeClearInput(): boolean {
        return false;
    }

    renderSignInHint(): string {
        return '';
    }

    renderPerk(): string {
        return '';
    }

    /** No optional layer in this build, so sync simply comes with the account. */
    tiersActive(): boolean {
        return false;
    }

    /** Nothing to add under the account header in this build. */
    renderPlanStatus(_ent: Entitlement): string {
        return '';
    }

    /** An account that cannot sync just says so. */
    renderPlanOptions(_plans: PlanOption[], _ent: Entitlement): string {
        return `
        <div class="settings-section">
          <h4>☁️ Sync across devices</h4>
          <p class="form-hint">Sync isn't switched on for this account. Your diary keeps working on this device.</p>
        </div>`;
    }

    async handleAction(_action: string): Promise<boolean> {
        return false;
    }

    async handleSubmit(_form: HTMLFormElement): Promise<boolean> {
        return false;
    }
}
