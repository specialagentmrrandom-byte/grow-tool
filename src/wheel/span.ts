/**
 * The wheel's span: which stretch of days the circle shows.
 *
 *   { kind: 'last', months: 3 }                        rolling: the last 3 months up to today
 *   { kind: 'next', months: 6 }                        rolling: today and the next 6 months (plans, goals)
 *   { kind: 'range', from: '2026-03-01', to: '2026-05-31' }   fixed dates, inclusive
 *
 * Apps keep the span as a setting and turn it into a day range with
 * `spanRange()`; JournalWheel shows it under the circle and lets people change it.
 */
import { addDays, daysBetweenKeys, keyToDate, todayKey } from './model';

export type WheelSpan =
    | { kind: 'last'; months: number }
    | { kind: 'next'; months: number }
    | { kind: 'range'; from: string; to: string };

/** Presets offered in the picker, in months back from today. */
export const SPAN_PRESETS = [1, 3, 6, 12] as const;

/**
 * A preset in the picker: a number is "the last N months" (the default
 * presets), or any rolling span, e.g. `{ kind: 'next', months: 6 }`.
 */
export type SpanPreset = number | Extract<WheelSpan, { kind: 'last' | 'next' }>;

/** A preset as a span. */
export function presetSpan(p: SpanPreset): WheelSpan {
    return typeof p === 'number' ? { kind: 'last', months: p } : p;
}

/** Stable key of a rolling span for the picker: "3" (last 3 months) or "next:3". */
export function spanPresetKey(span: WheelSpan): string {
    return span.kind === 'next' ? `next:${span.months}` : span.kind === 'last' ? String(span.months) : `${span.from}/${span.to}`;
}

/** A picker key back into a span, or null. */
export function spanFromPresetKey(key: string): WheelSpan | null {
    const m = /^(?:(next):)?(\d+)$/.exec(key);
    if (!m) return null;
    const months = Number(m[2]);
    if (months < 1 || months > 12) return null;
    return { kind: m[1] === 'next' ? 'next' : 'last', months };
}

/** Longest span the wheel draws legibly (one slot per day). */
export const MAX_SPAN_DAYS = 366;

export const DEFAULT_SPAN: WheelSpan = { kind: 'last', months: 3 };

export interface SpanLabels {
    /** `{n}` is replaced by the number of months */
    lastMonths: string;
    lastMonth: string;
    lastYear: string;
    /** `{n}` is replaced by the number of months */
    nextMonths: string;
    nextMonth: string;
    nextYear: string;
    /** why a fixed range can't be shown */
    spanErrorDates: string;
    spanErrorOrder: string;
    spanErrorLong: string;
}

export const DEFAULT_SPAN_LABELS: SpanLabels = {
    lastMonths: 'Last {n} months',
    lastMonth: 'Last month',
    lastYear: 'Last year',
    nextMonths: 'Next {n} months',
    nextMonth: 'Next month',
    nextYear: 'Next year',
    spanErrorDates: 'Pick both dates.',
    spanErrorOrder: 'The end comes before the start.',
    spanErrorLong: 'At most one year at a time.',
};

/** German span names. */
export const SPAN_LABELS_DE: SpanLabels = {
    lastMonths: 'Letzte {n} Monate',
    lastMonth: 'Letzter Monat',
    lastYear: 'Letztes Jahr',
    nextMonths: 'Nächste {n} Monate',
    nextMonth: 'Nächster Monat',
    nextYear: 'Nächstes Jahr',
    spanErrorDates: 'Bitte beide Daten wählen.',
    spanErrorOrder: 'Das Ende liegt vor dem Anfang.',
    spanErrorLong: 'Höchstens ein Jahr auf einmal.',
};

const KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar months back or forth; the 31st becomes the month's last day. */
export function addMonths(key: string, months: number): string {
    const d = keyToDate(key);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
}

/** The inclusive day range a span covers. */
export function spanRange(span: WheelSpan, now: Date = new Date()): { from: string; to: string } {
    if (span.kind === 'range') return { from: span.from, to: span.to };
    if (span.kind === 'next') {
        const from = todayKey(now);
        return { from, to: addDays(addMonths(from, span.months), -1) };
    }
    const to = todayKey(now);
    return { from: addDays(addMonths(to, -span.months), 1), to };
}

/** Why a fixed range can't be shown, or null when it can. */
export function rangeError(from: string, to: string, labels: SpanLabels = DEFAULT_SPAN_LABELS): string | null {
    if (!KEY.test(from) || !KEY.test(to) || Number.isNaN(keyToDate(from).getTime()) || Number.isNaN(keyToDate(to).getTime())) return labels.spanErrorDates;
    if (to < from) return labels.spanErrorOrder;
    if (daysBetweenKeys(from, to) + 1 > MAX_SPAN_DAYS) return labels.spanErrorLong;
    return null;
}

/** A stored value back into a span; anything unusable gives the fallback. */
export function parseSpan(value: unknown, fallback: WheelSpan = DEFAULT_SPAN): WheelSpan {
    const v = value as Partial<{ kind: string; months: number; from: string; to: string }> | null;
    if ((v?.kind === 'last' || v?.kind === 'next') && typeof v.months === 'number' && v.months >= 1 && v.months <= 12) return { kind: v.kind, months: Math.round(v.months) };
    if (v?.kind === 'range' && typeof v.from === 'string' && typeof v.to === 'string' && !rangeError(v.from, v.to)) return { kind: 'range', from: v.from, to: v.to };
    return fallback;
}

export function sameSpan(a: WheelSpan, b: WheelSpan): boolean {
    if (a.kind === 'range') return b.kind === 'range' && a.from === b.from && a.to === b.to;
    return b.kind === a.kind && a.months === b.months;
}

/** "Last 3 months" / "Next 6 months" for rolling spans, the dates for fixed ones. */
export function spanName(span: WheelSpan, labels: SpanLabels = DEFAULT_SPAN_LABELS, locale?: string): string {
    if (span.kind === 'range') return spanDates(span, new Date(), locale);
    if (span.kind === 'next') {
        if (span.months === 1) return labels.nextMonth;
        if (span.months === 12) return labels.nextYear;
        return labels.nextMonths.replace('{n}', String(span.months));
    }
    if (span.months === 1) return labels.lastMonth;
    if (span.months === 12) return labels.lastYear;
    return labels.lastMonths.replace('{n}', String(span.months));
}

/** "Jun 25 – Sep 24" (the year is added when it isn't this year or the dates cross one). */
export function spanDates(span: WheelSpan, now: Date = new Date(), locale?: string): string {
    const { from, to } = spanRange(span, now);
    const a = keyToDate(from);
    const b = keyToDate(to);
    const year = now.getUTCFullYear();
    const withYear = a.getUTCFullYear() !== b.getUTCFullYear() || b.getUTCFullYear() !== year;
    const fmt = (d: Date, y: boolean) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    return `${fmt(a, withYear && a.getUTCFullYear() !== b.getUTCFullYear())} – ${fmt(b, withYear)}`;
}
