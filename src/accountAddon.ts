/**
 * 🔌 Optional add-ons for the account dialog.
 *
 * The dialog itself only knows about accounts, consent and encrypted sync. A
 * build may put extra sections in it — anything that has its own screens,
 * forms and server calls — by dropping a folder into `src/addons/`, exporting
 * `createAccountAddon()` from its `index.ts`.
 *
 * Nothing imports those folders by name: the glob below picks up whatever is
 * there and yields an empty list when the folder isn't, so a build without
 * add-ons compiles and behaves like an app that never had them. Everything the
 * dialog asks an add-on for has a plain answer built into the dialog for that
 * case.
 */
import type { SyncAccess } from './sync/api';

/** What an add-on may use from the dialog around it. */
export interface AccountAddonHost {
    escapeHtml(value: string): string;
    isBusy(): boolean;
    /** Runs the step with the dialog's busy flag and re-renders afterwards. */
    withBusy(run: () => Promise<void>): Promise<void>;
    rerender(): void;
    container: HTMLElement;
}

export interface AccountAddon {
    /** One line on the sign-in screen. */
    renderSignInHint(): string;
    /** Extra rows inside the account header card. */
    renderStatusRows(access: SyncAccess): string;
    /** Replaces the dialog's own "this account cannot sync" section. */
    renderNoSync(access: SyncAccess): string;
    /** An extra section at the bottom of the account screen. */
    renderSection(): string;
    /** True when the add-on decides who may sync (the consent text then says less). */
    limitsAccounts(): boolean;
    /** Called for every keystroke in the dialog, for the add-on's own fields. */
    formatInput(input: HTMLInputElement): void;
    /** True when the add-on's field should not keep its text through a re-render. */
    clearInputOnRerender(): boolean;
    /** Return true once the action was handled; false lets the dialog try. */
    handleAction(action: string): Promise<boolean>;
    /** Return true once the form was handled; false lets the dialog try. */
    handleSubmit(form: HTMLFormElement): Promise<boolean>;
}

/** What an add-on's `index.ts` exports. */
export interface AccountAddonModule {
    createAccountAddon(host: AccountAddonHost): AccountAddon;
}

const addons = import.meta.glob<AccountAddonModule>('./addons/*/index.ts', { eager: true });

/** The add-on of this build, or null when it has none. */
export function createAccountAddon(host: AccountAddonHost): AccountAddon | null {
    for (const addon of Object.values(addons)) {
        if (typeof addon?.createAccountAddon === 'function') return addon.createAccountAddon(host);
    }
    return null;
}
