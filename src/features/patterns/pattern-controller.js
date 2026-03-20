/**
 * Module: features/patterns/pattern-controller
 * Purpose: Pattern lifecycle orchestration (create/load/save/rename/delete) and selection flow.
 */

import { normalizePatternBaseName } from './pattern-meta.js';

let deps = null;

export function configurePatternController(config) {
    deps = config;
}

export async function saveCurrentPattern() {
    if (!deps) throw new Error('Pattern controller not configured');

    const currentPatternFilename = deps.getCurrentPatternFilename();
    if (!currentPatternFilename) return;
    if (deps.isDemoMode() && deps.getCurrentPatternScope() === 'system') return;

    try {
        const editorCode = deps.getEditorCode();
        const fileCode = deps.editorToFile(editorCode);
        await deps.savePatternSource(currentPatternFilename, fileCode, deps.getDeveloperModeHeaders());
    } catch (e) {
        deps.logError(e);
    }
}

export async function createNewPattern(name) {
    if (!deps) throw new Error('Pattern controller not configured');

    const normalizedBase = normalizePatternBaseName(name);
    if (!normalizedBase) {
        deps.setStatus('Invalid name. Use letters, numbers, spaces, hyphens, or underscores.', 'error');
        return;
    }
    if (normalizedBase !== String(name).trim()) {
        deps.setStatus(`Using normalized name: ${normalizedBase}`, 'normal');
    }
    const filename = `${normalizedBase}.js`;
    if (deps.getPatternEntry(filename)) {
        deps.setStatus('A pattern with that name already exists', 'error');
        return;
    }

    try {
        const payload = await deps.listPatterns();
        const files = deps.normalizePatternEntries(payload).map((entry) => entry.filename);
        if (files.includes(filename)) {
            deps.setStatus('A pattern with that name already exists', 'error');
            return;
        }
    } catch (e) {
        deps.logError(e);
        deps.setStatus('Error checking pattern names', 'error');
        return;
    }

    deps.setStatus('Creating...');
    const template = `import { stack, note } from "@strudel/core";

export const bpm = 120;

    export const pattern = note("c3 e3 g3").s("demo-kickdrum");
`;

    try {
        await deps.savePatternSource(filename, template);
        deps.closeModal();
        await deps.refreshPatternList();
        await loadPattern(filename);
    } catch (e) {
        deps.logError(e);
        deps.setStatus('Error creating pattern', 'error');
    }
}

