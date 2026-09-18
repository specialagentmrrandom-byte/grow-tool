import { describe, it, expect } from 'vitest';
import { LOG_TYPE_META, entryTypeToLog, iconSvg, type LogType } from '../src/icons';
import type { EntryType } from '../src/types';

const LOG_TYPES = Object.keys(LOG_TYPE_META) as LogType[];
const ENTRY_TYPES: EntryType[] = ['note', 'milestone', 'issue', 'watering', 'feeding', 'reminder'];

describe('log-type icons', () => {
    it('draws every log type', () => {
        for (const type of LOG_TYPES) {
            const svg = iconSvg(type);
            expect(svg, type).toMatch(/^<svg /);
            expect(svg, type).toContain('</svg>');
            expect(svg, type).not.toContain('undefined');
            expect(svg.length, type).toBeGreaterThan(120);          // has actual paths in it
        }
    });

    it('takes its colour from the parent, so both themes work', () => {
        const svg = iconSvg('water');
        expect(svg).toContain('stroke="currentColor"');
        expect(svg).toContain('fill="none"');
        expect(svg).not.toMatch(/#[0-9a-f]{3,6}/i);                 // no baked-in colour
    });

    it('is hidden from screen readers and sized on request', () => {
        expect(iconSvg('note')).toContain('aria-hidden="true"');
        expect(iconSvg('note', 32)).toContain('width="32" height="32"');
        expect(iconSvg('note')).toContain('width="18" height="18"');
    });

    it('labels every type and points it at a theme colour token', () => {
        for (const type of LOG_TYPES) {
            expect(LOG_TYPE_META[type].label, type).not.toBe('');
            expect(LOG_TYPE_META[type].colorVar, type).toMatch(/^--color-/);
        }
    });
});

describe('entryTypeToLog', () => {
    it('maps every diary entry type to an icon that exists', () => {
        for (const type of ENTRY_TYPES) {
            const log = entryTypeToLog(type);
            expect(LOG_TYPE_META[log], type).toBeDefined();
        }
    });

    it('keeps the obvious pairs', () => {
        expect(entryTypeToLog('watering')).toBe('water');
        expect(entryTypeToLog('feeding')).toBe('feed');
        expect(entryTypeToLog('milestone')).toBe('milestone');
        expect(entryTypeToLog('issue')).toBe('issue');
        expect(entryTypeToLog('reminder')).toBe('reminder');
    });

    it('falls back to the note icon for anything it does not know', () => {
        expect(entryTypeToLog('note')).toBe('note');
        expect(entryTypeToLog('something-new' as EntryType)).toBe('note');
    });
});
