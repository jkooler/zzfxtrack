/**
 * Module: features/arrangements/arrangement-preview
 * Purpose: Arrangement preview prime/update scheduling helpers.
 * Deps keys: alphabetical.
 */

let deps = {
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120 }),
    getArrangementInstrumentList: async () => [],
    getBlocksLibraryCache: () => [],
    getCurrentArrangementFilename: () => null,
    getPlaybackMixSettings: () => ({}),
    getPrimeTimeoutId: () => null,
    primeArrangementPreviewBuffer: () => {},
    resolveTrackerStateChannelInstruments: (trackerState) => trackerState,
    setPrimeTimeoutId: () => {},
};

export function configureArrangementPreview(options = {}) {
    deps = { ...deps, ...options };
}

export async function runArrangementPreviewPrime(filename) {
    if (deps.getCurrentArrangementFilename() !== filename) return;
    const state = deps.buildArrangementStatePayload();
    if (!state?.rows?.length) return;
    const wantedBlockFiles = Array.from(new Set((state.rows || []).flatMap((r) => (Array.isArray(r?.blocks) ? r.blocks : []))));
    if (!wantedBlockFiles.length) return;

    const trackerStateByFilename = {};
    const cachedBlocks = Array.isArray(deps.getBlocksLibraryCache()) ? deps.getBlocksLibraryCache() : [];
    for (const blockFilename of wantedBlockFiles) {
        const block = cachedBlocks.find((b) => b?.filename === blockFilename);
        if (block?.trackerState) {
            trackerStateByFilename[blockFilename] = deps.resolveTrackerStateChannelInstruments(block.trackerState);
        }
    }
    if (Object.keys(trackerStateByFilename).length === 0) return;

    const instrumentList = await deps.getArrangementInstrumentList();
    if (!instrumentList?.length) return;
    deps.primeArrangementPreviewBuffer(state, trackerStateByFilename, instrumentList, state.bpm || 120, deps.getPlaybackMixSettings());
    if ((state.rows || []).some((r) => Boolean(r?.loop))) {
        deps.primeArrangementPreviewBuffer(state, trackerStateByFilename, instrumentList, state.bpm || 120, deps.getPlaybackMixSettings(), true);
    }
}

export function scheduleArrangementPreviewPrime(filename) {
    const timeoutId = deps.getPrimeTimeoutId();
    if (timeoutId) {
        clearTimeout(timeoutId);
        deps.setPrimeTimeoutId(null);
    }
    if (!filename) return;
    deps.setPrimeTimeoutId(setTimeout(() => {
        deps.setPrimeTimeoutId(null);
        runArrangementPreviewPrime(filename).catch(() => {});
    }, 350));
}
