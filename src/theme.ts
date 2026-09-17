/**
 * Theme management utility
 * Handles light/dark mode switching with localStorage persistence
 */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'og-grow-theme';
const THEME_ATTR = 'data-theme';

/**
 * Get system theme preference
 */
export function getSystemTheme(): Theme {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}

/**
 * Get the user's preferred theme from localStorage or system preference
 */
export function getPreferredTheme(): Theme {
    // Check localStorage first (for compatibility with landing/help pages)
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }

    // Fall back to system preference
    return getSystemTheme();
}

/**
 * Apply theme to the document
 * Note: Does NOT save to localStorage - that should be done explicitly by the caller
 */
export function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute(THEME_ATTR, theme);

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'light' ? '#f8f9fa' : '#0a0a0a');
    }

    // Dispatch custom event for theme change
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/**
 * Toggle between light and dark theme
 */
export function toggleTheme(): Theme {
    const current = getCurrentTheme();
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    return next;
}

/**
 * Get the currently applied theme
 */
export function getCurrentTheme(): Theme {
    const attr = document.documentElement.getAttribute(THEME_ATTR);
    return attr === 'light' ? 'light' : 'dark';
}

/**
 * Initialize theme on app load
 */
export function initTheme(): void {
    const theme = getPreferredTheme();
    applyTheme(theme);
}

/**
 * Listen for localStorage changes from other tabs/windows
 */
export function watchStorageTheme(callback: (theme: Theme) => void): () => void {
    const handleStorage = (e: StorageEvent) => {
        if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
            applyTheme(e.newValue);
            callback(e.newValue);
        }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
}

/**
 * Listen for system theme changes
 */
export function watchSystemTheme(callback: (theme: Theme) => void): () => void {
    if (!window.matchMedia) return () => { };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const handleChange = (e: MediaQueryListEvent) => {
        const theme = e.matches ? 'light' : 'dark';
        applyTheme(theme);
        callback(theme);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }

    // Legacy support
    if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }

    return () => { };
}
