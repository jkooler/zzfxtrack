/**
 * Module: features/arrangements/arrangement-persistence
 * Purpose: Arrangement state cloning/payload building, autosave scheduling, and unsaved-state helpers.
 */

let deps = {
    isDemoMode: () => false,
    getCurrentArrangementScope: () => 'user',
    isDeveloperModeEnabled: () => false,
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    getCurrentArrangementFilename: () => null,
    getArrangementDraftState: () => null,
    getArrangementEntry: () => null,
    saveArrangement: async () => {},
    getDeveloperModeHeaders: () => ({}),
    getEntriesCache: () => [],
    setStatus: () => {},
    logError: () => {},
    getAutoSaveTimeout: () => null,
    setAutoSaveTimeout: () => {},
    dispatchStateChanged: () => {},
};

export function configureArrangementPersistence(options = {}) {
    deps = { ...deps, ...options };
}

export function getArrangementReadonly() {
    return deps.isDemoMode() || (deps.getCurrentArrangementScope() === 'system' && !deps.isDeveloperModeEnabled());
}

export function canRecoverUnsavedForScope(scope) {
    const normalizedScope = deps.normalizeScope(scope);
    return normalizedScope !== 'system' || deps.isDeveloperModeEnabled();
}

export function cloneArrangementState(value) {
    const rows = Array.isArray(value?.rows) ? value.rows : [];
    const outRows = rows.length ? rows.map((row) => ({
        repeats: Number.isFinite(Number(row?.repeats)) ? Math.max(1, Math.min(16, Number(row.repeats))) : 1,
        blocks: Array.isArray(row?.blocks) ? row.blocks.filter(Boolean).map(String) : [],
        loop: Boolean(row?.loop),
    })) : [{ repeats: 1, blocks: [], loop: false }];
    const loopIndices = outRows.map((r, i) => (r.loop ? i : -1)).filter((i) => i >= 0);
    if (loopIndices.length > 1) {
        const keepIndex = loopIndices[loopIndices.length - 1];
        outRows.forEach((r, i) => { r.loop = i === keepIndex; });
    }
    return {
        version: 1,
        name: String(value?.name || 'Arrangement').trim() || 'Arrangement',
        bpm: Number.isFinite(Number(value?.bpm)) ? Math.max(20, Math.min(300, Number(value.bpm))) : 120,
        rows: outRows,
    };
}

export function readUnsavedArrangementState(filename, scope) {
    if (!filename || !canRecoverUnsavedForScope(scope)) return null;
    const storageKey = `unsaved_arrangement_${filename}`;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return cloneArrangementState(parsed);
    } catch (_e) {
        try {
            localStorage.removeItem(storageKey);
        } catch (_err) {
            // Ignore storage failures.
        }
        return null;
    }
}

export function buildArrangementStatePayload() {
    return cloneArrangementState(deps.getArrangementDraftState() || {
        name: deps.getArrangementEntry(deps.getCurrentArrangementFilename())?.name || 'Arrangement',
        bpm: 120,
        rows: [{ repeats: 1, blocks: [], loop: false }],
    });
}

export function buildArrangementStatePayloadForSave() {
    const state = buildArrangementStatePayload();
    if (!state || !Array.isArray(state.rows)) return state;
    state.rows = state.rows.map((r) => ({ ...r, loop: false }));
    return state;
}

export function emitArrangementStateChanged(extraDetail = {}) {
    const arrangementState = buildArrangementStatePayload();
    deps.dispatchStateChanged({
        arrangementState,
        name: arrangementState.name,
        bpm: arrangementState.bpm,
        ...extraDetail,
    });
}

export function scheduleArrangementAutoSave() {
    const timeout = deps.getAutoSaveTimeout();
    if (timeout) clearTimeout(timeout);
    deps.setAutoSaveTimeout(setTimeout(() => {
        saveCurrentArrangement();
    }, 180));
}

export async function saveCurrentArrangement() {
    const currentFilename = deps.getCurrentArrangementFilename();
    const draftState = deps.getArrangementDraftState();
    if (!currentFilename || !draftState) return;
    if (getArrangementReadonly()) return;

    const timeout = deps.getAutoSaveTimeout();
    if (timeout) {
        clearTimeout(timeout);
        deps.setAutoSaveTimeout(null);
    }

    const arrangementState = buildArrangementStatePayloadForSave();
    const storageKey = `unsaved_arrangement_${currentFilename}`;
    try {
        localStorage.setItem(storageKey, JSON.stringify(arrangementState));
    } catch (_e) {
        // Ignore localStorage failures.
    }

    try {
        await deps.saveArrangement(currentFilename, {
            name: arrangementState.name,
            arrangementState,
            scope: deps.getCurrentArrangementScope(),
        }, deps.getDeveloperModeHeaders());
        try {
            localStorage.removeItem(storageKey);
        } catch (_e) {
            // Ignore localStorage failures.
        }
        const entry = deps.getEntriesCache().find((e) => e.filename === currentFilename);
        if (entry) entry.arrangementState = arrangementState;
        deps.setStatus('Saved arrangement', 'success');
    } catch (err) {
        deps.logError('[Arrangements] Autosave failed:', err);
        deps.setStatus('Failed to save arrangement', 'error');
    }
}
