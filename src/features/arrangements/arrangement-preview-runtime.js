/**
 * Module: features/arrangements/arrangement-preview-runtime
 * Purpose: Runtime arrangement-preview context updates and playback instrument alias synchronization.
 * Deps keys: alphabetical.
 */

let deps = {
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120 }),
    clearArrangementLiveOverride: () => {},
    clearArrangementPendingLiveSwap: () => {},
    clearPlaybackInstrumentAliases: () => {},
    getArrangementPreviewContext: () => ({ arrangementState: null, trackerStateByFilename: {}, instrumentList: null, bpm: 120, mixSettings: {} }),
    getArrangementPreviewPlayingFilename: () => null,
    getArrangementWorkspacePlayhead: () => ({ rowIndex: null, progress: 0, blocks: [] }),
    getCurrentArrangementFilename: () => null,
    getLastArrangementPlaybackInstrumentSignature: () => '',
    getPlaybackMixSettings: () => ({}),
    isArrangementPreviewPlaying: () => false,
    pulsePlaybackAliases: () => {},
    setArrangementPreviewContext: () => {},
    setLastArrangementPlaybackInstrumentSignature: () => {},
    setPlaybackInstrumentAliases: () => {},
    updateArrangementPreview: () => {},
};

export function configureArrangementPreviewRuntime(options = {}) {
    deps = { ...deps, ...options };
}

function isPlayableTrackerNote(note) {
    return Boolean(note && note !== '-' && note !== '~');
}

function getTrackerStateSteps(trackerState) {
    if (Number.isInteger(trackerState?.steps) && trackerState.steps > 0) return trackerState.steps;
    if (!Array.isArray(trackerState?.grid)) return 16;
    const firstChannel = trackerState.grid.find((channel) => Array.isArray(channel));
    if (!firstChannel) return 16;
    return Math.max(1, firstChannel.length || 16);
}

export function collectInstrumentAliasesFromRowStep(rowIndex, rowStep, blockFilenames = []) {
    const aliases = new Set();
    const files = Array.isArray(blockFilenames) ? blockFilenames : [];
    const context = deps.getArrangementPreviewContext();
    files.forEach((filename) => {
        const trackerState = context?.trackerStateByFilename?.[filename];
        if (!trackerState || !Array.isArray(trackerState.grid) || !Array.isArray(trackerState.channelInstruments)) return;
        const blockSteps = getTrackerStateSteps(trackerState);
        const localStep = ((rowStep % blockSteps) + blockSteps) % blockSteps;
        trackerState.grid.forEach((channel, channelIndex) => {
            const alias = trackerState.channelInstruments[channelIndex];
            if (!alias || !Array.isArray(channel)) return;
            const cell = channel[localStep];
            const note = typeof cell === 'object' ? cell?.note : cell;
            if (isPlayableTrackerNote(note)) aliases.add(alias);
        });
    });
    return Array.from(aliases).sort();
}

export function clearArrangementPlaybackInstrumentAliases() {
    deps.setLastArrangementPlaybackInstrumentSignature('');
    deps.clearPlaybackInstrumentAliases('arrangement-preview');
}

export function updateArrangementPlaybackInstrumentAliases(detail = {}) {
    if (!deps.isArrangementPreviewPlaying()) {
        clearArrangementPlaybackInstrumentAliases();
        return;
    }

    const context = deps.getArrangementPreviewContext();
    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const row = rowIndex == null ? null : context?.arrangementState?.rows?.[rowIndex];
    const blocks = rowIndex != null && Array.isArray(row?.blocks)
        ? row.blocks
        : (Array.isArray(detail.blocks) ? detail.blocks : []);
    if (rowIndex == null || !blocks.length) {
        if (deps.getLastArrangementPlaybackInstrumentSignature() !== 'empty') {
            deps.setLastArrangementPlaybackInstrumentSignature('empty');
            deps.clearPlaybackInstrumentAliases('arrangement-preview');
        }
        return;
    }

    const rowSteps = Number.isInteger(detail.rowSteps) && detail.rowSteps > 0
        ? detail.rowSteps
        : (Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) * 16 : 16);
    const progress = typeof detail.progress === 'number' ? Math.max(0, Math.min(detail.progress, 0.999999)) : 0;
    const rowStep = Math.floor(progress * rowSteps);
    const sortedAliases = collectInstrumentAliasesFromRowStep(rowIndex, rowStep, blocks);
    const signature = `${rowIndex}|${rowStep}|${sortedAliases.join('|')}`;
    if (signature === deps.getLastArrangementPlaybackInstrumentSignature()) return;
    deps.setLastArrangementPlaybackInstrumentSignature(signature);

    if (sortedAliases.length) {
        const bpm = Math.max(1, Number(context?.bpm) || 120);
        const stepDurationSeconds = 60 / bpm / 4;
        deps.setPlaybackInstrumentAliases('arrangement-preview', sortedAliases);
        deps.pulsePlaybackAliases(sortedAliases, stepDurationSeconds);
    } else deps.clearPlaybackInstrumentAliases('arrangement-preview');
}

export function applyArrangementPreviewAfterBlockRemoved(removedFilename) {
    if (!deps.isArrangementPreviewPlaying()) return;
    if (deps.getArrangementPreviewPlayingFilename() !== deps.getCurrentArrangementFilename()) return;
    const context = deps.getArrangementPreviewContext();
    if (!context?.trackerStateByFilename || !context?.instrumentList) return;
    deps.clearArrangementLiveOverride({ filename: removedFilename, scheduleUpdate: false });
    deps.clearArrangementPendingLiveSwap();
    const arrangementState = deps.buildArrangementStatePayload();
    const nextContext = {
        ...context,
        arrangementState,
        bpm: arrangementState.bpm || context.bpm,
        mixSettings: deps.getPlaybackMixSettings(),
    };
    deps.setArrangementPreviewContext(nextContext);
    deps.updateArrangementPreview({
        arrangementState,
        trackerStateByFilename: nextContext.trackerStateByFilename,
        instrumentList: nextContext.instrumentList,
        bpm: nextContext.bpm,
        mixSettings: nextContext.mixSettings,
        // Preserve transport position when removing blocks during live preview.
        keepPosition: true,
        liveSwapMode: 'step',
    });
    updateArrangementPlaybackInstrumentAliases(deps.getArrangementWorkspacePlayhead());
}
