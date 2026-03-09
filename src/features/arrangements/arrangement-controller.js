/**
 * Module: features/arrangements/arrangement-controller
 * Purpose: Arrangement lifecycle actions (create/load/rename/delete) and arrangement modal flows.
 * Deps keys: alphabetical.
 */

let deps = {
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120, name: 'Arrangement' }),
    clearArrangementAutoSaveTimeout: () => {},
    clearArrangementRenameDebounceTimeout: () => {},
    clearArrangementWorkspacePlayheadVisuals: () => {},
    cloneArrangementState: (value) => value,
    confirmDialog: async () => false,
    createArrangement: async () => {},
    deleteArrangementByFilename: async () => {},
    dispatchArrangementPreview: () => {},
    emitArrangementStateChanged: () => {},
    getArrangementEntriesCache: () => [],
    getArrangementEntry: () => null,
    getArrangementOrNull: async () => null,
    getArrangementPreviewPlayingFilename: () => null,
    getArrangementReadonly: () => false,
    getArrangementWorkspaceNameInput: () => null,
    getBlocksLibraryCache: () => [],
    getCurrentArrangementDraftState: () => null,
    getCurrentArrangementFilename: () => null,
    getCurrentArrangementScope: () => 'user',
    getDeveloperModeHeaders: () => ({}),
    getNewArrangementNameInput: () => null,
    getNewArrangementModal: () => null,
    getNextUntitledBlockName: () => 'Untitled-1',
    getSelectedBlockForArrangement: () => null,
    isDeveloperModeEnabled: () => false,
    isDemoMode: () => false,
    listArrangements: async () => [],
    listArrangementsOrEmpty: async () => [],
    logError: () => {},
    logWarn: () => {},
    moveSelectedBlockForArrangement: () => {},
    normalizePatternBaseName: (value) => String(value || '').trim(),
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    readUnsavedArrangementState: () => null,
    refreshArrangementList: async () => {},
    refreshArrangementListActiveState: () => {},
    refreshBlocksLibrary: async () => {},
    renameArrangementFile: async () => {},
    renderArrangementWorkspace: () => {},
    renderTrackerWorkspace: () => {},
    saveBlock: async () => null,
    saveCurrentArrangement: async () => {},
    scheduleArrangementAutoSave: () => {},
    scheduleArrangementPreviewPrime: () => {},
    setActiveArrangementBlockFilename: () => {},
    setArrangementDraftState: () => {},
    setArrangementPreviewPlayingFilename: () => {},
    setCurrentArrangementFilename: () => {},
    setCurrentArrangementScope: () => {},
    setSelectedBlockForArrangement: () => {},
    setStatus: () => {},
    setTrackerWorkspaceLoadedFilename: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    showArrangementWorkspace: () => {},
    showWelcome: () => {},
    stopAllPlaybackForSelectionChange: () => {},
    updateArrangementWorkspacePreviewButtonState: () => {},
};

export function configureArrangementController(options = {}) {
    deps = { ...deps, ...options };
}

