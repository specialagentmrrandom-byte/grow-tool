/**
 * Day axis helpers: calendar days as UTC keys (YYYY-MM-DD), one slot each.
 * Apps build their own day objects on top (entries, values …).
 */

export interface WheelDay {
    index: number;
    /** YYYY-MM-DD (UTC) */
    key: string;
    /** UTC midnight of that day */
    date: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateKey(date: Date | string): string {
    return typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

export function keyToDate(key: string): Date {
    return new Date(`${key.slice(0, 10)}T00:00:00Z`);
}

export function addDays(key: string, days: number): string {
    return dateKey(new Date(keyToDate(key).getTime() + days * DAY_MS));
}

export function daysBetweenKeys(a: string, b: string): number {
    return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / DAY_MS);
}

/** Today as a key; pass a date in tests. */
export function todayKey(now: Date = new Date()): string {
    return dateKey(now);
}

/**
 * One slot per day from `from` to `to` (inclusive, keys or dates).
 * `extend` adds app data to each day. Capped at `max` days (default 800).
 */
export function buildDays<D extends WheelDay = WheelDay>(
    from: string | Date,
    to: string | Date,
    extend?: (day: WheelDay) => Omit<D, keyof WheelDay>,
    max = 800,
): D[] {
    const start = dateKey(from);
    const count = Math.min(max, Math.max(1, daysBetweenKeys(start, dateKey(to)) + 1));
    const days: D[] = [];
    for (let i = 0; i < count; i++) {
        const key = addDays(start, i);
        const base: WheelDay = { index: i, key, date: keyToDate(key) };
        days.push({ ...base, ...(extend ? extend(base) : {}) } as D);
    }
    return days;
}

/** Slot of a key in a day list, or null. */
export function indexOfKey(days: WheelDay[], key: string): number | null {
    if (!days.length) return null;
    const i = daysBetweenKeys(days[0].key, key);
    return i >= 0 && i < days.length ? i : null;
}

/**
 * Contiguous runs of the same value, e.g. phases for the rim.
 * Days where `valueOf` returns null are left out (gaps on the rim).
 */
export function runs<D extends WheelDay, V>(days: D[], valueOf: (day: D) => V | null): { value: V; from: number; to: number }[] {
    const out: { value: V; from: number; to: number }[] = [];
    for (const d of days) {
        const v = valueOf(d);
        const last = out[out.length - 1];
        if (v === null || v === undefined) continue;
        if (last && last.value === v && last.to === d.index - 1) last.to = d.index;
        else out.push({ value: v, from: d.index, to: d.index });
    }
    return out;
}

/**
 * Clip an inclusive key range [from, to] to the day list → slot range, or null
 * when it lies outside. `to` null means "still running" (up to the last day).
 */
export function clipRange(days: WheelDay[], from: string, to: string | null): { from: number; to: number } | null {
    if (!days.length) return null;
    const first = days[0].key;
    const last = days[days.length - 1].key;
    const end = to ?? last;
    if (end < first || from > last) return null;
    return {
        from: Math.max(0, daysBetweenKeys(first, from)),
        to: Math.min(days.length - 1, daysBetweenKeys(first, end)),
    };
}
