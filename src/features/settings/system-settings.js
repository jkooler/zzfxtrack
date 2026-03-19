/**
 * Module: features/settings/system-settings
 * Purpose: System-settings modal, theme controls, and REPL theme synchronization.
 * Deps keys: alphabetical.
 */

import Coloris from '@melloware/coloris';
import {
    COLOR_THEME_KEY,
    USER_COLOR_THEME,
    applyStoredUserThemeValues,
    applyThemeValues,
    clearAppliedThemeOverrides,
    clearStoredUserThemeValues,
    readStoredUserThemeValues,
    writeStoredUserThemeValues,
} from './theme-controller.js';

let deps = {
    createIcons: () => {},
    getCodemirrorSettings: () => ({ get: () => ({ theme: 'strudelTheme' }), set: () => {} }),
    getDom: () => ({}),
    getIcons: () => ({}),
    getStrudelReplThemes: () => ({}),
    isDemoMode: () => false,
    isDeveloperModeEnabled: () => false,
    logWarning: () => {},
    alertDialog: async () => {},
    promptDialog: async () => null,
    refreshArrangementList: async () => {},
    refreshBlocksLibrary: async () => {},
    refreshInstrumentListUI: () => {},
    refreshPatternList: async () => {},
    setDeveloperModeEnabled: () => {},
    setPatternNameReadOnlyForDevMode: () => {},
    updateAdvancedSettingsButtonsVisibility: () => {},
    updateDevModeToolbarLabelVisibility: () => {},
    updateReplEditorTheme: () => {},
};

const THEME_COLOR_VARS_AND_TAILWIND = [
    'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'tertiary', 'tertiary-foreground', 'quaternary', 'quaternary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground',
    'destructive', 'destructive-foreground', 'border', 'input', 'ring', 'input-bg',
];

const TAILWIND_COLOR_VARS = [
    'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'tertiary', 'tertiary-foreground', 'quaternary', 'quaternary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground',
    'destructive', 'destructive-foreground', 'border', 'input', 'input-bg', 'ring',
];

const THEME_VAR_NAMES = [
    'background', 'foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground',
    'secondary', 'secondary-foreground', 'tertiary', 'tertiary-foreground',
    'quaternary', 'quaternary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
    'border', 'input', 'ring', 'input-bg', 'radius',
];

export function configureSystemSettings(options = {}) {
    deps = { ...deps, ...options };
}

function getCssVarAsRgbA(varName) {
    const fullName = varName.startsWith('--') ? varName : `--${varName}`;
    const el = document.createElement('div');
    el.style.color = `var(${fullName})`;
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    const css = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 1 };
    return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
        a: m[4] != null ? parseFloat(m[4]) : 1,
    };
}

function rgbToHslString(r, g, b, a = 1) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    const H = Math.round(h * 360);
    const S = Math.round(s * 100);
    const L = Math.round(l * 100);
    if (a < 1) return `hsl(${H} ${S}% ${L}% / ${a})`;
    return `hsl(${H} ${S}% ${L}%)`;
}

function getCssVarAsHsl(varName) {
    const { r, g, b, a } = getCssVarAsRgbA(varName);
    return rgbToHslString(r, g, b, a);
}

function syncThemeColorPickers() {
    const root = deps.getDom().systemSettingsModal;
    if (!root) return;
    root.querySelectorAll('input[data-theme-var]').forEach((input) => {
        const varName = input.getAttribute('data-theme-var');
        if (!varName) return;
        try {
            const hsl = getCssVarAsHsl(varName);
            input.value = hsl;
            const field = input.closest('.clr-field');
            if (field) field.style.color = hsl;
        } catch (_) {
            // Ignore picker sync failures.
        }
    });
}

