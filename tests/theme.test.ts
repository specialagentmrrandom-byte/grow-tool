import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    applyTheme, getCurrentTheme, getPreferredTheme, getSystemTheme, initTheme, toggleTheme,
    watchStorageTheme, watchSystemTheme,
} from '../src/theme';

const THEME_KEY = 'og-grow-theme';

/** jsdom has no matchMedia — this stands in for the OS preference. */
function stubSystemTheme(light: boolean, listeners: Array<(e: MediaQueryListEvent) => void> = []) {
    const mql = {
        matches: light,
        addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listeners.push(fn); },
        removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
        },
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mql));
    return { listeners };
}

describe('theme', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.head.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('reads the system preference when nothing was chosen', () => {
        stubSystemTheme(true);
        expect(getSystemTheme()).toBe('light');
        expect(getPreferredTheme()).toBe('light');

        stubSystemTheme(false);
        expect(getPreferredTheme()).toBe('dark');
    });

    it('falls back to dark where matchMedia is missing', () => {
        vi.stubGlobal('matchMedia', undefined);
        expect(getSystemTheme()).toBe('dark');
        expect(getPreferredTheme()).toBe('dark');
    });

    it('prefers a stored choice over the system, and ignores a broken value', () => {
        stubSystemTheme(true);                       // system says light
        localStorage.setItem(THEME_KEY, 'dark');
        expect(getPreferredTheme()).toBe('dark');

        localStorage.setItem(THEME_KEY, 'neon');     // not a theme
        expect(getPreferredTheme()).toBe('light');
    });

    it('applies the theme to the document and tells the browser chrome', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);

        applyTheme('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(meta.getAttribute('content')).toBe('#f8f9fa');
        expect(getCurrentTheme()).toBe('light');

        applyTheme('dark');
        expect(meta.getAttribute('content')).toBe('#0a0a0a');
        expect(getCurrentTheme()).toBe('dark');
    });

    it('announces the change so other parts can follow', () => {
        const seen: string[] = [];
        window.addEventListener('themechange', (e) => seen.push((e as CustomEvent).detail.theme));
        applyTheme('light');
        applyTheme('dark');
        expect(seen).toEqual(['light', 'dark']);
    });

    it('applying a theme does not decide for the user', () => {
        applyTheme('light');
        expect(localStorage.getItem(THEME_KEY)).toBeNull();
    });

    it('toggling flips it and remembers the choice', () => {
        applyTheme('dark');
        expect(toggleTheme()).toBe('light');
        expect(localStorage.getItem(THEME_KEY)).toBe('light');
        expect(getCurrentTheme()).toBe('light');

        expect(toggleTheme()).toBe('dark');
        expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    });

    it('treats a document with no theme set as dark', () => {
        expect(getCurrentTheme()).toBe('dark');
    });

    it('starts up on the preferred theme', () => {
        stubSystemTheme(true);
        initTheme();
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    describe('watchers', () => {
        it('follows a theme change from another tab and stops when told', () => {
            const seen: string[] = [];
            const stop = watchStorageTheme(theme => seen.push(theme));

            window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'light' }));
            expect(seen).toEqual(['light']);
            expect(document.documentElement.getAttribute('data-theme')).toBe('light');

            // other keys and junk values are none of its business
            window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'dark' }));
            window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'neon' }));
            expect(seen).toEqual(['light']);

            stop();
            window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' }));
            expect(seen).toEqual(['light']);
        });

        it('follows the system switching to light and back', () => {
            const { listeners } = stubSystemTheme(false);
            const seen: string[] = [];
            const stop = watchSystemTheme(theme => seen.push(theme));
            expect(listeners).toHaveLength(1);

            listeners[0]({ matches: true } as MediaQueryListEvent);
            expect(seen).toEqual(['light']);
            expect(document.documentElement.getAttribute('data-theme')).toBe('light');

            listeners[0]({ matches: false } as MediaQueryListEvent);
            expect(seen).toEqual(['light', 'dark']);

            stop();
            expect(listeners).toHaveLength(0);
        });

        it('stays quiet where matchMedia is missing', () => {
            vi.stubGlobal('matchMedia', undefined);
            const stop = watchSystemTheme(() => { throw new Error('should not fire'); });
            expect(() => stop()).not.toThrow();
        });
    });
});