function normalizeArrangementBaseName(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

function sanitizeArrangementBaseName(input) {
    return deps.normalizePatternBaseName(input) || 'arrangement';
}

export async function deleteArrangement(filename) {
    if (!filename || deps.isDemoMode()) return;
    const scope = deps.normalizeScope(deps.getArrangementEntry(filename)?.scope);
    if (scope === 'system' && !deps.isDeveloperModeEnabled()) {
        deps.setStatus('System arrangements cannot be deleted. Enable developer mode to delete them.', 'normal');
        return;
    }

    const displayName = decodeURIComponent(filename.replace(/\.js$/i, ''));
    const confirmed = await deps.confirmDialog({
        title: 'Delete Arrangement?',
        message: `Delete arrangement "${displayName}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
    });
    if (!confirmed) return;

    try {
        await deps.deleteArrangementByFilename(filename, deps.getDeveloperModeHeaders());
        if (deps.getCurrentArrangementFilename() === filename) {
            deps.setCurrentArrangementFilename(null);
            deps.setCurrentArrangementScope('user');
            deps.setArrangementDraftState(null);
            deps.setActiveArrangementBlockFilename(null);
            deps.showWelcome();
        }
        await deps.refreshArrangementList();
        await deps.refreshBlocksLibrary();
        deps.setStatus('Arrangement deleted', 'success');
    } catch (err) {
        deps.logError('[Arrangements] Delete failed:', err);
        deps.setStatus('Failed to delete arrangement', 'error');
    }
}

export async function createNewArrangement(name) {
    if (deps.isDemoMode()) {
        deps.setStatus('Demo mode: creating arrangements is disabled', 'normal');
        return;
    }

    const normalizedBase = normalizeArrangementBaseName(name);
    if (!normalizedBase) {
        deps.setStatus('Invalid arrangement name', 'error');
        return;
    }

    try {
        const existing = await deps.listArrangementsOrEmpty();
        const existingFilenames = new Set((existing || []).map((item) => String(item?.filename || '').toLowerCase()));
        const baseSlug = normalizedBase;
        let slug = baseSlug;
        let suffix = 1;
        while (existingFilenames.has(`${slug}.js`.toLowerCase())) {
            suffix += 1;
            slug = `${baseSlug}-${suffix}`;
        }
        const filename = `${slug}.js`;

        let initialBlockFilename = null;
        try {
            const steps = 16;
            const grid = [Array(steps).fill(null)];
            grid[0][0] = 'c4';
            grid[0][4] = 'c4';
            grid[0][8] = 'c4';
            const emptyRow = Array(steps).fill(null);
            const trackerState = {
                version: 1,
                channels: 1,
                steps,
                bpm: 120,
                grid,
                vol: [emptyRow.slice()],
                reps: [emptyRow.slice()],
                nd: [emptyRow.slice()],
                channelInstruments: ['hh-closed'],
            };
            const pattern = 'note("c4 ~ ~ ~ c4 ~ ~ ~ c4 ~ ~ ~ ~ ~ ~ ~").s("hh-closed")';
            await deps.refreshBlocksLibrary();
            const starterName = deps.getNextUntitledBlockName();
            const blockResult = await deps.saveBlock(starterName, '', pattern, trackerState, 'user');
            if (blockResult && blockResult.ok !== false && blockResult.block?.filename) {
                initialBlockFilename = blockResult.block.filename;
            }
        } catch (err) {
            deps.logWarn('[Arrangements] Failed to create starter block for new arrangement:', err);
        }

        const arrangementState = {
            version: 1,
            name: normalizedBase,
            bpm: 120,
            rows: [{
                repeats: 1,
                blocks: initialBlockFilename ? [initialBlockFilename] : [],
                loop: false,
            }],
        };

        await deps.createArrangement({ filename, name: normalizedBase, arrangementState, scope: 'user' });
        await deps.refreshArrangementList();
        await loadArrangement(filename);
        closeNewArrangementModal();

        if (initialBlockFilename) {
            deps.setActiveArrangementBlockFilename(initialBlockFilename);
            deps.setSelectedBlockForArrangement(filename, initialBlockFilename);
            await deps.refreshBlocksLibrary();
            deps.renderArrangementWorkspace();
            deps.renderTrackerWorkspace();
            const payload = deps.buildArrangementStatePayload();
            deps.stopAllPlaybackForSelectionChange();
            deps.dispatchArrangementPreview({
                arrangement: { name: deps.getCurrentArrangementDraftState()?.name, arrangementState: payload },
                filename,
            });
        }
    } catch (err) {
        deps.logError('[Arrangements] Create failed:', err);
        deps.setStatus('Failed to create arrangement', 'error');
    }
}

export function getNextUntitledBlockName() {
    let maxSuffix = 0;
    deps.getBlocksLibraryCache().forEach((block) => {
        const match = /^Untitled-(\d+)$/i.exec(String(block?.name || '').trim());
        if (!match) return;
        const suffix = parseInt(match[1], 10);
        if (Number.isFinite(suffix)) maxSuffix = Math.max(maxSuffix, suffix);
    });
    return `Untitled-${maxSuffix + 1}`;
}

export async function createUntitledBlock({ rowIndex = null } = {}) {
    if (deps.isDemoMode()) {
        deps.setStatus('Demo mode: creating blocks is disabled', 'normal');
        return null;
    }

    await deps.refreshBlocksLibrary();
    const name = getNextUntitledBlockName();
    const result = await deps.saveBlock(name, 'Created from arrangement workspace', 'silence', null, 'user');
    if (!result?.ok || !result?.block?.filename) {
        deps.setStatus('Failed to create block', 'error');
        return null;
    }

    const filename = result.block.filename;
    await deps.refreshBlocksLibrary();
    deps.setActiveArrangementBlockFilename(filename);
    deps.setTrackerWorkspaceLoadedFilename(null);

    if (Number.isInteger(rowIndex) && deps.getCurrentArrangementDraftState()?.rows?.[rowIndex]) {
        const row = deps.getCurrentArrangementDraftState().rows[rowIndex];
        if (!Array.isArray(row.blocks)) row.blocks = [];
        row.blocks.push(filename);
        deps.scheduleArrangementAutoSave();
        deps.emitArrangementStateChanged({ addedRowIndex: rowIndex, addedFilename: filename });
    }

    deps.renderArrangementWorkspace();
    deps.renderTrackerWorkspace();
    return filename;
}

export async function renameArrangement(options = {}) {
    const { quiet = false } = options;
    if (!deps.getCurrentArrangementFilename() || !deps.getCurrentArrangementDraftState()) return;
    if (deps.getArrangementReadonly()) return;

    const rawName = deps.getArrangementWorkspaceNameInput()?.value?.trim() || deps.getCurrentArrangementDraftState().name || '';
    const baseName = sanitizeArrangementBaseName(rawName);
    const newFilename = `${baseName}.js`;
    const oldFilename = deps.getCurrentArrangementFilename();
    if (newFilename === oldFilename) return;

    try {
        const list = await deps.listArrangements();
        const existing = (list || []).map((entry) => String(entry?.filename || '').toLowerCase());
        if (existing.includes(newFilename.toLowerCase()) && newFilename.toLowerCase() !== oldFilename.toLowerCase()) {
            if (!quiet) deps.setStatus('An arrangement with that name already exists', 'error');
            return;
        }
    } catch (err) {
        deps.logError(err);
        if (!quiet) deps.setStatus('Error checking arrangement names', 'error');
        return;
    }

    if (!quiet) deps.setStatus('Renaming...');
    try {
        await deps.saveCurrentArrangement();
        await deps.renameArrangementFile(oldFilename, newFilename, deps.getDeveloperModeHeaders());
        const wasPlaying = deps.getArrangementPreviewPlayingFilename() === oldFilename;
        deps.setCurrentArrangementFilename(newFilename);
        deps.setArrangementDraftState({
            ...deps.getCurrentArrangementDraftState(),
            name: baseName,
        });
        if (wasPlaying) deps.setArrangementPreviewPlayingFilename(newFilename);
        if (oldFilename && deps.getSelectedBlockForArrangement(oldFilename) != null) {
            deps.moveSelectedBlockForArrangement(oldFilename, newFilename);
        }
        deps.clearArrangementRenameDebounceTimeout();
        await deps.refreshArrangementList();
        const nameInput = deps.getArrangementWorkspaceNameInput();
        if (nameInput) nameInput.value = baseName;
        deps.setStatus('Arrangement renamed', 'success');
        if (!quiet) deps.setStatus('Renamed successfully', 'success');
    } catch (err) {
        deps.logError(err);
        if (!quiet) deps.setStatus('Error renaming arrangement', 'error');
    }
}

export async function loadArrangement(filename) {
    if (!filename) return;
    deps.clearArrangementAutoSaveTimeout();
    const isSwitching = deps.getCurrentArrangementFilename() !== null && deps.getCurrentArrangementFilename() !== filename;
    if (isSwitching) deps.clearArrangementWorkspacePlayheadVisuals();

    try {
        const loadedScope = deps.isDemoMode() ? 'system' : deps.normalizeScope(deps.getArrangementEntry(filename)?.scope);
        const detail = deps.isDemoMode() ? null : await deps.getArrangementOrNull(filename);
        let arrangementState = deps.cloneArrangementState(detail?.arrangementState || {
            name: decodeURIComponent(filename.replace(/\.js$/i, '')),
            bpm: 120,
            rows: [{ repeats: 1, blocks: [], loop: false }],
        });
        const recoveredArrangementState = deps.readUnsavedArrangementState(filename, loadedScope);
        const recoveredFromCache = Boolean(recoveredArrangementState);
        if (recoveredArrangementState) {
            arrangementState = recoveredArrangementState;
            deps.setStatus('⚠️ Recovered unsaved arrangement from cache', 'error');
        }

        deps.setCurrentArrangementFilename(filename);
        deps.setCurrentArrangementScope(loadedScope);
        deps.setArrangementDraftState(arrangementState);
        deps.setArrangementDraftState({
            ...deps.getCurrentArrangementDraftState(),
            name: (filename || '').replace(/\.js$/i, ''),
            rows: Array.isArray(deps.getCurrentArrangementDraftState()?.rows)
                ? deps.getCurrentArrangementDraftState().rows.map((row) => ({ ...row, loop: false }))
                : [],
        });

        const savedBlock = deps.getSelectedBlockForArrangement(filename);
        const blockInArrangement = savedBlock && (arrangementState.rows || []).some((row) => Array.isArray(row?.blocks) && row.blocks.includes(savedBlock));
        deps.setActiveArrangementBlockFilename(blockInArrangement ? savedBlock : null);

        deps.refreshArrangementListActiveState();
        await deps.refreshBlocksLibrary();
        deps.renderArrangementWorkspace();
        deps.updateArrangementWorkspacePreviewButtonState();
        deps.showArrangementWorkspace();
        deps.scheduleArrangementPreviewPrime(filename);
        if (recoveredFromCache) {
            deps.setTimeout(() => {
                if (deps.getCurrentArrangementFilename() !== filename) return;
                deps.saveCurrentArrangement();
            }, 500);
        }
    } catch (err) {
        deps.logError('[Arrangements] Failed to load arrangement:', err);
        deps.setStatus('Failed to load arrangement', 'error');
    }
}

export function openNewArrangementModal() {
    if (deps.isDemoMode()) {
        deps.setStatus('Demo mode: creating arrangements is disabled', 'normal');
        return;
    }
    const suggested = `arrangement-${deps.getArrangementEntriesCache().filter((entry) => deps.normalizeScope(entry.scope) === 'user').length + 1}`;
    const input = deps.getNewArrangementNameInput();
    if (input) input.value = suggested;
    deps.getNewArrangementModal()?.classList.add('open');
    input?.focus();
}

export function closeNewArrangementModal() {
    deps.getNewArrangementModal()?.classList.remove('open');
    const input = deps.getNewArrangementNameInput();
    if (input) input.value = '';
}