function applyThemeColorOverride(varName, colorValue) {
    const key = varName.startsWith('--') ? varName.slice(2) : varName;
    if (getActiveColorTheme() !== USER_COLOR_THEME) {
        writeStoredUserThemeValues(captureCurrentThemeValues());
        setColorTheme(USER_COLOR_THEME);
    }
    applyThemeValues({ [key]: colorValue });
    writeStoredUserThemeValues(captureCurrentThemeValues());
}

function resetThemeToDefaults() {
    clearAppliedThemeOverrides();
    if (getActiveColorTheme() === USER_COLOR_THEME) {
        clearStoredUserThemeValues();
        applyStoredUserThemeValues();
    }
    syncThemeColorPickers();
}

function setAllThemeColorsToWhite() {
    const white = 'hsl(0 0% 100%)';
    if (getActiveColorTheme() !== USER_COLOR_THEME) {
        writeStoredUserThemeValues(captureCurrentThemeValues());
        setColorTheme(USER_COLOR_THEME);
    }
    const values = Object.fromEntries(THEME_COLOR_VARS_AND_TAILWIND.map((name) => [name, white]));
    applyThemeValues(values);
    writeStoredUserThemeValues(captureCurrentThemeValues());
    syncThemeColorPickers();
}

function getThemeVarFromStylesheet(varName, theme) {
    const prop = `--${varName}`;
    try {
        for (const sheet of document.styleSheets) {
            let rules;
            try {
                rules = sheet.cssRules || sheet.rules;
            } catch (_) {
                continue;
            }
            if (!rules) continue;
            const selectorsForTheme = theme ? [`html[data-theme="${theme}"]`] : ['html:root', ':root'];
            for (let i = rules.length - 1; i >= 0; i--) {
                const rule = rules[i];
                const sel = rule.selectorText?.trim().toLowerCase();
                if (!sel || !rule.style) continue;
                if (selectorsForTheme.some((s) => s.toLowerCase() === sel)) {
                    const val = rule.style.getPropertyValue(prop)?.trim();
                    if (val) return val;
                }
            }
        }
    } catch (_) {
        // Ignore stylesheet read failures.
    }
    return '';
}

function getActiveColorTheme() {
    return document.documentElement.getAttribute('data-theme') || '';
}

function captureCurrentThemeValues() {
    const computed = getComputedStyle(document.documentElement);
    return Object.fromEntries(
        THEME_VAR_NAMES
            .map((name) => [name, computed.getPropertyValue(`--${name}`).trim()])
            .filter(([, value]) => Boolean(value))
    );
}

function getThemeCssBlock() {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const theme = getActiveColorTheme();
    const lines = THEME_VAR_NAMES.map((name) => {
        const prop = `--${name}`;
        const inline = root.style.getPropertyValue(prop).trim();
        const fromComputed = computed.getPropertyValue(prop).trim();
        const fromSheet = getThemeVarFromStylesheet(name, theme);
        const value = inline || fromComputed || fromSheet;
        return value ? `  --${name}: ${value};` : null;
    }).filter(Boolean);
    const block = lines.join('\n');
    if (!block) return '';
    const selector = theme ? `html[data-theme="${theme}"]` : 'html:root';
    return `${selector} {\n${block}\n}`;
}

function setCopyButtonFeedback(message, resetAfterMs = 2000) {
    const btn = deps.getDom().systemSettingsThemeCopyBtn;
    if (!btn) return;
    const label = btn.textContent.trim();
    btn.textContent = message;
    setTimeout(() => { btn.textContent = label; }, resetAfterMs);
}

async function copyThemeToClipboard() {
    const block = getThemeCssBlock();
    if (!block) {
        setCopyButtonFeedback('Nothing to copy');
        return;
    }
    const fallbackCopy = () => {
        const ta = document.createElement('textarea');
        ta.value = block;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, block.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    };
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(block);
        } else if (!fallbackCopy()) {
            throw new Error('execCommand copy failed');
        }
        setCopyButtonFeedback('Copied!');
    } catch (err) {
        if (fallbackCopy()) setCopyButtonFeedback('Copied!');
        else {
            deps.logWarning('Copy failed:', err);
            setCopyButtonFeedback('Copy failed');
        }
    }
}

function setColorTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    try {
        localStorage.setItem(COLOR_THEME_KEY, theme || '');
    } catch (_e) {
        // Ignore storage failures.
    }
    if (theme === USER_COLOR_THEME) applyStoredUserThemeValues();
    else clearAppliedThemeOverrides();
    updateThemeOptionButtonsState();
    syncThemeColorPickers();
}

function getThemeOptionButtons() {
    return Array.from(document.querySelectorAll('.theme-option-btn'));
}

function updateThemeOptionButtonsState() {
    const active = getActiveColorTheme();
    getThemeOptionButtons().forEach((btn) => {
        if (!btn) return;
        const value = (btn.getAttribute('data-theme') || '').trim();
        const isActive = value === active;
        btn.classList.toggle('bg-primary', isActive);
        btn.classList.toggle('text-primary-foreground', isActive);
        btn.classList.toggle('text-muted-foreground', !isActive);
        btn.classList.toggle('hover:text-foreground', !isActive);
    });
}

function parseThemeImportText(text) {
    const parsed = {};
    if (!text) return parsed;
    const regex = /--([a-z-]+)\s*:\s*([^;]+);/gi;
    let match = regex.exec(text);
    while (match) {
        const name = String(match[1] || '').trim();
        const value = String(match[2] || '').trim();
        if (THEME_VAR_NAMES.includes(name) && value) parsed[name] = value;
        match = regex.exec(text);
    }
    return parsed;
}

async function importThemeFromText() {
    const pasted = await deps.promptDialog({
        title: 'Import Theme',
        message: 'Paste a copied theme block or CSS variable lines.',
        confirmLabel: 'Import',
        cancelLabel: 'Cancel',
        promptPlaceholder: 'html[data-theme="user"] {\n  --background: hsl(...);\n  --foreground: hsl(...);\n}',
        promptRows: 12,
    });
    if (pasted == null) return;
    const imported = parseThemeImportText(pasted);
    if (Object.keys(imported).length === 0) {
        await deps.alertDialog({
            title: 'No theme values found',
            message: 'Paste theme CSS like `--background: ...;` so the app can import it.',
        });
        return;
    }
    const next = {
        ...captureCurrentThemeValues(),
        ...readStoredUserThemeValues(),
        ...imported,
    };
    writeStoredUserThemeValues(next);
    setColorTheme(USER_COLOR_THEME);
}

function syncReplThemeSelect() {
    const dom = deps.getDom();
    const select = dom.systemSettingsReplThemeSelect;
    if (!select) return;
    const strudelReplThemes = deps.getStrudelReplThemes();
    if (select.options.length === 0) {
        Object.keys(strudelReplThemes).sort().forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }
    const current = deps.getCodemirrorSettings().get().theme;
    if (Object.prototype.hasOwnProperty.call(strudelReplThemes, current)) select.value = current;
    else select.value = 'strudelTheme';
}

export function scopeStrudelThemeVarsToRepl() {
    const styleEl = document.getElementById('strudel-theme-vars');
    if (styleEl?.textContent) {
        const content = styleEl.textContent.trim();
        if (content.startsWith(':root')) styleEl.textContent = content.replace(/^:root\b/, '.editor-pane');
    }
    document.documentElement.classList.add('dark');
}

function openSystemSettingsModal() {
    const dom = deps.getDom();
    if (!dom.systemSettingsModal) return;
    if (dom.systemSettingsDevModeToggle) {
        dom.systemSettingsDevModeToggle.checked = deps.isDeveloperModeEnabled();
        dom.systemSettingsDevModeToggle.disabled = deps.isDemoMode();
    }
    updateThemeOptionButtonsState();
    syncThemeColorPickers();
    syncReplThemeSelect();
    scopeStrudelThemeVarsToRepl();
    dom.systemSettingsModal?.querySelectorAll('details').forEach((el) => {
        el.open = false;
    });
    dom.systemSettingsModal.classList.add('open');
    deps.createIcons({ icons: deps.getIcons() });
}

