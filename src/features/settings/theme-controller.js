/**
 * Module: features/settings/theme-controller
 * Purpose: Initial app theme bootstrap and legacy theme-value migration.
 */

export const COLOR_THEME_KEY = 'zzfxm-color-theme';

export function applyInitialColorTheme() {
    try {
        let saved = localStorage.getItem(COLOR_THEME_KEY);
        if (saved === 'legacy' || saved === 'gotham') {
            saved = 'jester';
            localStorage.setItem(COLOR_THEME_KEY, 'jester');
        }
        if (saved === 'crusader') {
            saved = 'jester';
            localStorage.setItem(COLOR_THEME_KEY, 'jester');
        }
        if (saved === 'romulan') {
            saved = 'phantom';
            localStorage.setItem(COLOR_THEME_KEY, 'phantom');
        }
        if (saved === null) {
            document.documentElement.setAttribute('data-theme', 'phantom');
            localStorage.setItem(COLOR_THEME_KEY, 'phantom');
        } else if (saved !== '') {
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    } catch (_e) {
        // Ignore theme bootstrap failures.
    }
}
