/**
 * Module: features/settings/dev-mode
 * Purpose: Developer-mode state and UI visibility helpers.
 */

const DEVELOPER_MODE_KEY = 'zzfxtrack-developer-mode';

let isDemoMode = () => false;
let getDom = () => null;
let getCurrentPatternFilename = () => null;
let getCurrentArrangementFilename = () => null;

export function configureDevMode(options = {}) {
    if (typeof options.isDemoMode === 'function') {
        isDemoMode = options.isDemoMode;
    }
    if (typeof options.getDom === 'function') {
        getDom = options.getDom;
    }
    if (typeof options.getCurrentPatternFilename === 'function') {
        getCurrentPatternFilename = options.getCurrentPatternFilename;
    }
    if (typeof options.getCurrentArrangementFilename === 'function') {
        getCurrentArrangementFilename = options.getCurrentArrangementFilename;
    }
}

export function isDeveloperModeEnabled() {
    try {
        return localStorage.getItem(DEVELOPER_MODE_KEY) === '1';
    } catch (_e) {
        return false;
    }
}

export function setDeveloperModeEnabled(enabled) {
    try {
        localStorage.setItem(DEVELOPER_MODE_KEY, enabled ? '1' : '0');
    } catch (_e) {
        // Ignore localStorage failures.
    }
    document.dispatchEvent(new CustomEvent('developer-mode:changed', { detail: { enabled: Boolean(enabled) } }));
}

export function getDeveloperModeHeaders() {
    return isDeveloperModeEnabled() ? { 'X-Developer-Mode': '1' } : {};
}

export function updateAdvancedSettingsButtonsVisibility() {
    const dom = getDom();
    if (!dom) return;
    if (dom.openPatternAdvancedSettingsBtn) {
        const shouldShow = Boolean(getCurrentPatternFilename())
            && !dom.patternNameInput?.classList.contains('hidden');
        dom.openPatternAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
    }
    const arrangementWorkspaceSettingsBtn = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceAdvancedSettingsBtn');
    if (arrangementWorkspaceSettingsBtn) {
        const shouldShowArrangement = Boolean(getCurrentArrangementFilename());
        arrangementWorkspaceSettingsBtn.classList.toggle('dev-only-hidden', !shouldShowArrangement);
    }
}

export function updateDevModeToolbarLabelVisibility() {
    const dom = getDom();
    if (!dom?.devModeToolbarLabel) return;
    const show = isDeveloperModeEnabled();
    dom.devModeToolbarLabel.classList.toggle('hidden', !show);
}
