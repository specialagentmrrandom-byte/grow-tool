/**
 * 🛡️ Strict validation for imported backup files.
 *
 * A backup is a plain .json file that can come from anywhere — a forum post, a
 * chat message, a stranger's USB stick. Before it becomes app data it is rebuilt
 * field by field here: unknown keys are dropped, every value is checked against
 * the type it must have, strings are clamped and stripped of control characters,
 * and photos must be plain image data URLs.
 *
 * This is the second line of defence. The first is that every component escapes
 * user text before it goes into HTML; the third is the Content-Security-Policy.
 */
import type { Entry, Grow, Plant, Settings, StoreData } from './types';

/** Keys that must never be copied from an imported object (prototype pollution). */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export const LIMITS = {
    grows: 500,
    entriesPerGrow: 5000,
    plantsPerGrow: 200,
    photosPerEntry: 24,
    strains: 500,
    shortText: 200,
    longText: 20_000,
    photoBytes: 2 * 1024 * 1024,
    tombstones: 5000,
} as const;

export interface ImportReport {
    data: StoreData | null;
    /** What was dropped or repaired, for the user and for tests. */
    warnings: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trims, removes control characters, clamps the length. Anything else becomes ''. */
function text(value: unknown, max: number): string {
    if (typeof value !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max).trim();
}

function num(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

/** ISO-ish date or date-time; anything else is dropped. */
function isoDate(value: unknown): string | undefined {
    const raw = text(value, 40);
    if (!raw || !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(raw)) return undefined;
    return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(value as string) ? value as T : fallback;

/** Only real image data URLs — no javascript:, no svg (scripts), no remote URLs. */
function photo(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return undefined;
    return value.length > LIMITS.photoBytes ? undefined : value.replace(/\s/g, '');
}

function idOrNew(value: unknown, prefix: string): string {
    const raw = text(value, 64).replace(/[^A-Za-z0-9_-]/g, '');
    return raw || `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function stringList(value: unknown, max: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, max).map(v => text(v, maxLength)).filter(Boolean);
}

/** id → ISO time maps used as sync tombstones. */
function tombstones(value: unknown): Record<string, string> | undefined {
    if (!isObject(value)) return undefined;
    const out: Record<string, string> = {};
    for (const [key, at] of Object.entries(value).slice(0, LIMITS.tombstones)) {
        if (FORBIDDEN.has(key)) continue;
        const id = text(key, 64).replace(/[^A-Za-z0-9_-]/g, '');
        const when = isoDate(at);
        if (id && when) out[id] = when;
    }
    return Object.keys(out).length ? out : undefined;
}

function plant(raw: unknown, warnings: string[]): Plant | null {
    if (!isObject(raw)) {
        warnings.push('skipped a plant that was not an object');
        return null;
    }
    const position = isObject(raw.position)
        ? { x: num(raw.position.x, 0, 100, 0), y: num(raw.position.y, 0, 100, 0) }
        : undefined;
    return {
        id: idOrNew(raw.id, 'plant'),
        potNumber: num(raw.potNumber, 0, 9999, 1),
        name: text(raw.name, LIMITS.shortText),
        strain: text(raw.strain, LIMITS.shortText),
        ...(raw.seedType !== undefined && { seedType: oneOf(raw.seedType, ['feminized', 'regular', 'experimental'] as const, 'feminized') }),
        ...(raw.notes !== undefined && { notes: text(raw.notes, LIMITS.longText) }),
        ...(raw.potLiters !== undefined && { potLiters: num(raw.potLiters, 0, 1000, 11) }),
        ...(position && { position }),
    };
}

function entry(raw: unknown, warnings: string[]): Entry | null {
    if (!isObject(raw)) {
        warnings.push('skipped an entry that was not an object');
        return null;
    }
    const date = isoDate(raw.date);
    if (!date) {
        warnings.push('skipped an entry without a usable date');
        return null;
    }
    const photos = Array.isArray(raw.photos)
        ? raw.photos.slice(0, LIMITS.photosPerEntry).map(photo).filter((p): p is string => Boolean(p))
        : [];
    const single = photo(raw.photo);
    const now = new Date().toISOString();

    return {
        id: idOrNew(raw.id, 'entry'),
        date,
        // day and phase are derived from the dates by the store, never trusted from a file
        day: num(raw.day, -365, 3650, 0),
        phase: oneOf(raw.phase, ['germination', 'seedling', 'veg', 'flower', 'flush', 'harvest', 'complete'] as const, 'veg'),
        type: oneOf(raw.type, ['note', 'milestone', 'issue', 'watering', 'feeding', 'reminder'] as const, 'note'),
        title: text(raw.title, LIMITS.shortText),
        ...(raw.content !== undefined && { content: text(raw.content, LIMITS.longText) }),
        ...(single && { photo: single }),
        ...(photos.length > 0 && { photos }),
        ...(Array.isArray(raw.photoIds) && { photoIds: stringList(raw.photoIds, LIMITS.photosPerEntry, 64) }),
        ...(Array.isArray(raw.tags) && { tags: stringList(raw.tags, 50, LIMITS.shortText) }),
        ...(Array.isArray(raw.plantIds) && { plantIds: stringList(raw.plantIds, LIMITS.plantsPerGrow, 64) }),
        ...(raw.dli !== undefined && { dli: num(raw.dli, 0, 200, 0) }),
        ...(raw.reminderBuffer !== undefined && { reminderBuffer: num(raw.reminderBuffer, 0, 30, 1) }),
        ...(bool(raw.reminderDismissed) !== undefined && { reminderDismissed: bool(raw.reminderDismissed) }),
        ...(bool(raw.reminderDone) !== undefined && { reminderDone: bool(raw.reminderDone) }),
        createdAt: isoDate(raw.createdAt) ?? now,
        updatedAt: isoDate(raw.updatedAt) ?? now,
    };
}

function grow(raw: unknown, warnings: string[]): Grow | null {
    if (!isObject(raw)) {
        warnings.push('skipped a grow that was not an object');
        return null;
    }
    const dates: Partial<Grow['dates']> & { germStart?: string } = {};
    if (isObject(raw.dates)) {
        for (const key of ['germStart', 'sprout', 'vegStart', 'flowerStart', 'flushStart', 'harvest'] as const) {
            const value = isoDate(raw.dates[key]);
            if (value) dates[key] = value;
        }
    }
    if (!dates.germStart) {
        warnings.push('skipped a grow without a germination date');
        return null;
    }
    const light = isObject(raw.light) ? raw.light : {};
    const tent = isObject(raw.tent) ? raw.tent : null;
    const now = new Date().toISOString();

    return {
        id: idOrNew(raw.id, 'grow'),
        name: text(raw.name, LIMITS.shortText),
        strain: text(raw.strain, LIMITS.shortText),
        plantCount: num(raw.plantCount, 0, LIMITS.plantsPerGrow, 1),
        plants: (Array.isArray(raw.plants) ? raw.plants : [])
            .slice(0, LIMITS.plantsPerGrow)
            .map(p => plant(p, warnings))
            .filter((p): p is Plant => p !== null),
        type: oneOf(raw.type, ['auto', 'photo'] as const, 'photo'),
        dates: { ...dates, germStart: dates.germStart },
        light: {
            ppfd: num(light.ppfd, 0, 5000, 500),
            vegHours: num(light.vegHours, 0, 24, 18),
            flowerHours: num(light.flowerHours, 0, 24, 12),
        },
        ...(tent && {
            tent: {
                width: num(tent.width, 10, 1000, 100),
                depth: num(tent.depth, 10, 1000, 100),
            },
        }),
        entries: (Array.isArray(raw.entries) ? raw.entries : [])
            .slice(0, LIMITS.entriesPerGrow)
            .map(e => entry(e, warnings))
            .filter((e): e is Entry => e !== null),
        ...(tombstones(raw.deletedEntries) && { deletedEntries: tombstones(raw.deletedEntries) }),
        createdAt: isoDate(raw.createdAt) ?? now,
        updatedAt: isoDate(raw.updatedAt) ?? now,
    };
}

function settings(raw: unknown, fallback: Settings): Settings {
    if (!isObject(raw)) return fallback;
    const light = isObject(raw.defaultLight) ? raw.defaultLight : {};
    return {
        strains: stringList(raw.strains, LIMITS.strains, LIMITS.shortText),
        defaultLight: {
            ppfd: num(light.ppfd, 0, 5000, fallback.defaultLight.ppfd),
            vegHours: num(light.vegHours, 0, 24, fallback.defaultLight.vegHours),
            flowerHours: num(light.flowerHours, 0, 24, fallback.defaultLight.flowerHours),
        },
        theme: oneOf(raw.theme, ['auto', 'dark', 'light'] as const, fallback.theme),
        ...(isoDate(raw.lastReminderCheck) && { lastReminderCheck: isoDate(raw.lastReminderCheck) }),
    };
}

/**
 * Rebuilds a backup file into store data, or returns null when it is not one.
 * Never throws — a hostile file is data, not a crash.
 */
export function sanitizeImport(raw: unknown, defaults: StoreData): ImportReport {
    const warnings: string[] = [];
    if (!isObject(raw) || !Array.isArray(raw.grows)) {
        return { data: null, warnings: ['this file is not a grow diary backup'] };
    }
    if (raw.grows.length > LIMITS.grows) warnings.push(`only the first ${LIMITS.grows} grows were imported`);

    const grows = raw.grows
        .slice(0, LIMITS.grows)
        .map(g => grow(g, warnings))
        .filter((g): g is Grow => g !== null);

    return {
        data: {
            grows,
            settings: settings(raw.settings, defaults.settings),
            version: num(raw.version, 0, 999, defaults.version),
            ...(tombstones(raw.deletedGrows) && { deletedGrows: tombstones(raw.deletedGrows) }),
        },
        warnings,
    };
}
