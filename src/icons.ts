/**
 * Shared inline-SVG icon set for log/entry types.
 *
 * Ported from the Grow Diary design concept. Icons stroke with `currentColor`,
 * so the parent element's `color` drives them — that keeps everything theme- and
 * dark-mode-aware (we never bake a hex into the SVG). Each log type also maps to
 * one of the app's existing color tokens so tints stay consistent with the
 * pastel-earthy palette.
 */

export type LogType =
    | 'water'
    | 'feed'
    | 'prune'
    | 'photo'
    | 'note'
    | 'measure'
    | 'milestone'
    | 'issue'
    | 'reminder';

import type { EntryType } from './types';

export interface LogTypeMeta {
    label: string;
    /** CSS custom property that colors the icon + tint for this type. */
    colorVar: string;
}

export const LOG_TYPE_META: Record<LogType, LogTypeMeta> = {
    water: { label: 'Water', colorVar: '--color-water' },
    feed: { label: 'Feed', colorVar: '--color-veg' },
    prune: { label: 'Prune', colorVar: '--color-danger' },
    photo: { label: 'Photo', colorVar: '--color-flower' },
    note: { label: 'Note', colorVar: '--color-text-muted' },
    measure: { label: 'Measure', colorVar: '--color-flush' },
    milestone: { label: 'Milestone', colorVar: '--color-harvest' },
    issue: { label: 'Issue', colorVar: '--color-danger' },
    reminder: { label: 'Reminder', colorVar: '--color-flush' },
};

const PATHS: Record<LogType, string> = {
    water: '<path d="M12 3.5c0 0 6 6.2 6 10.2a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z"/>',
    feed: '<path d="M9.5 3.2h5"/><path d="M10 3.2v4.3l-3.1 9A2 2 0 0 0 8.8 19.2h6.4a2 2 0 0 0 1.9-2.7l-3.1-9V3.2"/><path d="M7.6 13.2h8.8"/>',
    prune: '<circle cx="6" cy="17.5" r="2.4"/><circle cx="6" cy="6.5" r="2.4"/><path d="M8 7.8 19 17"/><path d="M8 16.2 19 7"/>',
    photo: '<path d="M3.5 8.8A2 2 0 0 1 5.5 6.8h1.6l1.1-2h7.6l1.1 2h1.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.2"/>',
    note: '<path d="M4 20l1.2-4L16 5.2l2.8 2.8L8 18.8z"/><path d="M14 7.2l2.8 2.8"/>',
    measure: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7.2 8v3M11 8v4M14.8 8v3M18.6 8v4"/>',
    milestone: '<path d="M6 4v16"/><path d="M6 4.5h10l-2 3 2 3H6"/>',
    issue: '<path d="M12 4 3 19h18z"/><path d="M12 10v4"/><path d="M12 16.6v.2"/>',
    reminder: '<path d="M6 9a6 6 0 0 1 12 0v4l1.5 3H4.5L6 13z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
};

/** Render a log-type icon as an inline SVG string. Color comes from `currentColor`. */
export function iconSvg(type: LogType, size = 18): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[type]}</svg>`;
}

/** Map an app EntryType to the closest log-icon type. */
export function entryTypeToLog(type: EntryType): LogType {
    switch (type) {
        case 'watering': return 'water';
        case 'feeding': return 'feed';
        case 'milestone': return 'milestone';
        case 'issue': return 'issue';
        case 'reminder': return 'reminder';
        case 'note':
        default:
            return 'note';
    }
}