function closeSystemSettingsModal() {
    deps.getDom().systemSettingsModal?.classList.remove('open');
}

export function installSystemSettingsHandlers() {
    const dom = deps.getDom();
    if (dom.openSystemSettingsModalBtn) dom.openSystemSettingsModalBtn.addEventListener('click', openSystemSettingsModal);
    if (dom.closeSystemSettingsModalBtn) dom.closeSystemSettingsModalBtn.addEventListener('click', closeSystemSettingsModal);
    if (dom.closeSystemSettingsModalBottomBtn) dom.closeSystemSettingsModalBottomBtn.addEventListener('click', closeSystemSettingsModal);
    if (dom.systemSettingsModal) {
        dom.systemSettingsModal.addEventListener('click', (e) => {
            if (e.target === dom.systemSettingsModal) closeSystemSettingsModal();
        });
        dom.systemSettingsModal.addEventListener('change', (e) => {
            const input = e.target;
            if (input && input.getAttribute('data-theme-var') && input.classList.contains('theme-color-input')) {
                applyThemeColorOverride(input.getAttribute('data-theme-var'), input.value);
            }
        });
        dom.systemSettingsModal.addEventListener('input', (e) => {
            const input = e.target;
            if (input && input.getAttribute('data-theme-var') && input.classList.contains('theme-color-input')) {
                applyThemeColorOverride(input.getAttribute('data-theme-var'), input.value);
            }
        });
    }
    if (dom.systemSettingsDevModeToggle) {
        dom.systemSettingsDevModeToggle.addEventListener('change', () => {
            deps.setDeveloperModeEnabled(Boolean(dom.systemSettingsDevModeToggle.checked));
        });
    }
    if (dom.systemSettingsThemeResetBtn) dom.systemSettingsThemeResetBtn.addEventListener('click', resetThemeToDefaults);
    if (dom.systemSettingsThemeCopyBtn) dom.systemSettingsThemeCopyBtn.addEventListener('click', () => { void copyThemeToClipboard(); });
    if (dom.systemSettingsThemeImportBtn) dom.systemSettingsThemeImportBtn.addEventListener('click', () => { void importThemeFromText(); });
    getThemeOptionButtons().forEach((btn) => {
        btn.addEventListener('click', () => {
            setColorTheme((btn.getAttribute('data-theme') || '').trim());
        });
    });
    if (dom.systemSettingsThemeWhiteDebugBtn) dom.systemSettingsThemeWhiteDebugBtn.addEventListener('click', setAllThemeColorsToWhite);
    if (dom.systemSettingsReplThemeSelect) {
        dom.systemSettingsReplThemeSelect.addEventListener('change', () => {
            const theme = dom.systemSettingsReplThemeSelect.value;
            const codemirrorSettings = deps.getCodemirrorSettings();
            const next = { ...codemirrorSettings.get(), theme };
            codemirrorSettings.set(next);
            deps.updateReplEditorTheme(theme);
            requestAnimationFrame(() => scopeStrudelThemeVarsToRepl());
        });
    }
    Coloris.init();
    Coloris({
        el: '#systemSettingsModal input[data-coloris]',
        themeMode: 'dark',
        format: 'hsl',
        alpha: true,
    });
    document.addEventListener('developer-mode:changed', () => {
        deps.setPatternNameReadOnlyForDevMode();
        deps.updateAdvancedSettingsButtonsVisibility();
        deps.updateDevModeToolbarLabelVisibility();
        void deps.refreshPatternList();
        void deps.refreshArrangementList?.();
        void deps.refreshBlocksLibrary?.();
        try {
            deps.refreshInstrumentListUI?.();
        } catch (_e) {
            // Ignore refresh failures.
        }
    });
}
