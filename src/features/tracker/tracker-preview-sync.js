/**
 * Module: features/tracker/tracker-preview-sync
 * Purpose: Tracker preview reference context and instrument-refresh synchronization.
 * Deps keys: alphabetical.
 */

let deps = {
    buildArrangementExportContext: async () => null,
    clearTrackerPreviewReferenceContext: () => {},
    getAppState: () => ({}),
    getArrangementLiveEditSession: () => ({ active: false, committed: false }),
    getTrackerPreviewInstrumentRefreshDebounceMs: () => 120,
    getTrackerPreviewInstrumentRefreshSeq: () => 0,
    getTrackerPreviewInstrumentRefreshTimeout: () => null,
    isArrangementWorkspaceActive: () => false,
    isTrackerOpen: () => false,
    isTrackerPreviewPlaying: () => false,
    refreshTrackerPreview: () => {},
    setTrackerPreviewInstrumentRefreshSeq: () => {},
    setTrackerPreviewInstrumentRefreshTimeout: () => {},
    setTrackerPreviewReferenceContext: () => {},
};

export function configureTrackerPreviewSync(options = {}) {
    deps = { ...deps, ...options };
}

export async function syncTrackerPreviewReferenceContext(options = {}) {
    const appState = deps.getAppState();
    const useArrangementReference = Boolean(
        appState.currentArrangementFilename
        && appState.arrangementDraftState
        && (deps.isArrangementWorkspaceActive() || options?.returnToArrangementsOnClose || options?.returnToBlocksOnClose === false)
    );
    if (!useArrangementReference) {
        deps.clearTrackerPreviewReferenceContext();
        return;
    }
    const context = await deps.buildArrangementExportContext();
    if (!context) {
        deps.clearTrackerPreviewReferenceContext();
        return;
    }
    deps.setTrackerPreviewReferenceContext(context);
}

export function scheduleTrackerPreviewInstrumentRefresh() {
    const nextSeq = deps.getTrackerPreviewInstrumentRefreshSeq() + 1;
    deps.setTrackerPreviewInstrumentRefreshSeq(nextSeq);
    const timeout = deps.getTrackerPreviewInstrumentRefreshTimeout();
    if (timeout) clearTimeout(timeout);
    deps.setTrackerPreviewInstrumentRefreshTimeout(setTimeout(async () => {
        deps.setTrackerPreviewInstrumentRefreshTimeout(null);
        if (nextSeq !== deps.getTrackerPreviewInstrumentRefreshSeq()) return;
        if (!deps.isTrackerOpen()) return;
        const appState = deps.getAppState();
        const session = deps.getArrangementLiveEditSession();
        const shouldSyncArrangementReference = Boolean(
            appState.currentArrangementFilename
            && appState.arrangementDraftState
            && (deps.isArrangementWorkspaceActive() || session.active)
        );
        if (shouldSyncArrangementReference) {
            const context = await deps.buildArrangementExportContext();
            if (nextSeq !== deps.getTrackerPreviewInstrumentRefreshSeq()) return;
            if (context) deps.setTrackerPreviewReferenceContext(context);
            else deps.clearTrackerPreviewReferenceContext();
        }
        if (deps.isTrackerPreviewPlaying()) deps.refreshTrackerPreview();
    }, deps.getTrackerPreviewInstrumentRefreshDebounceMs()));
}
