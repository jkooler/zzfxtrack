/**
 * Module: features/arrangements/arrangement-preview-events
 * Purpose: Event-driven orchestration for arrangement preview start/stop/update flows.
 * Deps keys: alphabetical.
 */

let deps = {
    applyArrangementWorkspacePlayhead: () => {},
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120 }),
    clearArrangementLiveOverride: () => {},
    clearArrangementPlaybackInstrumentAliases: () => {},
    clearArrangementWorkspacePlayheadVisuals: () => {},
    getArrangementInstrumentList: async () => [],
    getArrangementPreviewContext: () => ({ arrangementState: null, trackerStateByFilename: {}, instrumentList: null, bpm: 120, mixSettings: {} }),
    getArrangementPreviewPlayingFilename: () => null,
    getArrangementWorkspacePlayhead: () => ({ rowIndex: null, progress: 0, blocks: [] }),
    getBlocksLibraryCache: () => [],
    getBlockDetailOrNull: async () => null,
    getCurrentArrangementFilename: () => null,
    getPlaybackMixSettings: () => ({}),
    isArrangementPreviewPlaying: () => false,
    resolveTrackerStateChannelInstruments: (trackerState) => trackerState,
    setArrangementPreviewContext: () => {},
    setArrangementPreviewPlayingFilename: () => {},
    setBlocksLibraryCache: () => {},
    setStatus: () => {},
    startArrangementPreview: () => false,
    stopArrangementPreview: () => {},
    updateArrangementListScopeVisualizer: () => {},
    updateArrangementPlaybackInstrumentAliases: () => {},
    updateArrangementPreview: () => {},
    updateArrangementWorkspaceChipSteps: () => {},
    updateArrangementWorkspacePreviewButtonState: () => {},
};

let listenersInstalled = false;

export function configureArrangementPreviewEvents(options = {}) {
    deps = { ...deps, ...options };
}