export async function loadPattern(filename) {
    if (!deps) throw new Error('Pattern controller not configured');

    deps.clearPatternTimers();

    try {
        let fileCode = '';
        const loadedPatternScope = deps.normalizeScope(deps.getPatternEntry(filename)?.scope);

        if (deps.isDemoMode()) {
            fileCode = deps.getDemoPatternSource(filename);
            if (typeof fileCode !== 'string') throw new Error('Pattern not available in demo bundle');
        } else {
            fileCode = await deps.getPatternSource(filename);
        }

        let editorCode = deps.fileToEditor(fileCode);

        const unsavedCode = deps.getUnsavedPatternCode(filename);
        if (unsavedCode) {
            editorCode = unsavedCode;
            deps.setStatus('⚠️ Recovered unsaved changes from cache', 'error');
            setTimeout(() => {
                deps.saveCurrentPattern().catch(() => {});
                deps.clearUnsavedPatternCode(filename);
            }, 500);
        }

        deps.setCurrentPatternSelection(filename, loadedPatternScope);
        deps.showEditor();
        deps.refreshArrangementListActiveState();
        deps.renderArrangementWorkspace();

        const displayName = decodeURIComponent(filename.replace('.js', ''));
        deps.setPatternDisplayNames(displayName, displayName);
        deps.setPatternNameInputValue(displayName);
        deps.setPatternNameInputReadOnly(deps.isDemoMode() && loadedPatternScope === 'system');
        deps.setPatternNameInputPlaceholder('');
        deps.updateAdvancedSettingsButtonsVisibility();
        deps.refreshPatternListDomActiveState(filename);
        deps.updatePatternListVisualizer();

        deps.setEditorCodeWithHighlightSync(editorCode, filename, deps.getPlayingPatternFilename());
        deps.setExportControlsDisabled(false);
        deps.clearZzFXTrackPreviewData();
        deps.setStatus('');
        deps.renderPlayButton();
        await deps.loadPatternMeta(filename);
        deps.updateInstrumentUsage(editorCode);
        deps.updatePatternSelectionState(true);
        deps.setStatus('');
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Error loading ${filename}`, 'error');
    }
}

export async function renamePattern(options = {}) {
    if (!deps) throw new Error('Pattern controller not configured');
    const { quiet = false } = options;
    const currentPatternFilename = deps.getCurrentPatternFilename();
    if (!currentPatternFilename) return;
    if (deps.isDemoMode() && deps.getCurrentPatternScope() === 'system') {
        if (!quiet) deps.setStatus('System patterns are read-only in the hosted version.', 'normal');
        return;
    }

    const rawName = deps.getPatternNameInputValue().trim();
    const newName = normalizePatternBaseName(rawName);
    if (!newName) {
        if (!quiet) deps.setStatus('Invalid name. Use letters, numbers, spaces, hyphens, or underscores.', 'error');
        return;
    }
    if (deps.getPatternNameInputValue() !== newName) {
        deps.setPatternNameInputValue(newName);
    }
    if (newName === deps.getOriginalPatternName()) return;

    const newFilename = `${newName}.js`;
    const existingEntry = deps.getPatternEntry(newFilename);
    if (existingEntry && newFilename !== currentPatternFilename) {
        if (!quiet) deps.setStatus('A pattern with that name already exists', 'error');
        return;
    }

    try {
        const payload = await deps.listPatterns();
        const files = deps.normalizePatternEntries(payload).map((entry) => entry.filename);
        if (files.includes(newFilename) && newFilename !== currentPatternFilename) {
            if (!quiet) deps.setStatus('A pattern with that name already exists', 'error');
            return;
        }
    } catch (e) {
        deps.logError(e);
        if (!quiet) deps.setStatus('Error checking pattern names', 'error');
        return;
    }

    if (!quiet) deps.setStatus('Renaming...');
    try {
        await deps.renamePatternFile(currentPatternFilename, newFilename, deps.getDeveloperModeHeaders());
        const wasPlaying = deps.getPlayingPatternFilename() === currentPatternFilename;
        deps.setCurrentPatternFilename(newFilename);
        deps.setCurrentPatternDisplayName(newName);
        deps.setOriginalPatternName(newName);
        if (wasPlaying) deps.setPlayingPatternFilename(newFilename);
        deps.clearRenameDebounceTimeout();
        await deps.refreshPatternList();
        setTimeout(() => deps.setStatus('Pattern renamed', 'success'), 0);
    } catch (e) {
        deps.logError(e);
        deps.setStatus('Error renaming pattern', 'error');
        deps.setPatternNameInputValue(deps.getOriginalPatternName());
    }
}

export async function deletePattern(filename) {
    if (!deps) throw new Error('Pattern controller not configured');
    if (deps.normalizeScope(deps.getPatternEntry(filename)?.scope) === 'system' && !deps.isDeveloperModeEnabled()) {
        deps.setStatus('System patterns cannot be deleted. Enable developer mode to delete them.', 'normal');
        return;
    }
    deps.setStatus('Deleting...');
    try {
        await deps.deletePatternByFilename(filename, deps.getDeveloperModeHeaders());
        if (filename === deps.getPlayingPatternFilename()) {
            deps.stopEditorPlayback();
            deps.updatePlayState(false);
        }

        const wasCurrentPattern = filename === deps.getCurrentPatternFilename();
        if (wasCurrentPattern) deps.showWelcome();
        await deps.refreshPatternList();

        if (wasCurrentPattern) {
            setTimeout(() => deps.setStatus(''), 1500);
        } else {
            deps.setStatus('Deleted', 'success');
            setTimeout(() => deps.setStatus(''), 2000);
        }
    } catch (e) {
        deps.logError(e);
        deps.setStatus('Error deleting pattern', 'error');
    }
}
