/**
 * Module: features/settings/theme-controller
 * Purpose: Initial app theme bootstrap and legacy theme-value migration.
 */

export const COLOR_THEME_KEY = 'zzfxtrack-color-theme';
export const USER_COLOR_THEME = 'user';
export const USER_THEME_VALUES_KEY = 'zzfxtrack-user-theme-values';
const ALLOWED_THEME_VALUES = new Set(['', 'jester', 'phantom', 'mono', 'milk', USER_COLOR_THEME]);

const THEME_VAR_NAMES = [
    'background', 'foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground',
    'secondary', 'secondary-foreground', 'tertiary', 'tertiary-foreground',
    'quaternary', 'quaternary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
    'border', 'input', 'ring', 'input-bg', 'radius',
];

function normalizeSavedTheme(saved) {
    if (saved === 'legacy' || saved === 'gotham' || saved === 'crusader') return 'jester';
    if (saved === 'romulan') return 'phantom';
    return ALLOWED_THEME_VALUES.has(saved || '') ? saved : 'phantom';
}

export function readStoredColorTheme() {
    try {
        const saved = localStorage.getItem(COLOR_THEME_KEY);
        if (saved === null) return null;
        return normalizeSavedTheme(saved);
    } catch (_e) {
        return null;
    }
}

export function writeStoredColorTheme(theme) {
    const normalized = normalizeSavedTheme(theme);
    try {
        localStorage.setItem(COLOR_THEME_KEY, normalized || '');
    } catch (_e) {
        // Ignore storage failures.
    }
    return normalized;
}

function sanitizeThemeValuesMap(values) {
    if (!values || typeof values !== 'object') return {};
    return Object.fromEntries(
        Object.entries(values)
            .filter(([name, value]) => THEME_VAR_NAMES.includes(name) && typeof value === 'string' && value.trim())
            .map(([name, value]) => [name, value.trim()])
    );
}

export function readStoredUserThemeValues() {
    try {
        const raw = localStorage.getItem(USER_THEME_VALUES_KEY);
        if (!raw) return {};
        return sanitizeThemeValuesMap(JSON.parse(raw));
    } catch (_e) {
        return {};
    }
}

export function writeStoredUserThemeValues(values) {
    try {
        const clean = sanitizeThemeValuesMap(values);
        if (Object.keys(clean).length === 0) {
            localStorage.removeItem(USER_THEME_VALUES_KEY);
            return;
        }
        localStorage.setItem(USER_THEME_VALUES_KEY, JSON.stringify(clean));
    } catch (_e) {
        // Ignore storage failures.
    }
}

export function clearStoredUserThemeValues() {
    try {
        localStorage.removeItem(USER_THEME_VALUES_KEY);
    } catch (_e) {
        // Ignore storage failures.
    }
}

export function clearAppliedThemeOverrides(root = document.documentElement) {
    THEME_VAR_NAMES.forEach((name) => {
        root.style.removeProperty(`--${name}`);
        root.style.removeProperty(`--color-${name}`);
    });
}

export function applyThemeValues(values, root = document.documentElement) {
    const clean = sanitizeThemeValuesMap(values);
    Object.entries(clean).forEach(([name, value]) => {
        root.style.setProperty(`--${name}`, value);
        root.style.setProperty(`--color-${name}`, value);
    });
}

export function applyStoredUserThemeValues(root = document.documentElement) {
    clearAppliedThemeOverrides(root);
    applyThemeValues(readStoredUserThemeValues(), root);
}

export function applyInitialColorTheme() {
    try {
        let saved = readStoredColorTheme();
        if (saved === null) {
            document.documentElement.setAttribute('data-theme', 'phantom');
            localStorage.setItem(COLOR_THEME_KEY, 'phantom');
        } else if (saved !== '') {
            document.documentElement.setAttribute('data-theme', saved);
            writeStoredColorTheme(saved);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        if (saved === USER_COLOR_THEME) applyStoredUserThemeValues();
        else clearAppliedThemeOverrides();
    } catch (_e) {
        // Ignore theme bootstrap failures.
    }
}
