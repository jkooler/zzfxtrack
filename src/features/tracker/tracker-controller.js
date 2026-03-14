/**
 * Module: features/tracker/tracker-controller
 * Purpose: Tracker open/edit/save flows and tracker autosave orchestration.
 * Deps keys: alphabetical.
 */

import { syncTrackerPreviewReferenceContext } from './tracker-preview-sync.js';

let deps = {
    getAppState: () => ({}),
    getArrangementLiveEditSession: () => ({ active: false, committed: false }),
    getBlockByFilename: () => null,
    getBlockDetailOrNull: async () => null,
    getCurrentArrangementFilename: () => null,
    getDefragmentedInstruments: async () => [],
    getPendingTrackerSavePayload: () => null,
    getTrackerAutoSaveTimeout: () => null,
    isArrangementWorkspaceActive: () => false,
    isDemoMode: () => false,
    isDeveloperModeEnabled: () => false,
    logError: () => {},
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    openTracker: () => {},
    openTrackerForEdit: () => {},
    readUnsavedBlockTrackerState: () => null,
    refreshBlocksLibrary: async () => {},
    renderArrangementWorkspace: () => {},
    renderTrackerWorkspace: () => {},
    setActiveArrangementBlockFilename: () => {},
    setArrangementLiveEditSession: () => {},
    setPendingTrackerSavePayload: () => {},
    setSelectedBlockForArrangement: () => {},
    setStatus: () => {},
    setTrackerAutoSaveTimeout: () => {},
    updateBlock: async () => ({ ok: false }),
};

export function configureTrackerController(options = {}) {
    deps = { ...deps, ...options };
}

export function scheduleTrackerAutoSave({ filename, trackerState, name: nameOverride, pattern: patternOverride, immediate }) {
    if (!filename || !trackerState || deps.isDemoMode()) return;
    const block = deps.getBlockByFilename(filename);
    if (!block) return;

    const trackerNameInput = document.getElementById('trackerBlockName');
    const trackerOutput = document.getElementById('trackerOutput');
    const nextName = nameOverride != null
        ? String(nameOverride).trim() || block.name || filename.replace(/\.js$/i, '')
        : String(trackerNameInput?.value || block.name || filename.replace(/\.js$/i, '')).trim() || block.name || filename.replace(/\.js$/i, '');
    const nextPattern = patternOverride != null
        ? String(patternOverride).trim() || block.pattern || ''
        : String(trackerOutput?.value || block.pattern || '').trim();
    const payload = {
        name: nextName,
        description: block.description || '',
        pattern: nextPattern,
        trackerState,
        scope: deps.normalizeScope(block.scope),
        filename,
    };

    deps.setPendingTrackerSavePayload(payload);
    const existing = deps.getTrackerAutoSaveTimeout();
    if (existing) {
        clearTimeout(existing);
        deps.setTrackerAutoSaveTimeout(null);
    }

    const runSave = async () => {
        const activePayload = deps.getPendingTrackerSavePayload();
        deps.setPendingTrackerSavePayload(null);
        deps.setTrackerAutoSaveTimeout(null);
        if (!activePayload) return;
        try {
            const result = await deps.updateBlock(
                activePayload.filename,
                activePayload.name,
                activePayload.description,
                activePayload.pattern,
                activePayload.trackerState,
                activePayload.scope,
                { preserveFilename: true },
            );
            if (!result || result.ok === false) throw new Error(result?.error || 'Autosave failed');

            const updatedFilename = result.filename || activePayload.filename;
            const previousFilename = result.previousFilename || activePayload.filename;
            try { localStorage.removeItem(`unsaved_block_${previousFilename}`); } catch (_e) {}

            const appState = deps.getAppState();
            if (updatedFilename !== previousFilename) {
                if (Array.isArray(appState.arrangementDraftState?.rows)) {
                    appState.arrangementDraftState.rows = appState.arrangementDraftState.rows.map((row) => ({
                        ...row,
                        blocks: Array.isArray(row?.blocks)
                            ? row.blocks.map((b) => (b === previousFilename ? updatedFilename : b))
                            : [],
                    }));
                }
                if (appState.activeArrangementBlockFilename === previousFilename) {
                    deps.setActiveArrangementBlockFilename(updatedFilename);
                    if (deps.getCurrentArrangementFilename()) {
                        deps.setSelectedBlockForArrangement(deps.getCurrentArrangementFilename(), updatedFilename);
                    }
                }
            }
            await deps.refreshBlocksLibrary();
            if (deps.isArrangementWorkspaceActive()) {
                deps.renderArrangementWorkspace();
                deps.renderTrackerWorkspace();
            }
        } catch (err) {
            deps.logError('[Tracker] Autosave failed:', err);
            try { localStorage.setItem(`unsaved_block_${activePayload.filename}`, JSON.stringify(activePayload.trackerState || {})); } catch (_e) {}
            deps.setStatus(err.message === 'System block is read-only' ? err.message : 'Failed to autosave block', 'error');
        }
    };

    if (immediate) void runSave();
    else deps.setTrackerAutoSaveTimeout(setTimeout(runSave, 200));
}

export async function openTrackerModal(options = {}) {
    deps.setArrangementLiveEditSession(options?.returnToArrangementsOnClose
        ? { active: true, committed: false }
        : { active: false, committed: false });
    await syncTrackerPreviewReferenceContext(options);
    const instruments = await deps.getDefragmentedInstruments();
    const instrumentList = instruments.map((inst) => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
    deps.openTracker(instrumentList, options);
}

export async function openTrackerModalForEdit(block, trackerState, options = {}) {
    deps.setArrangementLiveEditSession(options?.returnToArrangementsOnClose
        ? { active: true, committed: false }
        : { active: false, committed: false });
    await syncTrackerPreviewReferenceContext(options);
    const instruments = await deps.getDefragmentedInstruments();
    const instrumentList = instruments.map((inst) => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));

    let resolvedBlock = { ...block };
    if (block?.filename) {
        try {
            const fullBlock = await deps.getBlockDetailOrNull(block.filename);
            if (fullBlock) {
                resolvedBlock = {
                    ...resolvedBlock,
                    scope: fullBlock?.scope ?? resolvedBlock.scope,
                    name: fullBlock?.name || resolvedBlock.name,
                    description: fullBlock?.description || resolvedBlock.description,
                };
            }
        } catch (_e) {}
    }

    let recoveredTrackerState = trackerState;
    const recoveredBlockCache = deps.readUnsavedBlockTrackerState(resolvedBlock.filename, resolvedBlock.scope);
    const recoveredBlockFromCache = Boolean(recoveredBlockCache);
    if (recoveredBlockCache) {
        recoveredTrackerState = recoveredBlockCache;
        deps.setStatus('Recovered unsaved block edits from previous session', 'normal');
    }

    const blockData = {
        filename: resolvedBlock.filename,
        name: resolvedBlock.name,
        description: resolvedBlock.description,
        scope: deps.normalizeScope(resolvedBlock.scope),
        trackerState: recoveredTrackerState,
        autoSaveOnInput: Boolean(options.autoSaveOnInput),
        combineSegments: Array.isArray(options.combineSegments) ? options.combineSegments : null,
        returnToArrangementsOnClose: options.returnToArrangementsOnClose,
        returnToBlocksOnClose: options.returnToBlocksOnClose,
    };
    deps.openTrackerForEdit(instrumentList, blockData);
    if (recoveredBlockFromCache && blockData.filename && blockData.trackerState) {
        setTimeout(() => {
            scheduleTrackerAutoSave({
                filename: blockData.filename,
                trackerState: blockData.trackerState,
            });
        }, 500);
    }
}
