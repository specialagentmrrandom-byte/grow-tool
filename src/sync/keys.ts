/**
 * 🎟️ Grow Keys & supporter claims — the pure, testable bits of the UI.
 *
 * A Grow Key looks like GROW-7K2F-M9QX-4HTP: 12 characters from an alphabet
 * without look-alikes (no 0/1/I/O). The server (public.normalize_grow_key)
 * accepts the same sloppy input, so this is only for friendly formatting and
 * an early "that can't be a key" hint — the server always has the last word.
 */

export const GROW_KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const KEY_LENGTH = 12;

/**
 * "grow-7k2f m9qx 4htp" → "7K2FM9QX4HTP" (may be incomplete while typing).
 * A leading "GROW" is always the prefix: key characters never contain an O.
 */
export function keyCharacters(input: string): string {
    let chars = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    while (chars.startsWith('GROW')) chars = chars.slice(4);
    return chars;
}

/** The 12 key characters if the input is a complete, well-formed key — else null. */
export function normalizeGrowKey(input: string): string | null {
    const chars = keyCharacters(input);
    if (chars.length !== KEY_LENGTH) return null;
    for (const c of chars) if (!GROW_KEY_ALPHABET.includes(c)) return null;
    return chars;
}

/** Pretty form for display: GROW-XXXX-XXXX-XXXX (partial input stays partial). */
export function formatGrowKey(input: string): string {
    const chars = keyCharacters(input).slice(0, KEY_LENGTH);
    const groups = chars.match(/.{1,4}/g) ?? [];
    return groups.length ? `GROW-${groups.join('-')}` : '';
}

/**
 * Feature flags from public.app_flags — the server reads them too, so this only
 * decides what to show. Anything unknown or unreachable counts as ON, so a
 * failed read never hides a working feature.
 */
export interface AppFlags {
    /** 🎟️ "Redeem a Grow Key" box */
    grow_keys: boolean;
    /** "paid with another email → transaction id" */
    supporter_claims: boolean;
    /** Premium upgrade cards and support links */
    plans: boolean;
    /** false = sync is free for every account (free_sync_photo_quota_mb of photos) */
    paid_tiers: boolean;
}

export const DEFAULT_FLAGS: AppFlags = {
    grow_keys: true,
    supporter_claims: true,
    plans: true,
    paid_tiers: true,
};

/** Rows of public.app_flags → flags, keeping the defaults for anything missing. */
export function parseFlags(rows: Array<{ key: string; enabled: boolean }> | null | undefined): AppFlags {
    const flags = { ...DEFAULT_FLAGS };
    for (const row of rows ?? []) {
        if (row.key in flags) flags[row.key as keyof AppFlags] = Boolean(row.enabled);
    }
    return flags;
}

/** Server result of rpc/redeem_grow_key and rpc/claim_supporter_payment. */
export type RedeemResult =
    | { ok: true; plan_id: string; plan_name: string; days: number; paid_until: string }
    | { ok: false; error: string };

/** Friendly text for every error code the two RPCs can return. */
export function redeemErrorMessage(code: string): string {
    switch (code) {
        case 'key_invalid': return "That key doesn't exist. Check for typos — keys never contain 0, 1, I or O.";
        case 'key_used_up': return 'This key has already been used.';
        case 'key_expired': return 'This key has expired.';
        case 'key_already_redeemed': return "You've already redeemed this key on your account.";
        case 'claim_not_found': return "We couldn't find an open payment with that ID. It can take a minute to arrive — or write to us and we'll sort it out.";
        case 'claim_already_yours': return 'This payment is already on your account. 🌱';
        case 'claim_already_used': return 'This payment was already added to another account. Write to us if that wasn\'t you.';
        case 'too_many_attempts': return 'Too many tries in a short time. Please wait an hour and try again.';
        case 'not_signed_in': return 'Please sign in first.';
        case 'feature_off': return 'This is switched off at the moment.';
        default: return 'Something went wrong. Please try again.';
    }
}

/** "+31 days of Premium" — grouped into months/years when it reads nicer. */
export function describeDays(days: number): string {
    if (days >= 360 && days % 365 <= 5) {
        const years = Math.round(days / 365);
        return years === 1 ? '1 year' : `${years} years`;
    }
    if (days >= 28 && days % 31 <= 2 && days < 360) {
        const months = Math.round(days / 31);
        return months === 1 ? '1 month' : `${months} months`;
    }
    return days === 1 ? '1 day' : `${days} days`;
}
