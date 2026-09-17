/**
 * Switches the server hands out (public.app_flags): a plain key/value list the
 * app reads once at start and again on every sync. They only decide what the
 * interface offers — the server enforces the same switches itself.
 *
 * The keys are deliberately not spelled out here: whoever reads a switch names
 * it, and a switch the server never mentions counts as on, so an empty or
 * failed read can never hide a feature.
 */

export type AppFlags = Readonly<Record<string, boolean>>;

export const DEFAULT_FLAGS: AppFlags = {};

/** Rows of public.app_flags → a lookup table. */
export function parseFlags(rows: Array<{ key: string; enabled: boolean }> | null | undefined): AppFlags {
    const flags: Record<string, boolean> = {};
    for (const row of rows ?? []) {
        if (row && typeof row.key === 'string') flags[row.key] = Boolean(row.enabled);
    }
    return flags;
}

/** A switch is on unless the server explicitly turned it off. */
export function flagOn(flags: AppFlags, key: string): boolean {
    return flags[key] !== false;
}