export function installArrangementPreviewEventListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;

    document.addEventListener('arrangements:preview', async (e) => {
        const { arrangement, startRowIndex, filename: previewFilename } = e.detail || {};
        const arrangementState = arrangement?.arrangementState;
        if (!arrangementState) return;

        const currentPlayingFilename = deps.getArrangementPreviewPlayingFilename();
        const currentContext = deps.getArrangementPreviewContext();
        if (Number.isInteger(startRowIndex) && startRowIndex >= 0 &&
            currentPlayingFilename === previewFilename &&
            currentContext?.trackerStateByFilename != null &&
            Array.isArray(currentContext?.instrumentList)) {
            const stateToPlay = (deps.getCurrentArrangementFilename() === previewFilename)
                ? deps.buildArrangementStatePayload()
                : arrangementState;
            const nextContext = {
                ...currentContext,
                arrangementState: stateToPlay,
                mixSettings: deps.getPlaybackMixSettings(),
            };
            deps.setArrangementPreviewContext(nextContext);
            deps.setArrangementPreviewPlayingFilename(previewFilename ?? null);
            deps.stopArrangementPreview();
            const started = deps.startArrangementPreview(
                stateToPlay,
                nextContext.trackerStateByFilename,
                nextContext.instrumentList,
                nextContext.bpm ?? 120,
                { keepPosition: false, mixSettings: nextContext.mixSettings, startRowIndex }
            );
            if (!started) {
                deps.setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
                deps.setArrangementPreviewPlayingFilename(null);
            }
            document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: started } }));
            return;
        }

        try {
            const instrumentList = await deps.getArrangementInstrumentList();
            const instrumentIdSet = new Set(instrumentList.map(i => i.id));
            const wantedBlockFiles = Array.from(new Set((arrangementState.rows || []).flatMap((r) => Array.isArray(r.blocks) ? r.blocks : [])));
            const trackerStateByFilename = {};
            const previewBlocks = [];
            let playable = 0;
            const isPlayableTrackerState = (ts) => {
                if (!ts || !Array.isArray(ts.grid) || !Array.isArray(ts.channelInstruments)) return false;
                return ts.grid.some((channel, ch) => {
                    const instId = ts.channelInstruments[ch];
                    if (!instId || !instrumentIdSet.has(instId)) return false;
                    return Array.isArray(channel) && channel.some((cell) => {
                        const note = cell && typeof cell === 'object' ? cell.note : cell;
                        return note && note !== '~' && note !== '-';
                    });
                });
            };
            const registerTrackerState = (filename, trackerState) => {
                if (!filename || !trackerState || trackerStateByFilename[filename]) return;
                const resolved = deps.resolveTrackerStateChannelInstruments(trackerState);
                trackerStateByFilename[filename] = resolved;
                previewBlocks.push({ filename, trackerState });
                if (isPlayableTrackerState(resolved)) playable++;
            };
            const cachedBlocksByFilename = new Map(
                (Array.isArray(deps.getBlocksLibraryCache()) ? deps.getBlocksLibraryCache() : [])
                    .filter((block) => block?.filename)
                    .map((block) => [block.filename, block])
            );
            const fetchedBlocks = await Promise.all(wantedBlockFiles.map(async (filename) => {
                try {
                    const block = await deps.getBlockDetailOrNull(filename);
                    return { filename, block: block || null };
                } catch (_err) {
                    return { filename, block: null };
                }
            }));
            const cache = deps.getBlocksLibraryCache().slice();
            fetchedBlocks.forEach((result) => {
                if (!result) return;
                const { filename, block } = result;
                const cached = cachedBlocksByFilename.get(filename);
                // Prefer in-memory tracker state when available. It can be fresher than API
                // immediately after tracker saves in modal flows.
                const effective = cached?.trackerState
                    ? { ...(block || {}), ...cached }
                    : (block || cached || null);
                if (!effective) return;
                registerTrackerState(filename, effective.trackerState);
                const idx = cache.findIndex((entry) => entry?.filename === filename);
                if (idx !== -1) cache[idx] = { ...cache[idx], ...effective };
                else cache.push({ filename, ...effective });
            });
            deps.setBlocksLibraryCache(cache);

            const unresolvedBlocks = wantedBlockFiles.filter((filename) => !trackerStateByFilename[filename]);
            if (unresolvedBlocks.length > 0) {
                deps.setStatus(`Arrangement preview failed: missing blocks (${unresolvedBlocks.length}).`, 'error');
                return;
            }
            if (wantedBlockFiles.length > 0 && playable === 0) {
                deps.setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
                return;
            }

            const bpm = arrangementState.bpm || 120;
            const mixSettings = deps.getPlaybackMixSettings();
            const stateToPlay = (deps.getCurrentArrangementFilename() === previewFilename)
                ? deps.buildArrangementStatePayload()
                : arrangementState;
            deps.setArrangementPreviewContext({
                arrangementState: stateToPlay,
                trackerStateByFilename: { ...trackerStateByFilename },
                instrumentList,
                bpm,
                mixSettings,
            });
            if (previewBlocks.length) {
                document.dispatchEvent(new CustomEvent('arrangements:blocksLoaded', { detail: { blocks: previewBlocks } }));
            }
            deps.setArrangementPreviewPlayingFilename(previewFilename ?? null);
            deps.stopArrangementPreview();
            const started = deps.startArrangementPreview(stateToPlay, trackerStateByFilename, instrumentList, bpm, {
                keepPosition: false,
                mixSettings,
                startRowIndex: Number.isInteger(startRowIndex) ? startRowIndex : undefined,
            });
            if (!started) {
                deps.setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
                deps.setArrangementPreviewPlayingFilename(null);
            }
            document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: started } }));
        } catch (_err) {
            deps.setStatus('Arrangement preview failed (see console).', 'error');
        }
    });

    document.addEventListener('arrangements:stateChanged', (e) => {
        if (!deps.isArrangementPreviewPlaying()) return;
        if (deps.getArrangementPreviewPlayingFilename() !== deps.getCurrentArrangementFilename()) return;
        const arrangementState = e?.detail?.arrangementState;
        if (!arrangementState) return;
        const currentContext = deps.getArrangementPreviewContext();
        deps.setArrangementPreviewContext({
            ...currentContext,
            arrangementState,
            bpm: arrangementState.bpm || currentContext.bpm,
            mixSettings: deps.getPlaybackMixSettings(),
        });
        const addedRowIndex = e?.detail?.addedRowIndex;
        const addedFilename = e?.detail?.addedFilename;
        const removedFilename = e?.detail?.removedFilename;
        const removedRowIndex = e?.detail?.removedRowIndex;
        if (Number.isInteger(addedRowIndex)) deps.clearArrangementLiveOverride({ rowIndex: addedRowIndex, scheduleUpdate: false });
        if (Number.isInteger(removedRowIndex)) deps.clearArrangementLiveOverride({ rowIndex: removedRowIndex, scheduleUpdate: false });
        if (addedFilename) deps.clearArrangementLiveOverride({ filename: addedFilename, scheduleUpdate: false });
        if (removedFilename) deps.clearArrangementLiveOverride({ filename: removedFilename, scheduleUpdate: false });
        const liveSwapMode = (
            Number.isInteger(addedRowIndex)
            || Number.isInteger(removedRowIndex)
            || typeof addedFilename === 'string'
            || typeof removedFilename === 'string'
        ) ? 'step' : undefined;
        const nextContext = deps.getArrangementPreviewContext();
        deps.updateArrangementPreview({
            arrangementState,
            trackerStateByFilename: nextContext.trackerStateByFilename,
            instrumentList: nextContext.instrumentList,
            bpm: nextContext.bpm,
            mixSettings: nextContext.mixSettings,
            // Keep playback position stable for row/block removal edits.
            keepPosition: true,
            liveSwapMode,
        });
        deps.updateArrangementPlaybackInstrumentAliases(deps.getArrangementWorkspacePlayhead());
    });

    document.addEventListener('arrangements:previewLoopChanged', (e) => {
        if (!deps.isArrangementPreviewPlaying()) return;
        const arrangementState = e?.detail?.arrangementState;
        if (!arrangementState) return;
        const context = deps.getArrangementPreviewContext();
        deps.updateArrangementPreview({
            arrangementState,
            trackerStateByFilename: context.trackerStateByFilename,
            instrumentList: context.instrumentList,
            bpm: context.bpm,
            mixSettings: context.mixSettings,
            keepPosition: true,
        });
    });

    document.addEventListener('arrangements:blocksLoaded', (e) => {
        deps.updateArrangementWorkspaceChipSteps(e?.detail?.blocks || []);
        deps.updateArrangementPlaybackInstrumentAliases(deps.getArrangementWorkspacePlayhead());
    });

    document.addEventListener('arrangements:playhead', (e) => {
        const detail = e?.detail || {};
        if (deps.getArrangementPreviewPlayingFilename() === deps.getCurrentArrangementFilename()) {
            deps.applyArrangementWorkspacePlayhead(detail);
        }
        deps.updateArrangementPlaybackInstrumentAliases(detail);
    });

    document.addEventListener('arrangements:previewState', (e) => {
        deps.updateArrangementWorkspacePreviewButtonState();
        const playing = e?.detail?.playing ?? deps.isArrangementPreviewPlaying();
        if (!playing) {
            deps.setArrangementPreviewPlayingFilename(null);
            deps.clearArrangementWorkspacePlayheadVisuals();
            deps.clearArrangementPlaybackInstrumentAliases();
            deps.updateArrangementListScopeVisualizer();
            return;
        }
        deps.updateArrangementPlaybackInstrumentAliases(deps.getArrangementWorkspacePlayhead());
        deps.updateArrangementListScopeVisualizer();
    });
}
