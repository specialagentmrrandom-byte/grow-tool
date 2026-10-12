/**
 * Data behind the grow disc ("Scheibe"): one slot per calendar day of the grow,
 * from germination to harvest, with the phase, the planned light and the
 * entries of each day. Pure functions — the GrowDisc component draws it with
 * the journal wheel (src/wheel).
 */
import type { Grow, Entry, Phase } from './types';
import { getPhase, getDaysSinceSprout, getLightHours, formatPhase } from './dli';

export type LaneId = 'light' | 'water' | 'journal';
export type DiscFocus = LaneId | 'phases';

export interface DiscDay {
    index: number;
    /** YYYY-MM-DD (UTC), same key the entries use */
    key: string;
    date: Date;
    /** days since sprout, what the grower calls "Day N" */
    day: number;
    phase: Phase;
    /** planned hours of light that day */
    lightHours: number;
    entries: Entry[];
}

export interface PhaseSpan {
    phase: Phase;
    label: string;
    from: number;
    to: number;
    /** "Day N" of the first and last slot */
    fromDay: number;
    toDay: number;
}

export interface DiscModel {
    days: DiscDay[];
    phases: PhaseSpan[];
    /** slot of today, or null when today is outside the grow */
    todayIndex: number | null;
    byKey: Map<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Without a harvest date the disc runs two weeks past today, like the old timeline. */
const LOOKAHEAD_DAYS = 14;
/** Upper bound so a broken date can't produce thousands of slots. */
const MAX_DAYS = 400;

export function dateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

function parseKey(key: string): Date {
    return new Date(`${key.slice(0, 10)}T00:00:00Z`);
}

export function buildDiscModel(grow: Grow, today: Date = new Date()): DiscModel {
    const start = parseKey(grow.dates.germStart);
    const todayKey = dateKey(today);
    const endKey = grow.dates.harvest
        ? grow.dates.harvest.slice(0, 10)
        : dateKey(new Date(parseKey(todayKey).getTime() + LOOKAHEAD_DAYS * DAY_MS));
    let count = Math.round((parseKey(endKey).getTime() - start.getTime()) / DAY_MS) + 1;
    count = Math.min(MAX_DAYS, Math.max(1, count));

    const entriesByKey = new Map<string, Entry[]>();
    for (const entry of grow.entries) {
        const key = entry.date.slice(0, 10);
        const list = entriesByKey.get(key);
        if (list) list.push(entry);
        else entriesByKey.set(key, [entry]);
    }

    const days: DiscDay[] = [];
    const byKey = new Map<string, number>();
    for (let i = 0; i < count; i++) {
        const date = new Date(start.getTime() + i * DAY_MS);
        const key = dateKey(date);
        const phase = getPhase(grow, date);
        days.push({
            index: i,
            key,
            date,
            day: getDaysSinceSprout(grow, date),
            phase,
            // seeds germinate in the dark; after harvest the lamp is off
            lightHours: phase === 'germination' || phase === 'harvest' || phase === 'complete' ? 0 : getLightHours(grow.light, phase),
            entries: entriesByKey.get(key) ?? [],
        });
        byKey.set(key, i);
    }

    const phases: PhaseSpan[] = [];
    for (const d of days) {
        const last = phases[phases.length - 1];
        if (last && last.phase === d.phase) {
            last.to = d.index;
            last.toDay = d.day;
        } else {
            phases.push({ phase: d.phase, label: formatPhase(d.phase), from: d.index, to: d.index, fromDay: d.day, toDay: d.day });
        }
    }

    return { days, phases, todayIndex: byKey.get(todayKey) ?? null, byKey };
}

/** Journal = everything that is not watering/feeding. */
export function isCareEntry(entry: Entry): boolean {
    return entry.type === 'watering' || entry.type === 'feeding';
}

export function hasPhoto(entry: Entry): boolean {
    return Boolean(entry.photoIds?.length || entry.photos?.length || entry.photo);
}

/** Most recent entry of a type on or before a slot, and how many days before it. */
export function lastBefore(model: DiscModel, index: number, type: Entry['type']): { entry: Entry; daysAgo: number } | null {
    for (let i = Math.min(index, model.days.length - 1); i >= 0; i--) {
        const found = model.days[i].entries.filter((e) => e.type === type);
        if (found.length) return { entry: found[found.length - 1], daysAgo: index - i };
    }
    return null;
}

export function countEntries(model: DiscModel, type: Entry['type'], untilIndex = model.days.length - 1): number {
    let n = 0;
    for (let i = 0; i <= untilIndex && i < model.days.length; i++) {
        n += model.days[i].entries.filter((e) => e.type === type).length;
    }
    return n;
}
