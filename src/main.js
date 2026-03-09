import '@strudel/repl/index.mjs';
import { codemirrorSettings, themes as strudelReplThemes, updateMiniLocations } from '@strudel/codemirror';
import '@melloware/coloris/dist/coloris.css';
import Coloris from '@melloware/coloris';
import { instruments as staticInstruments } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { exportPattern } from './export-logic.js';
import { buildSong, playZzfxmSong, stopZzfxmSong } from './zzfxtrack-player.js';
import { attachVisualizer } from './visualizer.js';
import { getAudioContext } from '@strudel/webaudio';
import { initInstrumentUI, hideInitOverlay, getInstrumentsForExporter, updateInstrumentUsage, updatePatternSelectionState, updateArrangementSelectionState, refreshInstrumentListUI, setPlaybackInstrumentAliases, clearPlaybackInstrumentAliases, setupScrubInteraction } from './instrument-ui.js';
import { setInstrumentScope, getDefragmentedInstruments } from './instrument-manager.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';
import { createIcons, icons } from 'lucide';
import { initTracker, openTracker, openTrackerForEdit, closeTracker, isTrackerOpen, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState, previewTrackerStateOnce, startArrangementPreview, stopArrangementPreview, primeArrangementPreviewBuffer, updateArrangementPreview, isArrangementPreviewPlaying, setArrangementLiveOverride, clearArrangementLiveOverride, clearArrangementLiveOverrides, primePreviewAudioContext, stopTrackerPreviewPlayback, renderArrangementStateForExport, flushTrackerSaveForBlockSwitch, clearArrangementPendingLiveSwap, isTrackerPreviewPlaying, refreshTrackerPreview, scheduleArrangementPreviewInstrumentUpdate, setTrackerPreviewReferenceContext, clearTrackerPreviewReferenceContext } from './tracker.js';
import { resolveTrackerStateChannelInstruments } from './instrument-rename-map.js';
import { initBlocks, openBlocksModal, isBlocksModalOpen, saveBlock, updateBlock, BLOCKS_FOLDER_STATE_KEY, restoreSuspendedBlocksModals } from './blocks.js';
import { DEFAULT_PLAYBACK_MIX_SETTINGS, sanitizePlaybackMixSettings } from './mix-settings.js';
import { setupBeforeUnloadHandler, registerBeforeUnloadFlusher, registerBeforeUnloadConfirmer } from './unload.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { dom } from './app/dom.js';
import { createArrangement, deleteArrangementByFilename, deleteBlockByFilenameWithConflictInfo, deletePatternByFilename, getArrangement, getArrangementOrNull, getBlockDetailOrNull, getPatternMetaTextOrNull, getPatternSource, getPatternSourceOrEmpty, listArrangements, listArrangementsOrEmpty, listBlocksOrEmpty, listPatterns, renameArrangementFile, renamePatternFile, saveArrangement, saveArrangementKeepalive, saveBlockDetail, saveBlockDetailKeepalive, saveExportedJsFile, saveExportedJsonFile, savePatternSource, savePatternSourceKeepalive, sendPatternSourceBeacon, updateInstrumentsSourceFile } from './app/api.js';
import { appState } from './app/state.js';
import { reloadInstruments } from './features/instruments/instrument-runtime.js';
import { configureInstrumentReferenceSync } from './features/instruments/instrument-reference-sync.js';
import { configurePatternList, getPatternEntry, normalizePatternEntries, refreshPatternList, refreshPatternListActiveState, updatePatternListVisualizer } from './features/patterns/pattern-list.js';
import { configurePatternController, createNewPattern, deletePattern, loadPattern, renamePattern, saveCurrentPattern } from './features/patterns/pattern-controller.js';
import { configurePatternEditor, editorToFile, fileToEditor, setupPatternEditorAutosave, validateCodeForExport } from './features/patterns/pattern-editor.js';
import { configurePatternMeta, loadPatternMeta, normalizePatternBaseName, savePatternMeta, updatePatternScope } from './features/patterns/pattern-meta.js';
import { configureArrangementList, getArrangementEntry, refreshArrangementList, refreshArrangementListActiveState, updateArrangementListScopeVisualizer } from './features/arrangements/arrangement-list.js';
import { buildArrangementStatePayload, canRecoverUnsavedForScope, cloneArrangementState, configureArrangementPersistence, emitArrangementStateChanged, getArrangementReadonly, readUnsavedArrangementState, saveCurrentArrangement, scheduleArrangementAutoSave } from './features/arrangements/arrangement-persistence.js';
import { configureArrangementPreview, scheduleArrangementPreviewPrime } from './features/arrangements/arrangement-preview.js';
import { closeNewArrangementModal, configureArrangementController, createNewArrangement, createUntitledBlock, deleteArrangement, loadArrangement, openNewArrangementModal, renameArrangement } from './features/arrangements/arrangement-controller.js';
import { buildArrangementExportContext, configureArrangementExportContext, getArrangementInstrumentList, updateArrangementInstrumentUsage } from './features/arrangements/arrangement-export-context.js';
import { configureArrangementPreviewEvents, installArrangementPreviewEventListeners } from './features/arrangements/arrangement-preview-events.js';
import { applyArrangementPreviewAfterBlockRemoved, clearArrangementPlaybackInstrumentAliases, configureArrangementPreviewRuntime, updateArrangementPlaybackInstrumentAliases } from './features/arrangements/arrangement-preview-runtime.js';
import { applyArrangementWorkspacePlayhead, clearArrangementWorkspacePlayheadVisuals, configureArrangementWorkspace, renderArrangementWorkspace, showArrangementWorkspace, updateArrangementWorkspaceChipSteps, updateArrangementWorkspacePreviewButtonState } from './features/arrangements/arrangement-workspace.js';
import { buildExportLengthWarningMessage, estimateExportSizeBytes, formatExportSize, getExportDurationSeconds, inferArrangeCyclesFromCode, shouldWarnExportLength } from './features/playback/export-actions.js';
import { configurePlaybackController } from './features/playback/playback-controller.js';
import { configureDevMode, getDeveloperModeHeaders, isDeveloperModeEnabled, setDeveloperModeEnabled, updateAdvancedSettingsButtonsVisibility, updateDevModeToolbarLabelVisibility } from './features/settings/dev-mode.js';
import { setStatus, clearStatusAfter, configureStatusBar, installStatusEventListener } from './features/ui/status-bar.js';
import { setupListTouchActivation } from './features/ui/touch-activation.js';
import { ensureArrangementsSection, ensureBlocksSection, nextAvailableVarName, normalizePatternStack as normalizePatternStackShared, slugify, upsertPatternLayer as upsertPatternLayerShared } from './shared/code-transform-utils.js';
import { escapeHtml } from './shared/formatters.js';
import JSZip from 'jszip';

const DEMO_MODE = import.meta.env.MODE === 'demo';

setupBeforeUnloadHandler();
const demoPatternModules = import.meta.glob('../patterns/*.js', {
    query: '?raw',
    import: 'default',
    eager: true
});
const demoBlockModules = import.meta.glob('../blocks/*.js', {
    query: '?raw',
    import: 'default',
    eager: true
});
const demoArrangementModules = import.meta.glob('../arrangements/*.js', {
    query: '?raw',
    import: 'default',
    eager: true
});
const demoPatternSourceByFile = new Map(
    Object.entries(demoPatternModules)
        .filter(([modulePath]) => !modulePath.endsWith('/index.js'))
        .map(([modulePath, source]) => [modulePath.split('/').pop(), source])
);
const demoBlockSourceByFile = new Map(
    Object.entries(demoBlockModules)
        .filter(([modulePath]) => !modulePath.endsWith('/index.js'))
        .map(([modulePath, source]) => [modulePath.split('/').pop(), source])
);
const demoArrangementSourceByFile = new Map(
    Object.entries(demoArrangementModules)
        .filter(([modulePath]) => !modulePath.endsWith('/index.js'))
        .map(([modulePath, source]) => [modulePath.split('/').pop(), source])
);

// --- Global State ---
let currentPatternDisplayName = ''; // Store the display name for restoration
let lastExportedData = null;
let lastExportedMeta = null;
let lastExportedContext = { type: null, filename: null };
let songDataViewMode = 'json'; // 'json' | 'js' for Song Data modal
let autoSaveTimeout = null; // Debounce timer for auto-save
let isPreviewPlaying = false;
let playingPatternFilename = null;
let isStrudelPaused = false; // true after Shift+click stop (pause); next play resumes
let playBtnShiftHover = false; // shift held and mouse over play button (for pause icon)
let pendingExternalUrl = null;
let renameDebounceTimeout = null;
let pendingUploadBundle = null;
let pendingAdvancedSettingsContext = null;
const UPLOAD_BUNDLE_MANIFEST_NAME = 'strudel-project-bundle.json';
const UPLOAD_BUNDLE_KIND = 'strudel-project-bundle';
/** Filename of the arrangement currently being previewed (null when not playing). Used to show playhead only on that arrangement's workspace. */
let arrangementPreviewPlayingFilename = null;
let arrangementPreviewContext = {
    arrangementState: null,
    trackerStateByFilename: {},
    instrumentList: null,
    bpm: 120,
    mixSettings: sanitizePlaybackMixSettings(DEFAULT_PLAYBACK_MIX_SETTINGS),
};
let arrangementLiveEditSession = {
    active: false,
    committed: false,
};
const TRACKER_PREVIEW_INSTRUMENT_REFRESH_DEBOUNCE_MS = 120;
let trackerPreviewInstrumentRefreshTimeout = null;
let trackerPreviewInstrumentRefreshSeq = 0;
let arrangementAutoSaveTimeout = null;
let arrangementRenameDebounceTimeout = null;
let arrangementPreviewPrimeTimeoutId = null;
let trackerAutoSaveTimeout = null;
let pendingTrackerSavePayload = null;
/** Per-arrangement last selected block filename (key = arrangement filename, value = block filename or null). */
const arrangementSelectedBlockByArrangement = {};
let trackerDockRestoreParent = null;
let trackerDockRestoreNextSibling = null;
let trackerWorkspaceLoadedFilename = null;
let trackerWorkspaceLoadToken = 0;
let arrangementWorkspacePlayingRowIndex = null;
let arrangementWorkspacePlayhead = {
    rowIndex: null,
    progress: 0,
    blocks: [],
};
let lastArrangementPlaybackInstrumentSignature = '';

const PLAYBACK_LOUDNESS_PRESETS = Object.freeze({
    safe: { targetPeak: 0.5, masterGainDb: 0, softClipDrive: 1 },
    balanced: { ...DEFAULT_PLAYBACK_MIX_SETTINGS },
    loud: { targetPeak: 0.65, masterGainDb: 5.5, softClipDrive: 1.8 },
    very_loud: { targetPeak: 0.8, masterGainDb: 7, softClipDrive: 2.3 },
});
const DEFAULT_PLAYBACK_PRESET_ID = 'balanced';

configurePlaybackController({
    getEditor: () => dom.repl?.editor || null,
});

configurePatternList({
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getPatternListElement: () => dom.patternList,
    getPatternEntriesCache: () => appState.patternEntriesCache,
    normalizeScope,
    isDemoMode: () => DEMO_MODE,
    getDemoPatternFiles: () => Array.from(demoPatternSourceByFile.keys()),
    listPatterns,
    setPatternEntriesCache: (entries) => { appState.patternEntriesCache = entries; },
    isDeveloperModeEnabled,
    getWelcomeViewVisible: () => dom.welcomeView?.style?.display === 'flex',
    loadPattern,
    showDeleteConfirmation,
    getPatternFolderState: () => patternFolderState,
    setPatternFolderState: (nextState) => { patternFolderState = nextState; },
    savePatternFolderState: (state) => saveFolderState(PATTERN_FOLDER_STATE_KEY, state),
    createIcons,
    icons,
    setStatus,
    getPlayingPatternFilename: () => playingPatternFilename,
    attachVisualizer,
});

configurePatternMeta({
    isDemoMode: () => DEMO_MODE,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    setCurrentPatternScope: (scope) => { appState.currentPatternScope = scope; },
    updatePatternNameReadOnly: () => {
        dom.patternNameInput.readOnly = DEMO_MODE || (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled());
    },
    sanitizePlaybackMixSettings,
    applyPlaybackMixSettingsToInputs,
    normalizePlaybackPresetId,
    inferPlaybackPresetId,
    setPlaybackPresetControl,
    applyWavSettings: (sampleRateRaw, bitDepthRaw) => {
        const wavSampleRate = parseInt(sampleRateRaw, 10);
        if (dom.wavSampleRate && [8000, 11025, 16000, 22050, 32000, 44100, 48000].includes(wavSampleRate)) {
            dom.wavSampleRate.value = String(wavSampleRate);
        }
        const wavBitDepth = parseInt(bitDepthRaw, 10);
        if (dom.wavBitDepth && [8, 16, 24].includes(wavBitDepth)) {
            dom.wavBitDepth.value = String(wavBitDepth);
        }
    },
    applyExportResolutionRowsPerCycle: (rowsPerCycle) => {
        const resolutionInputs = document.querySelectorAll('input[name="exportResolution"]');
        const isPreset = rowsPerCycle === 48 || rowsPerCycle === 96;
        resolutionInputs.forEach(input => {
            input.checked = input.value === String(isPreset ? rowsPerCycle : 'custom');
        });
        if (!isPreset && dom.exportResolutionCustom) {
            dom.exportResolutionCustom.value = String(rowsPerCycle);
        }
        const event = new Event('change', { bubbles: true });
        document.querySelector('input[name="exportResolution"]:checked')?.dispatchEvent(event);
    },
    getRowsPerCycle: () => {
        const resolutionInput = document.querySelector('input[name="exportResolution"]:checked');
        if (resolutionInput?.value === '48') return 48;
        if (resolutionInput?.value === 'custom') {
            const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
            if (parsed && !Number.isNaN(parsed)) return parsed;
        }
        return 96;
    },
    getPlaybackMixSettings,
    getPlaybackPresetValue: () => dom.playbackLoudnessPreset?.value,
    getWavExportSettings,
    warn: (message, err) => console.warn(message, err),
});

configurePatternEditor({
    isDemoMode: () => DEMO_MODE,
    getReplEditor: () => dom.repl?.editor || null,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentPatternScope: () => appState.currentPatternScope,
    isDeveloperModeEnabled,
    updateInstrumentUsage,
    getAutoSaveTimeout: () => autoSaveTimeout,
    setAutoSaveTimeout: (timeout) => { autoSaveTimeout = timeout; },
    saveCurrentPattern,
    persistUnsavedPattern: (filename, code) => {
        try { localStorage.setItem(`unsaved_${filename}`, code); } catch (_e) {}
    },
    clearUnsavedPattern: (filename) => {
        try { localStorage.removeItem(`unsaved_${filename}`); } catch (_e) {}
    },
    isReplPlaying: () => Boolean(dom.repl?.editor?.repl?.scheduler?.started),
    evaluateRepl: () => dom.repl?.editor?.evaluate(),
    logInfo: (...args) => console.log(...args),
    logError: (...args) => console.error(...args),
});

configurePatternController({
    isDemoMode: () => DEMO_MODE,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentPatternScope: () => appState.currentPatternScope,
    setCurrentPatternFilename: (filename) => { appState.currentPatternFilename = filename; },
    getCurrentPatternDisplayName: () => currentPatternDisplayName,
    setCurrentPatternDisplayName: (name) => { currentPatternDisplayName = name; },
    getOriginalPatternName: () => originalPatternName,
    setOriginalPatternName: (name) => { originalPatternName = name; },
    isDeveloperModeEnabled,
    getEditorCode: () => dom.repl?.editor?.code || '',
    getPatternNameInputValue: () => dom.patternNameInput?.value || '',
    editorToFile,
    savePatternSource,
    renamePatternFile,
    deletePatternByFilename,
    listPatterns,
    normalizePatternEntries,
    getPatternEntry,
    normalizeScope,
    getDeveloperModeHeaders,
    getPatternSource,
    fileToEditor,
    normalizeScope,
    getPatternEntry,
    getDemoPatternSource: (filename) => demoPatternSourceByFile.get(filename),
    getUnsavedPatternCode: (filename) => localStorage.getItem(`unsaved_${filename}`),
    clearUnsavedPatternCode: (filename) => localStorage.removeItem(`unsaved_${filename}`),
    saveCurrentPattern,
    setCurrentPatternSelection: (filename, scope) => {
        appState.currentPatternFilename = filename;
        appState.currentPatternScope = scope;
    },
    setPatternDisplayNames: (displayName, originalName) => {
        currentPatternDisplayName = displayName;
        originalPatternName = originalName;
    },
    showEditor,
    refreshArrangementListActiveState,
    renderArrangementWorkspace,
    setPatternNameInputValue: (value) => { dom.patternNameInput.value = value; },
    setPatternNameInputReadOnly: (value) => { dom.patternNameInput.readOnly = value; },
    setPatternNameInputPlaceholder: (value) => { dom.patternNameInput.placeholder = value; },
    updateAdvancedSettingsButtonsVisibility,
    refreshPatternListDomActiveState: (filename) => {
        Array.from(dom.patternList.querySelectorAll('.list-item')).forEach((li) => {
            const isActive = li.dataset.filename === filename;
            li.classList.toggle('active', Boolean(isActive));
        });
    },
    updatePatternListVisualizer,
    setEditorCodeWithHighlightSync: (editorCode, filename, playingFilename) => {
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
            const view = dom.repl.editor.editor;
            if (view) {
                view.dispatch({});
                const locations = (filename === playingFilename && dom.repl.editor.miniLocations)
                    ? dom.repl.editor.miniLocations
                    : [];
                updateMiniLocations(view, locations);
            }
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
    },
    getPlayingPatternFilename: () => playingPatternFilename,
    setPlayingPatternFilename: (filename) => { playingPatternFilename = filename; },
    stopEditorPlayback: () => { if (dom.repl.editor) dom.repl.editor.stop(); },
    updatePlayState,
    showWelcome,
    clearRenameDebounceTimeout: () => { renameDebounceTimeout = null; },
    setExportControlsDisabled,
    clearZzfxmPreviewData,
    renderPlayButton,
    loadPatternMeta,
    updateInstrumentUsage,
    updatePatternSelectionState,
    clearPatternTimers: () => {
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = null;
        }
        if (renameDebounceTimeout) {
            clearTimeout(renameDebounceTimeout);
            renameDebounceTimeout = null;
        }
    },
    setStatus,
    closeModal,
    refreshPatternList,
    logError: (err) => console.error(err),
});

configureArrangementList({
    getListElement: () => dom.arrangementList,
    getEntriesCache: () => appState.arrangementEntriesCache,
    setEntriesCache: (entries) => { appState.arrangementEntriesCache = entries; },
    normalizeScope,
    isDemoMode: () => DEMO_MODE,
    getDemoArrangementFiles: () => Array.from(demoArrangementSourceByFile.keys()),
    listArrangements,
    getFolderState: () => arrangementFolderState,
    setFolderState: (nextState) => { arrangementFolderState = nextState; },
    saveFolderState: (state) => saveFolderState(ARRANGEMENT_FOLDER_STATE_KEY, state),
    isDeveloperModeEnabled,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    loadArrangement: (filename) => loadArrangement(filename),
    deleteArrangement: (filename) => deleteArrangement(filename),
    createIcons,
    icons,
    escapeHtml,
    setStatus,
    logError: (...args) => console.error(...args),
    isArrangementPreviewPlaying,
    getArrangementPreviewPlayingFilename: () => arrangementPreviewPlayingFilename,
    attachVisualizer,
});

configureArrangementPersistence({
    isDemoMode: () => DEMO_MODE,
    getCurrentArrangementScope: () => appState.currentArrangementScope,
    isDeveloperModeEnabled,
    normalizeScope,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getArrangementDraftState: () => appState.arrangementDraftState,
    getArrangementEntry,
    saveArrangement,
    getDeveloperModeHeaders,
    getEntriesCache: () => appState.arrangementEntriesCache,
    setStatus,
    logError: (...args) => console.error(...args),
    getAutoSaveTimeout: () => arrangementAutoSaveTimeout,
    setAutoSaveTimeout: (timeout) => { arrangementAutoSaveTimeout = timeout; },
    dispatchStateChanged: (detail) => {
        document.dispatchEvent(new CustomEvent('arrangements:stateChanged', { detail }));
    },
});

configureArrangementPreview({
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    buildArrangementStatePayload,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    resolveTrackerStateChannelInstruments,
    getArrangementInstrumentList,
    primeArrangementPreviewBuffer,
    getPlaybackMixSettings,
    getPrimeTimeoutId: () => arrangementPreviewPrimeTimeoutId,
    setPrimeTimeoutId: (timeoutId) => { arrangementPreviewPrimeTimeoutId = timeoutId; },
});

configureArrangementController({
    isDemoMode: () => DEMO_MODE,
    setStatus,
    logError: (...args) => console.error(...args),
    logWarn: (...args) => console.warn(...args),
    normalizeScope,
    getArrangementEntry,
    isDeveloperModeEnabled,
    confirmDialog,
    deleteArrangementByFilename,
    getDeveloperModeHeaders,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    setCurrentArrangementFilename: (filename) => { appState.currentArrangementFilename = filename; },
    setCurrentArrangementScope: (scope) => { appState.currentArrangementScope = scope; },
    setArrangementDraftState: (state) => { appState.arrangementDraftState = state; },
    setActiveArrangementBlockFilename: (filename) => { appState.activeArrangementBlockFilename = filename; },
    showWelcome,
    refreshArrangementList,
    refreshBlocksLibrary,
    listArrangementsOrEmpty,
    createArrangement,
    saveBlock,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    setSelectedBlockForArrangement: (filename, blockFilename) => { arrangementSelectedBlockByArrangement[filename] = blockFilename; },
    renderArrangementWorkspace,
    renderTrackerWorkspace,
    buildArrangementStatePayload,
    scheduleArrangementAutoSave,
    emitArrangementStateChanged,
    setTrackerWorkspaceLoadedFilename: (filename) => { trackerWorkspaceLoadedFilename = filename; },
    stopAllPlaybackForSelectionChange,
    dispatchArrangementPreview: (detail) => {
        document.dispatchEvent(new CustomEvent('arrangements:preview', { detail }));
    },
    getArrangementReadonly,
    listArrangements,
    renameArrangementFile,
    saveCurrentArrangement,
    getArrangementPreviewPlayingFilename: () => arrangementPreviewPlayingFilename,
    setArrangementPreviewPlayingFilename: (filename) => { arrangementPreviewPlayingFilename = filename; },
    getSelectedBlockForArrangement: (filename) => arrangementSelectedBlockByArrangement[filename],
    moveSelectedBlockForArrangement: (oldFilename, newFilename) => {
        arrangementSelectedBlockByArrangement[newFilename] = arrangementSelectedBlockByArrangement[oldFilename];
        delete arrangementSelectedBlockByArrangement[oldFilename];
    },
    clearArrangementRenameDebounceTimeout: () => { arrangementRenameDebounceTimeout = null; },
    getArrangementWorkspaceNameInput: () => document.getElementById('arrangementWorkspaceName'),
    getArrangementOrNull,
    readUnsavedArrangementState,
    cloneArrangementState,
    clearArrangementWorkspacePlayheadVisuals,
    refreshArrangementListActiveState,
    updateArrangementWorkspacePreviewButtonState,
    showArrangementWorkspace,
    scheduleArrangementPreviewPrime,
    normalizePatternBaseName,
    getArrangementEntriesCache: () => appState.arrangementEntriesCache,
    getCurrentArrangementDraftState: () => appState.arrangementDraftState,
    getCurrentArrangementScope: () => appState.currentArrangementScope,
    getNewArrangementNameInput: () => dom.newArrangementName,
    getNewArrangementModal: () => dom.newArrangementModal,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearArrangementAutoSaveTimeout: () => {
        if (arrangementAutoSaveTimeout) {
            clearTimeout(arrangementAutoSaveTimeout);
            arrangementAutoSaveTimeout = null;
        }
    },
});

configureArrangementWorkspace({
    closeExportMenu,
    getWelcomeView: () => dom.welcomeView,
    getEditorContainer: () => dom.editorContainer,
    getArrangementWorkspace: () => dom.arrangementWorkspace,
    getMainHeader: () => dom.mainHeader,
    getMainFooter: () => dom.mainFooter,
    getSidebarTitle: () => dom.sidebarTitle,
    getPatternNameInput: () => dom.patternNameInput,
    updatePatternSelectionState,
    updateArrangementSelectionState,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    updateArrangementInstrumentUsage,
    setExportControlsDisabled,
    refreshZzfxmPreviewControlsVisibility,
    updateAdvancedSettingsButtonsVisibility,
    updateFooterExportActionLabels,
    updateArrangementListScopeVisualizer,
    createIcons,
    icons,
    getArrangementWorkspacePane: () => dom.arrangementWorkspacePane,
    isArrangementPreviewPlaying,
    getArrangementPreviewPlayingFilename: () => arrangementPreviewPlayingFilename,
    getArrangementWorkspacePlayingRowIndex: () => arrangementWorkspacePlayingRowIndex,
    setArrangementWorkspacePlayingRowIndex: (value) => { arrangementWorkspacePlayingRowIndex = value; },
    getArrangementWorkspacePlayhead: () => arrangementWorkspacePlayhead,
    setArrangementWorkspacePlayhead: (value) => { arrangementWorkspacePlayhead = value; },
    getAppState: () => appState,
    getArrangementReadonly,
    normalizeScope,
    escapeHtml,
    isDemoMode: () => DEMO_MODE,
    setStatus,
    updateArrangementDisplayName,
    scheduleArrangementAutoSave,
    emitArrangementStateChanged,
    saveCurrentArrangement,
    renameArrangement,
    setupScrubInteraction,
    getRenameDebounceTimeout: () => arrangementRenameDebounceTimeout,
    setRenameDebounceTimeout: (timeout) => { arrangementRenameDebounceTimeout = timeout; },
    getCurrentArrangementScope: () => appState.currentArrangementScope,
    dispatchResourceScopeOpen: (detail) => {
        document.dispatchEvent(new CustomEvent('resource-scope:open', { detail }));
    },
    renderTrackerWorkspace,
    confirmDialog,
    applyArrangementPreviewAfterBlockRemoved,
    stopArrangementPreview,
    dispatchArrangementPreviewState: (detail) => {
        document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail }));
    },
    stopAllPlaybackForSelectionChange,
    buildArrangementStatePayload,
    dispatchArrangementPreview: (detail) => {
        document.dispatchEvent(new CustomEvent('arrangements:preview', { detail }));
    },
    createUntitledBlock,
    setActiveArrangementBlockFilename: (filename) => { appState.activeArrangementBlockFilename = filename; },
    getActiveArrangementBlockFilename: () => appState.activeArrangementBlockFilename,
    getSelectedBlockForArrangement: (filename) => arrangementSelectedBlockByArrangement[filename],
    setSelectedBlockForArrangement: (filename, blockFilename) => { arrangementSelectedBlockByArrangement[filename] = blockFilename; },
    getBlockByFilename,
    getArrangementDraftState: () => appState.arrangementDraftState,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    setBlocksLibraryCache: (nextCache) => { appState.blocksLibraryCache = nextCache; },
    matchMedia: (query) => window.matchMedia(query),
});

configureArrangementExportContext({
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getArrangementDraftState: () => appState.arrangementDraftState,
    buildArrangementStatePayload,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    isDemoMode: () => DEMO_MODE,
    getDemoBlockSource: (filename) => demoBlockSourceByFile.get(filename),
    parseBlockSource,
    normalizeScope,
    getBlockDetailOrNull,
    resolveTrackerStateChannelInstruments,
    updateInstrumentUsage,
    getDefragmentedInstruments: async () => {
        const { getDefragmentedInstruments } = await import('./instrument-manager.js');
        return getDefragmentedInstruments();
    },
});

configureArrangementPreviewRuntime({
    isArrangementPreviewPlaying,
    getArrangementPreviewPlayingFilename: () => arrangementPreviewPlayingFilename,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getArrangementPreviewContext: () => arrangementPreviewContext,
    setArrangementPreviewContext: (value) => { arrangementPreviewContext = value; },
    clearArrangementLiveOverride,
    clearArrangementPendingLiveSwap,
    buildArrangementStatePayload,
    getPlaybackMixSettings,
    updateArrangementPreview,
    clearPlaybackInstrumentAliases,
    setPlaybackInstrumentAliases,
    getLastArrangementPlaybackInstrumentSignature: () => lastArrangementPlaybackInstrumentSignature,
    setLastArrangementPlaybackInstrumentSignature: (value) => { lastArrangementPlaybackInstrumentSignature = value; },
    getArrangementWorkspacePlayhead: () => arrangementWorkspacePlayhead,
});

configureArrangementPreviewEvents({
    getArrangementPreviewPlayingFilename: () => arrangementPreviewPlayingFilename,
    setArrangementPreviewPlayingFilename: (value) => { arrangementPreviewPlayingFilename = value; },
    getArrangementPreviewContext: () => arrangementPreviewContext,
    setArrangementPreviewContext: (value) => { arrangementPreviewContext = value; },
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    buildArrangementStatePayload,
    getPlaybackMixSettings,
    getArrangementInstrumentList,
    resolveTrackerStateChannelInstruments,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    setBlocksLibraryCache: (nextCache) => { appState.blocksLibraryCache = nextCache; },
    getBlockDetailOrNull,
    setStatus,
    startArrangementPreview,
    stopArrangementPreview,
    isArrangementPreviewPlaying,
    updateArrangementPreview,
    clearArrangementLiveOverride,
    updateArrangementPlaybackInstrumentAliases,
    getArrangementWorkspacePlayhead: () => arrangementWorkspacePlayhead,
    updateArrangementWorkspaceChipSteps,
    applyArrangementWorkspacePlayhead,
    updateArrangementListScopeVisualizer,
    updateArrangementWorkspacePreviewButtonState,
    clearArrangementWorkspacePlayheadVisuals,
    clearArrangementPlaybackInstrumentAliases,
});

configureInstrumentReferenceSync({
    getDeveloperModeHeaders,
    refreshPatternList,
    isDemoMode: () => DEMO_MODE,
});

configureDevMode({
    isDemoMode: () => DEMO_MODE,
    getDom: () => dom,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
});

configureStatusBar({
    getDom: () => dom,
    escapeHtml,
    createIcons,
    icons,
});
installStatusEventListener();

const PATTERN_FOLDER_STATE_KEY = 'zzfxm-folder-state-patterns-v1';
/** Default: user folder open, system collapsed. User toggles are persisted and restored on next launch. */
let patternFolderState = loadFolderState(PATTERN_FOLDER_STATE_KEY, { user: true, system: false });

const ARRANGEMENT_FOLDER_STATE_KEY = 'zzfxm-folder-state-arrangements-v1';
let arrangementFolderState = loadFolderState(ARRANGEMENT_FOLDER_STATE_KEY, { user: true, system: false });

const COLOR_THEME_KEY = 'zzfxm-color-theme';
// Apply saved theme or default to Phantom when none saved (non-destructive: html:root keeps original default)
(function applyInitialColorTheme() {
    try {
        let saved = localStorage.getItem(COLOR_THEME_KEY);
        if (saved === 'legacy' || saved === 'gotham') {
            saved = 'jester';
            localStorage.setItem(COLOR_THEME_KEY, 'jester');
        }
        if (saved === 'crusader') {
            saved = 'jester';
            localStorage.setItem(COLOR_THEME_KEY, 'jester');
        }
        if (saved === 'romulan') {
            saved = 'phantom';
            localStorage.setItem(COLOR_THEME_KEY, 'phantom');
        }
        if (saved === null) {
            document.documentElement.setAttribute('data-theme', 'phantom');
            localStorage.setItem(COLOR_THEME_KEY, 'phantom');
        } else if (saved !== '') {
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    } catch (_e) { /* ignore */ }
})();

function normalizeScope(value) {
    return value === 'system' ? 'system' : 'user';
}

function loadFolderState(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { ...fallback };
        const parsed = JSON.parse(raw);
        return {
            user: typeof parsed?.user === 'boolean' ? parsed.user : fallback.user,
            system: typeof parsed?.system === 'boolean' ? parsed.system : fallback.system,
        };
    } catch (_e) {
        return { ...fallback };
    }
}

function saveFolderState(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_e) {
        // Ignore localStorage failures.
    }
}

// --- View State Helpers ---
function stopAllPlaybackForSelectionChange() {
    try {
        if (dom.repl.editor?.repl?.scheduler?.started) {
            dom.repl.editor.stop();
            updatePlayState(false);
        }
    } catch (_e) {
        // Ignore stop errors.
    }

    if (isPreviewPlaying) {
        stopZzfxmSong();
        updatePreviewPlayButton(false);
    }

    stopTrackerPreviewPlayback();
    if (isArrangementPreviewPlaying()) {
        stopArrangementPreview();
    }
    arrangementPreviewPlayingFilename = null;
    clearArrangementWorkspacePlayheadVisuals();
    clearPlaybackInstrumentAliases('tracker-preview');
    clearArrangementPlaybackInstrumentAliases();
}

function refreshZzfxmPreviewControlsVisibility() {
    const hasExportedData = Boolean(lastExportedData);
    const matchesPattern = hasExportedData
        && lastExportedContext.type === 'pattern'
        && Boolean(appState.currentPatternFilename)
        && lastExportedContext.filename === appState.currentPatternFilename
        && !isArrangementWorkspaceActive();
    const matchesArrangement = hasExportedData
        && lastExportedContext.type === 'arrangement'
        && Boolean(appState.currentArrangementFilename)
        && lastExportedContext.filename === appState.currentArrangementFilename
        && isArrangementWorkspaceActive();
    const shouldShow = matchesPattern || matchesArrangement;

    if (dom.previewPlayBtn) {
        dom.previewPlayBtn.style.display = shouldShow ? '' : 'none';
        dom.previewPlayBtn.disabled = !shouldShow;
    }
    if (dom.showJsonBtn) {
        dom.showJsonBtn.style.display = shouldShow ? '' : 'none';
        dom.showJsonBtn.disabled = !shouldShow;
    }
}

function setZzfxmPreviewData(songData, meta = null, { type, filename, reveal = true } = {}) {
    lastExportedData = songData || null;
    lastExportedMeta = meta || null;
    lastExportedContext = {
        type: type || null,
        filename: filename || null,
    };
    if (songData) {
        renderSongDataPreview();
    }
    if (reveal) {
        refreshZzfxmPreviewControlsVisibility();
    }
}

function clearZzfxmPreviewData({ placeholder = '// Click GENERATE to create ZzFXTrack Player data' } = {}) {
    if (isPreviewPlaying) {
        stopZzfxmSong();
        updatePreviewPlayButton(false);
    }
    lastExportedData = null;
    lastExportedMeta = null;
    lastExportedContext = { type: null, filename: null };
    dom.previewJson.innerText = placeholder;
    refreshZzfxmPreviewControlsVisibility();
}

function updateFooterExportActionLabels() {
    const arrangementMode = isArrangementWorkspaceActive();
    if (dom.exportBtnLabel) {
        dom.exportBtnLabel.textContent = 'Export';
    }
    if (dom.exportMenuTitle) {
        dom.exportMenuTitle.textContent = arrangementMode ? 'Export Arrangement to...' : 'Export Pattern to...';
    }
    if (dom.exportBtn) {
        dom.exportBtn.title = arrangementMode ? 'Export arrangement' : 'Export pattern';
        dom.exportBtn.classList.toggle('export-arrangement-mode', arrangementMode);
    }
    if (dom.exportJsonBtn) {
        dom.exportJsonBtn.title = arrangementMode ? 'Export arrangement to ZzFXTrack JSON' : 'Export pattern to ZzFXTrack JSON';
    }
    if (dom.exportWavBtn) {
        dom.exportWavBtn.title = arrangementMode ? 'Download arrangement mix as WAV' : 'Download pattern mix as WAV';
    }
}

function closeExportMenu() {
    if (dom.exportMenu) dom.exportMenu.classList.add('hidden');
    if (dom.exportBtn) dom.exportBtn.setAttribute('aria-expanded', 'false');
}

function openExportMenu() {
    if (!dom.exportMenu || !dom.exportBtn || dom.exportBtn.disabled) return;
    dom.exportMenu.classList.remove('hidden');
    dom.exportBtn.setAttribute('aria-expanded', 'true');
    dom.exportJsonBtn?.focus();
}

function toggleExportMenu() {
    if (!dom.exportMenu || !dom.exportBtn || dom.exportBtn.disabled) return;
    const isOpen = !dom.exportMenu.classList.contains('hidden');
    if (isOpen) closeExportMenu();
    else openExportMenu();
}

function setExportControlsDisabled(disabled) {
    if (dom.exportBtn) dom.exportBtn.disabled = disabled;
    if (dom.exportJsonBtn) dom.exportJsonBtn.disabled = disabled;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = disabled;
    if (disabled) closeExportMenu();
}

function showWelcome() {
    closeExportMenu();
    undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.add('footer-intro-mode');
    }
    dom.playBtn.style.visibility = 'hidden';
    setExportControlsDisabled(true);
    
    updatePatternSelectionState(false);
    dom.previewPlayBtn.style.display = 'none';
    dom.previewPlayBtn.disabled = true;
    if(dom.showJsonBtn) {
        dom.showJsonBtn.style.display = 'none';
        dom.showJsonBtn.disabled = true;
    }
    updateAdvancedSettingsButtonsVisibility();
    
    // Clear state
    appState.currentPatternFilename = null;
    appState.currentPatternScope = 'user';
    appState.currentArrangementFilename = null;
    appState.currentArrangementScope = 'user';
    appState.arrangementDraftState = null;
    appState.activeArrangementBlockFilename = null;
    playingPatternFilename = null;
    dom.patternNameInput.classList.add('hidden');
    if(dom.repl.editor) dom.repl.editor.stop();
    renderPlayButton();
    updatePatternListVisualizer();
    
    // Clear preview
    clearZzfxmPreviewData({ placeholder: '' });

    // No highlight on initial load or when returning to welcome with no pattern
    dom.sidebarTitle?.classList.remove('active');
    refreshArrangementListActiveState();
    renderArrangementWorkspace();
    updateFooterExportActionLabels();
}

function handleSidebarTitleClick() {
    // If introduction is visible and a pattern is selected, return to that pattern; otherwise show introduction.
    if (dom.sidebarTitle?.classList.contains('active') && appState.currentPatternFilename) {
        showEditor();
    } else {
        showIntroduction();
    }
}

function showIntroduction() {
    closeExportMenu();
    // If no pattern is loaded, the introduction view is also the "empty" state.
    if (!appState.currentPatternFilename) {
        showWelcome();
        return;
    }

    undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.add('footer-intro-mode');
    }
    dom.patternNameInput.classList.add('hidden');
    updateArrangementSelectionState(false);
    updateAdvancedSettingsButtonsVisibility();

    // Keep controls available so the user can stop playback while reading intro.
    dom.playBtn.style.visibility = 'visible';
    setExportControlsDisabled(false);

    renderPlayButton();
    updatePatternListVisualizer();

    // Remove selection highlight from pattern list when introduction page is selected
    Array.from(dom.patternList.querySelectorAll('.list-item')).forEach((li) => li.classList.remove('active'));
    dom.sidebarTitle?.classList.add('active');
    refreshZzfxmPreviewControlsVisibility();
    updateFooterExportActionLabels();
}

function isTrackerDocked() {
    const trackerModal = document.getElementById('trackerModal');
    return Boolean(
        trackerModal?.classList.contains('workspace-docked')
        && dom.trackerWorkspacePane
        && trackerModal.parentElement === dom.trackerWorkspacePane
    );
}

function showEditor() {
    closeExportMenu();
    // When switching to pattern editor, do not undock the tracker if it is docked and playing.
    // Playback should only stop when the user clicks Play on the pattern (togglePlay → stopAllPlaybackForSelectionChange).
    if (!isTrackerDocked()) {
        undockTrackerModalFromWorkspace();
    }
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'flex';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.remove('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.remove('footer-intro-mode');
    }
    updateArrangementSelectionState(false);
    dom.playBtn.style.visibility = 'visible';
    setExportControlsDisabled(false);
    dom.patternNameInput.classList.remove('hidden');
    updatePatternSelectionState(!!appState.currentPatternFilename);
    refreshZzfxmPreviewControlsVisibility();
    updateAdvancedSettingsButtonsVisibility();
    dom.sidebarTitle?.classList.remove('active');
    updateFooterExportActionLabels();
}

/** True when the arrangement workspace is the currently visible main content (footer/export reflect arrangement context). */
function isArrangementWorkspaceActive() {
    return Boolean(dom.arrangementWorkspace && dom.arrangementWorkspace.style.display === 'flex');
}

function dockTrackerModalToWorkspace() {
    const trackerModal = document.getElementById('trackerModal');
    if (!trackerModal || !dom.trackerWorkspacePane) return null;

    const alreadyDocked = trackerModal.classList.contains('workspace-docked')
        && trackerModal.parentElement === dom.trackerWorkspacePane;
    if (alreadyDocked) return trackerModal;

    if (!trackerDockRestoreParent) {
        trackerDockRestoreParent = trackerModal.parentElement;
        trackerDockRestoreNextSibling = trackerModal.nextElementSibling;
    }

    dom.trackerWorkspacePane.innerHTML = '';
    trackerModal.classList.add('workspace-docked');
    dom.trackerWorkspacePane.appendChild(trackerModal);
    return trackerModal;
}

function undockTrackerModalFromWorkspace() {
    const trackerModal = document.getElementById('trackerModal');
    if (!trackerModal || !trackerModal.classList.contains('workspace-docked')) return;

    trackerModal.classList.remove('workspace-docked');
    trackerModal.classList.remove('open');
    const restoreParent = trackerDockRestoreParent || document.body;
    if (trackerDockRestoreNextSibling && trackerDockRestoreNextSibling.parentElement === restoreParent) {
        restoreParent.insertBefore(trackerModal, trackerDockRestoreNextSibling);
    } else {
        restoreParent.appendChild(trackerModal);
    }
    trackerDockRestoreParent = null;
    trackerDockRestoreNextSibling = null;
}

// --- Initialization ---
async function init() {
    setStatus('Initializing...', 'normal');
    
    // Disable default samples (TidalCycles/Dirt) to ensure only ZzFX instruments are used
    dom.repl.prelude = `
// ZzFXTrack
// Default samples are disabled.
// Only ZzFX instruments defined in instruments.js are available.
`;
    
    // 1. Initialize Strudel Core
    await initStrudel();
    
    // 2. Load ZzFX Instruments into Strudel Registry
    loadZzFXInstruments(staticInstruments);
    
    // 3. Load Pattern List
    await refreshPatternList();
    await refreshArrangementList();
    await refreshBlocksLibrary();
    if (DEMO_MODE && dom.newPatternBtn) {
        dom.newPatternBtn.style.display = 'none';
    }
    if (dom.demoModeBadge) {
        dom.demoModeBadge.hidden = !DEMO_MODE;
        dom.demoModeBadge.style.display = DEMO_MODE ? 'inline-flex' : 'none';
        dom.demoModeBadge.classList.toggle('hidden', !DEMO_MODE);
    }
    updateDevModeToolbarLabelVisibility();
    
    // 4. Initialize Instrument UI
    await initInstrumentUI();
    
    // 5. Reload instruments from localStorage (in case they differ from static file)
    await reloadInstruments();
    
    // 6. Setup auto-save on input
    setupPatternEditorAutosave();
    
    // 6b. Intercept external links
    setupExternalLinkInterception();
    
    // Start in Welcome State
    showWelcome();
    
    // Clear status - no pattern loaded yet
    setStatus('');

    // 7. Initialize Icons
    // 7. Initialize Icons
    createIcons({ icons });

    // 8. Theme sync and scope run in step 12 before hiding overlay to avoid late flash

    // 9. Initialize Tracker
    initTrackerWithInstruments();
    setupTrackerEventListeners();
    
    // 10. Initialize Blocks
    initBlocks();
    setupBlocksEventListeners();

    // 11. iPad/touch: single-tap activation for list items (Patterns, Arrangements, Instruments, Blocks)
    setupListTouchActivation();

    // 12. Apply Strudel theme scope and sync colors, then hide init overlay (reduces flash)
    setTimeout(() => {
        scopeStrudelThemeVarsToRepl();
        syncThemeColors();
        hideInitOverlay();
    }, 150);
}

/**
 * Extract Strudel/CodeMirror theme colors (specifically .ͼ11 / string color)
 * and apply them to the sidebar instrument highlights.
 */
function syncThemeColors() {
    // Try to find an element with the .ͼ11 class (created by Strudel/CM)
    // or a string token in the editor
    const stringSpan = document.querySelector('.cm-content span[class*="ͼ11"], .cm-content span[class*="Accepted"]'); 
    // Note: The class name ͼ11 is generated and might vary, but user specified it.
    // Ideally we look for a span that IS a string.
    
    // Fallback: Check for ANY span that looks like a string (e.g. green in OneDark)
    // We scan spans in the editor
    let color = null;
    
    // 1. Direct class lookup (High specificity based on user request)
    const exactMatch = document.querySelector('.ͼ11');
    if (exactMatch) {
       color = getComputedStyle(exactMatch).color;
    } 
    
    // 2. Token lookup (More robust)
    if (!color) {
        const spans = document.querySelectorAll('.cm-content span');
        // Look for a span that contains a known string delimiter like "
        for (const span of spans) {
             const text = span.innerText;
             // Strudel strings usually start with " or '
             if (text.match(/^["'].*["']$/) || span.classList.contains('ͼ11')) {
                 color = getComputedStyle(span).color;
                 break;
             }
        }
    }

    if (color) {
        console.log('[ThemeSync] Found Strudel string color:', color);
        document.documentElement.style.setProperty('--strudel-inst-color', color);
        
        // Calculate glow (same color, lower opacity)
        // Convert rgb(r, g, b) to rgba(r, g, b, alpha)
        if (color.startsWith('rgb')) {
             const rgbValues = color.match(/\d+/g).join(', ');
             const glowColor = `rgba(${rgbValues}, 0.4)`;
             const dimColor = `rgba(${rgbValues}, 0.5)`;
             document.documentElement.style.setProperty('--strudel-inst-color-glow', glowColor);
        }
    }
}

registerBeforeUnloadConfirmer(() => {
    if (DEMO_MODE) return false;
    if (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled()) return false;
    return Boolean(autoSaveTimeout && appState.currentPatternFilename);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;
    if (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled()) return;
    if (!(autoSaveTimeout && appState.currentPatternFilename)) return;

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;

    const editorCode = dom.repl.editor?.code || '';
    const fileCode = editorToFile(editorCode);

    // Use sendBeacon for reliable delivery even as page closes.
    // Note: sendBeacon cannot send custom headers, so for developer mode (which needs a header)
    // we use fetch({ keepalive: true }) instead.
    if (appState.currentPatternScope === 'system' && isDeveloperModeEnabled()) {
        savePatternSourceKeepalive(appState.currentPatternFilename, fileCode, getDeveloperModeHeaders()).catch(() => {});
    } else {
        sendPatternSourceBeacon(appState.currentPatternFilename, fileCode);
    }

    // Also keep in localStorage as backup
    try {
        localStorage.setItem(`unsaved_${appState.currentPatternFilename}`, editorCode);
    } catch (_e) {
        // Ignore storage failures.
    }
});

registerBeforeUnloadConfirmer(() => {
    if (DEMO_MODE) return false;
    if (arrangementAutoSaveTimeout && appState.currentArrangementFilename && !getArrangementReadonly()) return true;
    return Boolean(trackerAutoSaveTimeout && pendingTrackerSavePayload);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;

    if (arrangementAutoSaveTimeout && appState.currentArrangementFilename && !getArrangementReadonly()) {
        clearTimeout(arrangementAutoSaveTimeout);
        arrangementAutoSaveTimeout = null;
        const arrangementState = buildArrangementStatePayload();
        const payload = {
            name: arrangementState.name,
            arrangementState,
            scope: appState.currentArrangementScope,
        };
        saveArrangementKeepalive(appState.currentArrangementFilename, payload, getDeveloperModeHeaders()).catch(() => {});
        try {
            localStorage.setItem(`unsaved_arrangement_${appState.currentArrangementFilename}`, JSON.stringify(arrangementState));
        } catch (_e) {
            // Ignore storage failures.
        }
    }

    if (trackerAutoSaveTimeout && pendingTrackerSavePayload) {
        clearTimeout(trackerAutoSaveTimeout);
        trackerAutoSaveTimeout = null;
        const payload = pendingTrackerSavePayload;
        pendingTrackerSavePayload = null;
        saveBlockDetailKeepalive(payload.filename, payload, getDeveloperModeHeaders()).catch(() => {});
        try {
            localStorage.setItem(`unsaved_block_${payload.filename}`, JSON.stringify(payload.trackerState || {}));
        } catch (_e) {
            // Ignore storage failures.
        }
    }
});

// --- API Interactions ---

function readUnsavedBlockTrackerState(filename, scope) {
    if (!filename || !canRecoverUnsavedForScope(scope)) return null;
    const storageKey = `unsaved_block_${filename}`;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (_e) {
        try {
            localStorage.removeItem(storageKey);
        } catch (_err) {
            // Ignore storage failures.
        }
        return null;
    }
}

function getBlockByFilename(filename) {
    return appState.blocksLibraryCache.find((block) => block.filename === filename) || null;
}


function scheduleTrackerAutoSave({ filename, trackerState, name: nameOverride, pattern: patternOverride, immediate }) {
    if (!filename || !trackerState || DEMO_MODE) return;
    const block = getBlockByFilename(filename);
    if (!block) return;
    if (normalizeScope(block.scope) === 'system' && !isDeveloperModeEnabled()) return;

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
        scope: normalizeScope(block.scope),
        filename,
    };

    pendingTrackerSavePayload = payload;

    if (trackerAutoSaveTimeout) {
        clearTimeout(trackerAutoSaveTimeout);
        trackerAutoSaveTimeout = null;
    }

    const runSave = async () => {
        const activePayload = pendingTrackerSavePayload;
        pendingTrackerSavePayload = null;
        trackerAutoSaveTimeout = null;
        if (!activePayload) return;
        const blockNow = getBlockByFilename(activePayload.filename);
        if (blockNow && normalizeScope(blockNow.scope) === 'system' && !isDeveloperModeEnabled()) return;
        try {
            // Use the same update logic as explicit saves so renames also update the filename on disk.
            const result = await updateBlock(
                activePayload.filename,
                activePayload.name,
                activePayload.description,
                activePayload.pattern,
                activePayload.trackerState,
                activePayload.scope,
            );
            if (!result || result.ok === false) {
                throw new Error(result?.error || 'Autosave failed');
            }
            const updatedFilename = result.filename || activePayload.filename;
            const previousFilename = result.previousFilename || activePayload.filename;
            try {
                localStorage.removeItem(`unsaved_block_${previousFilename}`);
            } catch (_e) {
                // Ignore storage failures.
            }
            // If the block filename changed (due to rename), update in-memory references used by the workspace.
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
                    appState.activeArrangementBlockFilename = updatedFilename;
                    if (appState.currentArrangementFilename) {
                        arrangementSelectedBlockByArrangement[appState.currentArrangementFilename] = updatedFilename;
                    }
                }
            }
            // Keep the blocks library cache in sync before re-rendering workspaces,
            // so getBlockByFilename(appState.activeArrangementBlockFilename) can resolve the renamed block.
            await refreshBlocksLibrary();
            renderArrangementWorkspace();
            renderTrackerWorkspace();
        } catch (err) {
            console.error('[Tracker] Autosave failed:', err);
            try {
                localStorage.setItem(`unsaved_block_${activePayload.filename}`, JSON.stringify(activePayload.trackerState || {}));
            } catch (_e) {
                // Ignore storage failures.
            }
            setStatus(err.message === 'System block is read-only' ? err.message : 'Failed to autosave block', 'error');
        }
    };

    if (immediate) {
        void runSave();
    } else {
        trackerAutoSaveTimeout = setTimeout(runSave, 200);
    }
}

function renderTrackerWorkspace() {
    if (!dom.trackerWorkspacePane) return;
    const selectedBlock = appState.activeArrangementBlockFilename ? getBlockByFilename(appState.activeArrangementBlockFilename) : null;
    if (!selectedBlock) {
        trackerWorkspaceLoadedFilename = null;
        trackerWorkspaceLoadToken += 1;
        if (isTrackerOpen()) {
            closeTracker();
        }
        undockTrackerModalFromWorkspace();
        dom.trackerWorkspacePane.innerHTML = `
            <div class="h-full p-4 text-sm text-muted-foreground">
                Select a block from the arrangement or the library to open it in tracker.
            </div>
        `;
        return;
    }

    dockTrackerModalToWorkspace();
    const shouldReload = trackerWorkspaceLoadedFilename !== selectedBlock.filename || !isTrackerOpen();
    if (!shouldReload) return;

    trackerWorkspaceLoadedFilename = selectedBlock.filename;
    trackerWorkspaceLoadToken += 1;
    const loadToken = trackerWorkspaceLoadToken;
    openTrackerModalForEdit(selectedBlock, selectedBlock.trackerState || null, {
        autoSaveOnInput: true,
        returnToArrangementsOnClose: false,
        returnToBlocksOnClose: false,
    }).then(() => {
        if (loadToken !== trackerWorkspaceLoadToken) return;
        const trackerModal = document.getElementById('trackerModal');
        if (!trackerModal?.classList.contains('workspace-docked')) return;
        const trackerHeader = trackerModal.querySelector('h2');
        if (trackerHeader) {
            trackerHeader.textContent = selectedBlock.name || selectedBlock.filename.replace(/\.js$/i, '');
            trackerHeader.draggable = true;
            if (!trackerHeader.dataset.arrTitleDragSetup) {
                trackerHeader.dataset.arrTitleDragSetup = '1';
                trackerHeader.addEventListener('dragstart', (e) => {
                    const filename = appState.activeArrangementBlockFilename;
                    if (!filename || !e.dataTransfer) return;
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify({ filename }));
                    e.dataTransfer.setData('text/plain', filename);
                });
            }
        }
    }).catch((err) => {
        if (loadToken !== trackerWorkspaceLoadToken) return;
        console.error('[Tracker] Failed to load block in workspace:', err);
        setStatus('Failed to open tracker block', 'error');
    });
}

function renderBlocksLibraryFromCache() {
    if (!dom.blocksLibraryList) return;
    dom.blocksLibraryList.innerHTML = '';

    if (!appState.blocksLibraryCache.length) {
        dom.blocksLibraryList.innerHTML = '<div class="text-xs text-muted-foreground px-2 py-2">No blocks available.</div>';
        return;
    }

    const blockFolderState = loadFolderState(BLOCKS_FOLDER_STATE_KEY, { user: true, system: false });

    const appendFolder = (scope, label, entries) => {
            const isEmpty = entries.length === 0;
            const expanded = isEmpty
                ? true
                : (scope === 'system' ? blockFolderState.system : blockFolderState.user);
            const icon = expanded ? 'chevron-down' : 'chevron-right';
            const folder = document.createElement('div');
            folder.className = 'mb-0 py-px';
            folder.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-block-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${icon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${entries.length}</span>
                </button>
                <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-block-folder-items="${scope}"></div>
            `;
            const list = folder.querySelector(`[data-block-folder-items="${scope}"]`);
            folder.querySelector(`[data-block-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
                const next = { ...blockFolderState };
                if (scope === 'system') {
                    next.system = !next.system;
                } else {
                    next.user = !next.user;
                }
                saveFolderState(BLOCKS_FOLDER_STATE_KEY, next);
                renderBlocksLibraryFromCache();
            });

            if (entries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'No user blocks yet. Click "+ New" to create one.'
                    : 'No system blocks available.';
                list?.appendChild(empty);
            }

            entries.forEach((block) => {
                const li = document.createElement('div');
                const isSelected = block.filename === appState.activeArrangementBlockFilename;
                li.className = `list-item ${isSelected ? 'active' : ''}`;
                li.dataset.filename = block.filename;
                const isReadonly = normalizeScope(block.scope) === 'system' && !isDeveloperModeEnabled();
                li.innerHTML = `
                    <span class="font-medium text-xs">${escapeHtml(block.name || block.filename.replace(/\.js$/i, ''))}</span>
                    ${isReadonly ? '' : `<div class="list-item-actions"><button class="sidebar-del-btn" title="Delete ${escapeHtml(block.name || block.filename)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`}
                `;
                li.draggable = true;
                li.addEventListener('dragstart', (e) => {
                    if (e.target.closest('button')) return;
                    if (!e.dataTransfer) return;
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify({ filename: block.filename }));
                    e.dataTransfer.setData('text/plain', block.filename);
                });
                li.addEventListener('click', async () => {
                    document.getElementById('trackerBlockName')?.blur();
                    flushTrackerSaveForBlockSwitch();
                    appState.activeArrangementBlockFilename = block.filename;
                    if (appState.currentArrangementFilename) arrangementSelectedBlockByArrangement[appState.currentArrangementFilename] = block.filename;
                    renderArrangementWorkspace();
                    renderTrackerWorkspace();
                });
                li.querySelector('.sidebar-del-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteBlockFromLibrary(block.filename, block.name || block.filename);
                });
                list?.appendChild(li);
            });

            dom.blocksLibraryList.appendChild(folder);
        };

        const sorted = appState.blocksLibraryCache
            .slice()
            .sort((a, b) => String(a?.name || a?.filename || '').localeCompare(String(b?.name || b?.filename || '')));
        const userEntries = sorted.filter((b) => normalizeScope(b.scope) !== 'system');
        const systemEntries = sorted.filter((b) => normalizeScope(b.scope) === 'system');
        appendFolder('user', 'User', userEntries);
        appendFolder('system', 'System', systemEntries);

        createIcons({ icons });
}

async function refreshBlocksLibrary() {
    if (!dom.blocksLibraryList) return;
    try {
        const previousBlocksByFilename = new Map(
            (Array.isArray(appState.blocksLibraryCache) ? appState.blocksLibraryCache : [])
                .filter((block) => block?.filename)
                .map((block) => [block.filename, block])
        );
        const list = DEMO_MODE
            ? Array.from(demoBlockSourceByFile.keys()).map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'system', trackerState: null }))
            : await listBlocksOrEmpty();
        appState.blocksLibraryCache = (Array.isArray(list) ? list : []).map((block) => {
            const previous = previousBlocksByFilename.get(block?.filename);
            if (!previous) return block;
            return {
                ...previous,
                ...block,
                description: block?.description ?? previous.description,
                pattern: block?.pattern ?? previous.pattern,
                trackerState: block?.trackerState ?? previous.trackerState,
            };
        });
        renderBlocksLibraryFromCache();
    } catch (err) {
        console.error('[Blocks] Failed to refresh library:', err);
        dom.blocksLibraryList.innerHTML = '<div class="text-xs text-destructive px-2 py-2">Failed to load block library.</div>';
    }
}

/**
 * Update arrangement display name in cache and sidebar list (no save). Only updates if name changed.
 */
function updateArrangementDisplayName(filename, newName) {
    if (!filename || !dom.arrangementList) return;
    const entry = appState.arrangementEntriesCache.find((e) => e.filename === filename);
    const prevName = entry?.name ?? '';
    const name = String(newName ?? '').trim() || filename.replace(/\.js$/i, '');
    if (name === prevName) return;
    if (entry) entry.name = name;
    try {
        const li = dom.arrangementList.querySelector(`.list-item[data-filename="${CSS.escape(filename)}"]`);
        const span = li?.querySelector('.font-medium');
        if (span) span.textContent = name;
    } catch (_e) {
        // fallback if CSS.escape not available
        dom.arrangementList.querySelectorAll('.list-item[data-filename]').forEach((li) => {
            if (li.dataset.filename === filename) {
                const span = li.querySelector('.font-medium');
                if (span) span.textContent = name;
            }
        });
    }
}

/**
 * Update block display name in cache, blocks library list, and arrangement chips (no save).
 */
function updateBlockDisplayName(filename, name) {
    if (!filename || name == null) return;
    const block = appState.blocksLibraryCache.find((b) => b.filename === filename);
    if (block) block.name = name;
    const displayName = String(name || filename.replace(/\.js$/i, ''));
    dom.blocksLibraryList?.querySelectorAll('.list-item[data-filename]').forEach((li) => {
        if (li.dataset.filename === filename) {
            const span = li.querySelector('.font-medium');
            if (span) span.textContent = displayName;
        }
    });
    dom.arrangementWorkspacePane?.querySelectorAll('.arr-chip[data-filename]').forEach((chip) => {
        if (chip.dataset.filename === filename) {
            const label = chip.querySelector('.arr-chip-label');
            if (label) label.textContent = displayName;
        }
    });
}

function getArrangementReferencesForBlock(filename) {
    const refs = [];
    appState.arrangementEntriesCache.forEach((entry) => {
        if (entry?.arrangementState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
            refs.push(entry);
        }
    });
    if (appState.currentArrangementFilename && appState.arrangementDraftState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
        const already = refs.some((entry) => entry.filename === appState.currentArrangementFilename);
        if (!already) {
            refs.push({
                filename: appState.currentArrangementFilename,
                name: appState.arrangementDraftState.name,
                scope: appState.currentArrangementScope,
            });
        }
    }
    return refs;
}

async function deleteBlockFromLibrary(filename, displayName) {
    if (!filename || DEMO_MODE) return;
    const block = getBlockByFilename(filename);
    if (normalizeScope(block?.scope) === 'system' && !isDeveloperModeEnabled()) {
        setStatus('System blocks are immutable', 'normal');
        return;
    }

    const refs = getArrangementReferencesForBlock(filename);
    if (refs.length) {
        const list = refs.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ');
        await alertDialog({
            title: 'Cannot Delete Block',
            message: `This block is used in arrangements:\n${list}`,
        });
        return;
    }

    const confirmed = await confirmDialog({
        title: 'Delete Block?',
        message: `Delete block "${displayName}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
    });
    if (!confirmed) return;

    try {
        const deleteResult = await deleteBlockByFilenameWithConflictInfo(filename, getDeveloperModeHeaders());
        if (!deleteResult.ok && deleteResult.status === 409) {
            const list = deleteResult.usedBy.length
                ? deleteResult.usedBy.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ')
                : 'one or more arrangements';
            await alertDialog({
                title: 'Cannot Delete Block',
                message: `This block is used in arrangements:\n${list}`,
            });
            return;
        }
        if (appState.activeArrangementBlockFilename === filename) {
            appState.activeArrangementBlockFilename = null;
            renderTrackerWorkspace();
        }
        await refreshBlocksLibrary();
        setStatus('Block deleted', 'success');
    } catch (err) {
        console.error('[Blocks] Delete failed:', err);
        setStatus('Failed to delete block', 'error');
    }
}

function getPlaybackMixSettings() {
    return sanitizePlaybackMixSettings({
        targetPeak: dom.playbackTargetPeak?.value,
        masterGainDb: dom.playbackMasterGainDb?.value,
        softClipDrive: dom.playbackSoftClipDrive?.value,
    });
}

function getWavExportSettings() {
    const sampleRate = parseInt(dom.wavSampleRate?.value, 10);
    const bitDepth = parseInt(dom.wavBitDepth?.value, 10);
    return {
        sampleRate: [8000, 11025, 16000, 22050, 32000, 44100, 48000].includes(sampleRate) ? sampleRate : 44100,
        bitDepth: [8, 16, 24].includes(bitDepth) ? bitDepth : 16,
    };
}

/** Snapshot of Mixing settings modal form state for Cancel/revert and dirty check. */
function getExportSettingsSnapshot() {
    const resolutionChecked = document.querySelector('input[name="exportResolution"]:checked');
    return {
        limitChannels: Boolean(dom.limitChannels?.checked),
        maxChannelsInput: String(dom.maxChannelsInput?.value ?? '16'),
        normalizeLayers: Boolean(dom.normalizeLayers?.checked),
        playbackLoudnessPreset: String(dom.playbackLoudnessPreset?.value ?? 'balanced'),
        playbackTargetPeak: String(dom.playbackTargetPeak?.value ?? '0.5'),
        playbackMasterGainDb: String(dom.playbackMasterGainDb?.value ?? '3'),
        playbackSoftClipDrive: String(dom.playbackSoftClipDrive?.value ?? '1.4'),
        exportResolution: resolutionChecked ? String(resolutionChecked.value) : '96',
        exportResolutionCustom: String(dom.exportResolutionCustom?.value ?? '96'),
        simpleExport: Boolean(dom.simpleExport?.checked),
        wavSampleRate: String(dom.wavSampleRate?.value ?? '44100'),
        wavBitDepth: String(dom.wavBitDepth?.value ?? '16'),
    };
}

function applyExportSettingsSnapshot(snap) {
    if (!snap) return;
    if (dom.limitChannels) dom.limitChannels.checked = Boolean(snap.limitChannels);
    if (dom.maxChannelsInput) dom.maxChannelsInput.value = snap.maxChannelsInput;
    if (dom.channelLimitGroup) dom.channelLimitGroup.classList.toggle('hidden', !snap.limitChannels);
    if (dom.maxChannelsInput) dom.maxChannelsInput.disabled = !snap.limitChannels;
    if (dom.normalizeLayers) dom.normalizeLayers.checked = Boolean(snap.normalizeLayers);
    if (dom.playbackLoudnessPreset) dom.playbackLoudnessPreset.value = snap.playbackLoudnessPreset;
    if (dom.playbackTargetPeak) dom.playbackTargetPeak.value = snap.playbackTargetPeak;
    if (dom.playbackMasterGainDb) dom.playbackMasterGainDb.value = snap.playbackMasterGainDb;
    if (dom.playbackSoftClipDrive) dom.playbackSoftClipDrive.value = snap.playbackSoftClipDrive;
    const resolutionInputs = document.querySelectorAll('input[name="exportResolution"]');
    resolutionInputs.forEach((input) => {
        input.checked = input.value === snap.exportResolution;
    });
    if (dom.exportResolutionCustom) dom.exportResolutionCustom.value = snap.exportResolutionCustom;
    if (dom.exportResolutionHint) dom.exportResolutionHint.style.display = snap.exportResolution === '48' ? 'block' : 'none';
    if (dom.exportResolutionCustomWrap) dom.exportResolutionCustomWrap.classList.toggle('hidden', snap.exportResolution !== 'custom');
    if (dom.simpleExport) dom.simpleExport.checked = Boolean(snap.simpleExport);
    if (dom.wavSampleRate) dom.wavSampleRate.value = snap.wavSampleRate;
    if (dom.wavBitDepth) dom.wavBitDepth.value = snap.wavBitDepth;
}

function hasExportSettingsChanges() {
    const current = getExportSettingsSnapshot();
    if (!exportSettingsSnapshot) return false;
    return (
        current.limitChannels !== exportSettingsSnapshot.limitChannels ||
        current.maxChannelsInput !== exportSettingsSnapshot.maxChannelsInput ||
        current.normalizeLayers !== exportSettingsSnapshot.normalizeLayers ||
        current.playbackLoudnessPreset !== exportSettingsSnapshot.playbackLoudnessPreset ||
        current.playbackTargetPeak !== exportSettingsSnapshot.playbackTargetPeak ||
        current.playbackMasterGainDb !== exportSettingsSnapshot.playbackMasterGainDb ||
        current.playbackSoftClipDrive !== exportSettingsSnapshot.playbackSoftClipDrive ||
        current.exportResolution !== exportSettingsSnapshot.exportResolution ||
        current.exportResolutionCustom !== exportSettingsSnapshot.exportResolutionCustom ||
        current.simpleExport !== exportSettingsSnapshot.simpleExport ||
        current.wavSampleRate !== exportSettingsSnapshot.wavSampleRate ||
        current.wavBitDepth !== exportSettingsSnapshot.wavBitDepth
    );
}

let exportSettingsSnapshot = null;

function normalizePlaybackPresetId(value) {
    const key = String(value || '').trim();
    if (!key || key === 'custom') return key || null;
    return Object.prototype.hasOwnProperty.call(PLAYBACK_LOUDNESS_PRESETS, key) ? key : null;
}

function approxEqual(a, b, epsilon = 1e-6) {
    return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function inferPlaybackPresetId(settings) {
    const clean = sanitizePlaybackMixSettings(settings);
    const entries = Object.entries(PLAYBACK_LOUDNESS_PRESETS);
    for (const [presetId, presetSettings] of entries) {
        const p = sanitizePlaybackMixSettings(presetSettings);
        if (
            approxEqual(clean.targetPeak, p.targetPeak)
            && approxEqual(clean.masterGainDb, p.masterGainDb)
            && approxEqual(clean.softClipDrive, p.softClipDrive)
        ) {
            return presetId;
        }
    }
    return 'custom';
}

function applyPlaybackMixSettingsToInputs(settings) {
    const clean = sanitizePlaybackMixSettings(settings);
    if (dom.playbackTargetPeak) dom.playbackTargetPeak.value = String(clean.targetPeak);
    if (dom.playbackMasterGainDb) dom.playbackMasterGainDb.value = String(clean.masterGainDb);
    if (dom.playbackSoftClipDrive) dom.playbackSoftClipDrive.value = String(clean.softClipDrive);
    // Keep preview-side mix state in sync when previews are idle; active previews are refreshed elsewhere.
    if (!isArrangementPreviewPlaying() && !isTrackerPreviewPlaying()) {
        updateArrangementPreview({ mixSettings: clean });
    }
}

function setPlaybackPresetControl(presetId) {
    if (!dom.playbackLoudnessPreset) return;
    const normalized = normalizePlaybackPresetId(presetId) || 'custom';
    dom.playbackLoudnessPreset.value = normalized;
}

// async function deleteCurrentPattern() removed for new custom modal implementation below

// --- BAKING LOGIC ---

async function exportCurrentPattern(options = {}) {
    const { revealZzfxmPreview = true } = options;
    if (!appState.currentPatternFilename) return;
    
    validateCodeForExport(dom.repl.editor.code, {
        setStatus,
        getStatusText: () => dom.statusMsg?.innerText || '',
    });
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        const confirmed = await confirmDialog({
            title: 'Export With Warnings?',
            message: 'This code uses functions that ZzFXTrack Player format ignores (e.g. reverb/delay). Export anyway?',
            confirmLabel: 'Export',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
    }

    const code = dom.repl.editor.code;
    let bpmEarly = 120;
    const bpmMatch = code.match(/(?:const|let|var)\s+bpm\s*=\s*(\d+)/);
    if (bpmMatch) bpmEarly = Number(bpmMatch[1]);
    const inferredCycles = inferArrangeCyclesFromCode(code);
    const baseExportCycles = Number.isFinite(inferredCycles) && inferredCycles > 0 ? inferredCycles : 4;

    if (shouldWarnExportLength(baseExportCycles, bpmEarly)) {
        const resolutionInputPat = document.querySelector('input[name="exportResolution"]:checked');
        let rowsPerCyclePat = 96;
        if (resolutionInputPat?.value === '48') rowsPerCyclePat = 48;
        else if (resolutionInputPat?.value === 'custom') {
            const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
            if (parsed && !Number.isNaN(parsed)) rowsPerCyclePat = parsed;
        }
        const { array: instrumentsPat } = await getInstrumentsForExporter();
        const limitEnabledPat = dom.limitChannels?.checked;
        const channelCountPat = limitEnabledPat ? (parseInt(dom.maxChannelsInput?.value, 10) || 16) : 24;
        const durationSec = getExportDurationSeconds(baseExportCycles, bpmEarly);
        const estimatedBytes = estimateExportSizeBytes(baseExportCycles, rowsPerCyclePat, instrumentsPat?.length ?? 0, channelCountPat);
        const message = buildExportLengthWarningMessage({
            durationSec,
            cycles: baseExportCycles,
            bpm: bpmEarly,
            estimatedSizeText: formatExportSize(estimatedBytes),
        });
        const confirmed = await confirmDialog({
            title: 'Warning',
            message,
            confirmLabel: 'Proceed',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
    }

    setStatus('Exporting...');
    
    try {
        // Save first (good practice)
        await saveCurrentPattern();
        
        // Use the live pattern from the scheduler!
        // This avoids file cache issues or import delays.
        const editor = dom.repl.editor;
        
        // Ensure latest code is evaluated, but do not start Strudel playback.
        // Strudel's underlying repl supports a "start" flag (used internally for drawFirstFrame()).
        await editor.repl.evaluate(code, false);
        
        // Get pattern
        const pattern = editor.repl.scheduler.pattern;
        
        if (!pattern) throw new Error('No pattern found. Try playing the pattern first?');
        
        // Get BPM from text (since it's a variable, not on the pattern object)
        let bpm = 120;
        const match = code.match(/(?:const|let|var)\s+bpm\s*=\s*(\d+)/);
        if (match) bpm = Number(match[1]);
        
        // 3. Get dynamic instruments from manager
        const { array: instrumentArray, mapping: instrumentMapping, monophonicByIndex } = await getInstrumentsForExporter();
        
        // 4. Get export settings
        const isLimitEnabled = dom.limitChannels.checked;
        const maxChannels = isLimitEnabled ? (parseInt(dom.maxChannelsInput.value) || 16) : Infinity;
        const normalizeLayers = dom.normalizeLayers?.checked || false;
        const resolutionInput = document.querySelector('input[name="exportResolution"]:checked');
        let rowsPerCycle = 96;
        if (resolutionInput?.value === '48') {
            rowsPerCycle = 48;
        } else if (resolutionInput?.value === 'custom') {
            const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
            if (parsed && !Number.isNaN(parsed)) rowsPerCycle = parsed;
        }
        
        // 5. Export! If arrange([...]) is present, prefer summed arrangement cycles (e.g. 4+4+16=24)
        const inferredArrangeCycles = inferArrangeCyclesFromCode(code);
        const isArrangementSong = Number.isFinite(inferredArrangeCycles) && inferredArrangeCycles > 0;
        // Non-arrangement fallback defaults to 4 cycles (typical one-phrase loop);
        // arrangements override with explicit summed cycles from arrange([...]).
        const baseExportCycles = inferredArrangeCycles || 4;
        const result = exportPattern(pattern, bpm, instrumentArray, instrumentMapping, baseExportCycles, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers,
            rowsPerCycle,
            monophonicByInstrumentIndex: monophonicByIndex,
            forceCycles: isArrangementSong ? inferredArrangeCycles : null
        });
        const rawSong = result.song;
        const exportData = { song: rawSong, mix: getPlaybackMixSettings() };
        const {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases = []
        } = result.stats;
        
        // Store for preview
        setZzfxmPreviewData(exportData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'pattern',
            filename: appState.currentPatternFilename,
            reveal: revealZzfxmPreview,
        });
        
        // 4. Send JSON to server (local mode only)
        const jsonFilename = appState.currentPatternFilename.replace('.js', '.json');
        await saveExportedSongFiles(jsonFilename, exportData);
        
        // Show and enable ZzFXTrack Player preview buttons only for explicit ZzFXTrack Player export flow.
        if (revealZzfxmPreview) {
            refreshZzfxmPreviewControlsVisibility();
        }
        
        // Build status message with channel count
        let statusMsg = `/output/${jsonFilename} (${channelCount} ch)`;
        if (droppedNotes > 0) {
            statusMsg += ` • ${droppedNotes} notes dropped`;
        }
        if (unknownInstrumentNotes > 0) {
            const incompatibleList = unknownInstrumentAliases.length
                ? unknownInstrumentAliases.join(', ')
                : `${unknownInstrumentNotes} unknown`;
            dom.statusMsg.innerHTML = `${escapeHtml(statusMsg)} • <span class="text-destructive">Incompatible sounds: ${escapeHtml(incompatibleList)}</span>`;
            dom.statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
            dom.statusMsg.classList.add('status-normal');
            dom.statusMsg.style.opacity = '1';
            if (dom.footerStatusRow) {
                const r = dom.footerStatusRow;
                r.classList.remove('is-expanded');
                void r.offsetHeight;
                r.classList.add('is-expanded');
            }
            clearStatusAfter();
        } else {
            if (DEMO_MODE) {
                statusMsg += ' • Demo mode: not written to /output';
            }
            setStatus(statusMsg, 'success');
        }
        
    } catch (e) {
        console.error(e);
        setStatus(`Export failed: ${e.message}`, 'error');
    }
}


async function updateBlockScope(filename, scope) {
    const detail = await getBlockDetailOrNull(filename);
    if (!detail) throw new Error('Failed to load block details');
    await saveBlockDetail(filename, {
        name: detail?.name || filename.replace(/\.js$/, ''),
        description: detail?.description || '',
        pattern: detail?.pattern || '',
        trackerState: detail?.trackerState ?? null,
        scope: normalizeScope(scope),
    });
}

async function updateArrangementScope(filename, scope) {
    const detail = await getArrangement(filename);
    await saveArrangement(filename, {
        name: detail?.name || filename.replace(/\.js$/, ''),
        arrangementState: detail?.arrangementState ?? null,
        scope: normalizeScope(scope),
    });
}

function openAdvancedSettingsModal(context) {
    if (!context) return;
    pendingAdvancedSettingsContext = {
        ...context,
        scope: normalizeScope(context.scope),
    };
    const typeLabel = String(context.type || 'resource');
    const resourceName = String(context.name || context.filename || context.id || '').trim();
    if (dom.advancedSettingsTitle) {
        dom.advancedSettingsTitle.textContent = 'Advanced settings';
    }
    if (dom.advancedSettingsResourceLabel) {
        dom.advancedSettingsResourceLabel.textContent = resourceName
            ? `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}: ${resourceName}`
            : `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}`;
    }
    const devMode = isDeveloperModeEnabled();
    if (dom.advancedSettingsSystemToggle) {
        dom.advancedSettingsSystemToggle.checked = pendingAdvancedSettingsContext.scope === 'system';
        dom.advancedSettingsSystemToggle.disabled = DEMO_MODE || !devMode;
    }
    if (dom.advancedSettingsSystemLockIcon) {
        dom.advancedSettingsSystemLockIcon.classList.toggle('hidden', devMode);
    }
    if (dom.advancedSettingsSystemLabel) {
        dom.advancedSettingsSystemLabel.classList.toggle('text-muted-foreground', !devMode);
        dom.advancedSettingsSystemLabel.classList.toggle('text-foreground', devMode);
    }
    if (dom.saveAdvancedSettingsBtn) {
        dom.saveAdvancedSettingsBtn.disabled = DEMO_MODE;
    }
    dom.advancedSettingsModal?.classList.add('open');
    createIcons({ icons });
}

function closeAdvancedSettingsModal() {
    dom.advancedSettingsModal?.classList.remove('open');
    pendingAdvancedSettingsContext = null;
}

async function applyAdvancedSettings() {
    if (!pendingAdvancedSettingsContext) return;
    if (DEMO_MODE) {
        setStatus('Demo mode: updating system visibility is disabled', 'normal');
        closeAdvancedSettingsModal();
        return;
    }
    const nextScope = dom.advancedSettingsSystemToggle?.checked ? 'system' : 'user';
    if (nextScope === 'system' && !isDeveloperModeEnabled()) {
        setStatus('Enable developer mode to set resource as system', 'normal');
        return;
    }
    const context = pendingAdvancedSettingsContext;

    try {
        if (context.type === 'pattern') {
            if (!context.filename) throw new Error('No pattern selected');
            await updatePatternScope(context.filename, nextScope);
            const entry = getPatternEntry(context.filename);
            if (entry) entry.scope = nextScope;
                if (context.filename === appState.currentPatternFilename) {
                    appState.currentPatternScope = nextScope;
                    dom.patternNameInput.readOnly = DEMO_MODE || (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled());
                }
            await refreshPatternList();
        } else if (context.type === 'instrument') {
            if (!context.id) throw new Error('No instrument selected');
            const updated = setInstrumentScope(context.id, nextScope);
            if (!updated) throw new Error('Failed to update instrument scope');
            autoUpdateInstrumentsFile();
            reloadInstruments();
            refreshInstrumentListUI();
        } else if (context.type === 'block') {
            if (context.filename) {
                await updateBlockScope(context.filename, nextScope);
            }
            await refreshBlocksLibrary();
        } else if (context.type === 'arrangement') {
            if (context.filename) {
                await updateArrangementScope(context.filename, nextScope);
                if (context.filename === appState.currentArrangementFilename) {
                    appState.currentArrangementScope = nextScope;
                }
            }
            await refreshArrangementList();
            renderArrangementWorkspace();
        } else {
            throw new Error('Unsupported resource type');
        }

        document.dispatchEvent(new CustomEvent('resource-scope:changed', {
            detail: {
                ...context,
                scope: nextScope,
            }
        }));
        setStatus('Advanced settings updated', 'success');
        closeAdvancedSettingsModal();
    } catch (e) {
        console.error(e);
        setStatus(`Failed to update settings: ${e.message}`, 'error');
    }
}

function openModal() {
    dom.newPatternModal.classList.add('open');
    dom.newPatternName.focus();
}

function triggerFileDownload(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = decodeURIComponent(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function resampleLinear(input, sourceRate, targetRate) {
    if (!(input instanceof Float32Array) || input.length === 0) return new Float32Array();
    if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || sourceRate <= 0 || targetRate <= 0 || sourceRate === targetRate) {
        return input;
    }
    const ratio = targetRate / sourceRate;
    const outputLength = Math.max(1, Math.round(input.length * ratio));
    const output = new Float32Array(outputLength);
    const invRatio = sourceRate / targetRate;
    for (let i = 0; i < outputLength; i++) {
        const srcPos = i * invRatio;
        const srcIndex = Math.floor(srcPos);
        const frac = srcPos - srcIndex;
        const s0 = input[srcIndex] ?? 0;
        const s1 = input[Math.min(srcIndex + 1, input.length - 1)] ?? s0;
        output[i] = s0 + (s1 - s0) * frac;
    }
    return output;
}

function encodeWavMono(samples, sampleRate, bitDepth = 16) {
    const depth = bitDepth === 8 ? 8 : (bitDepth === 24 ? 24 : 16);
    const bytesPerSample = depth / 8;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const channels = 1;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const writeString = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, depth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        if (depth === 8) {
            const v = Math.round((s * 0.5 + 0.5) * 255);
            view.setUint8(offset, Math.min(255, Math.max(0, v)));
            offset += 1;
        } else if (depth === 16) {
            const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
            view.setInt16(offset, v, true);
            offset += 2;
        } else {
            const v = s < 0 ? Math.round(s * 0x800000) : Math.round(s * 0x7fffff);
            view.setUint8(offset, v & 0xff);
            view.setUint8(offset + 1, (v >> 8) & 0xff);
            view.setUint8(offset + 2, (v >> 16) & 0xff);
            offset += 3;
        }
    }

    return buffer;
}

async function exportCurrentPatternWav() {
    if (!appState.currentPatternFilename) return;

    await exportCurrentPattern({ revealZzfxmPreview: false });
    if (!lastExportedData) {
        setStatus('WAV export failed: no pattern data generated.', 'error');
        return;
    }

    try {
        const wavSettings = getWavExportSettings();
        const mixSettings = getPlaybackMixSettings();
        const pcm44k = buildSong(lastExportedData, { ...(lastExportedMeta || {}), ...mixSettings });
        if (!(pcm44k instanceof Float32Array) || pcm44k.length === 0) {
            throw new Error('Could not render PCM audio');
        }

        const pcm = wavSettings.sampleRate === 44100
            ? pcm44k
            : resampleLinear(pcm44k, 44100, wavSettings.sampleRate);
        const wavBuffer = encodeWavMono(pcm, wavSettings.sampleRate, wavSettings.bitDepth);
        const wavName = appState.currentPatternFilename.replace(/\.js$/i, '.wav');
        triggerFileDownload(wavName, new Blob([wavBuffer], { type: 'audio/wav' }), 'audio/wav');
        setStatus(`Downloaded WAV: ${wavName} (${wavSettings.sampleRate} Hz, ${wavSettings.bitDepth}-bit)`, 'success');
    } catch (e) {
        console.error(e);
        setStatus(`WAV export failed: ${e.message}`, 'error');
    }
}

async function exportCurrentArrangement() {
    if (!appState.currentArrangementFilename || !appState.arrangementDraftState) return;

    try {
        await saveCurrentArrangement();
        const context = await buildArrangementExportContext();
        if (!context) {
            setStatus('Arrangement export failed: no arrangement selected.', 'error');
            return;
        }
        const arrangementState = context.arrangementState;
        const bpm = arrangementState.bpm || context.bpm || 120;
        const rows = Array.isArray(arrangementState.rows) ? arrangementState.rows : [];
        const arrangementCycles = rows.reduce((sum, row) => {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            return sum + repeats;
        }, 0);

        // Export length warning: duration > 5 min or high cycle count
        const resolutionInputArr = document.querySelector('input[name="exportResolution"]:checked');
        let rowsPerCycleForWarning = 96;
        if (resolutionInputArr?.value === '48') rowsPerCycleForWarning = 48;
        else if (resolutionInputArr?.value === 'custom') {
            const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
            if (parsed && !Number.isNaN(parsed)) rowsPerCycleForWarning = parsed;
        }
        const { array: instrumentsForCount } = await getInstrumentsForExporter();
        const limitEnabledArr = dom.limitChannels?.checked;
        const channelCountForWarning = limitEnabledArr ? (parseInt(dom.maxChannelsInput?.value, 10) || 16) : 24;
        if (shouldWarnExportLength(arrangementCycles, bpm)) {
            const durationSec = getExportDurationSeconds(arrangementCycles, bpm);
            const estimatedBytes = estimateExportSizeBytes(arrangementCycles, rowsPerCycleForWarning, instrumentsForCount?.length ?? 0, channelCountForWarning);
            const message = buildExportLengthWarningMessage({
                durationSec,
                cycles: arrangementCycles,
                bpm,
                estimatedSizeText: formatExportSize(estimatedBytes),
            });
            const confirmed = await confirmDialog({
                title: 'Warning',
                message,
                confirmLabel: 'Proceed',
                cancelLabel: 'Cancel',
                variant: 'danger',
            });
            if (!confirmed) {
                setStatus('');
                return;
            }
        }

        const toVarSlug = (str) => slugify(str, { fallback: 'x', maxLength: 40 });

        const blockByFilename = new Map(context.blocks.map((block) => [block.filename, block]));
        const blockVarByFilename = {};
        const usedVarNames = new Set();
        const nextVar = (base) => {
            let candidate = base;
            let n = 2;
            while (usedVarNames.has(candidate)) {
                candidate = `${base}_${n}`;
                n += 1;
            }
            usedVarNames.add(candidate);
            return candidate;
        };

        const wantedBlockFiles = Array.from(new Set(
            rows.flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
        ));
        const blockDeclarations = [];
        for (const filename of wantedBlockFiles) {
            const block = blockByFilename.get(filename);
            if (!block) continue;
            const baseVar = `block_${toVarSlug(filename.replace(/\.js$/i, ''))}`;
            const varName = nextVar(baseVar);
            blockVarByFilename[filename] = varName;

            let scaledPattern = String(block.pattern || '').trim() || 'silence';
            const stepsInt = block?.trackerState?.steps;
            if (scaledPattern !== 'silence' && Number.isInteger(stepsInt) && stepsInt !== 16) {
                const stepFactor = stepsInt / 16;
                if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                    scaledPattern = `(${scaledPattern}).slow(${Number(stepFactor.toFixed(4))})`;
                }
            }
            blockDeclarations.push(`const ${varName} = ${scaledPattern};`);
        }

        const arrangeLines = rows.map((row) => {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            const vars = (Array.isArray(row?.blocks) ? row.blocks : [])
                .map((filename) => blockVarByFilename[filename])
                .filter(Boolean);
            if (!vars.length) return `  [${repeats}, silence]`;
            return `  [${repeats}, stack(${vars.join(', ')})]`;
        });

        const arrangementCode = [
            `const bpm = ${Math.max(20, Math.min(300, bpm))};`,
            'setcps(bpm/240);',
            '',
            ...(blockDeclarations.length ? blockDeclarations : ['const block_silence = silence;']),
            '',
            'const arrangement_pattern = arrange(',
            arrangeLines.join(',\n'),
            ');',
            '',
            'arrangement_pattern',
        ].join('\n');

        // Cumulative cycle index at the start of each row (for per-row pattern slicing)
        const rowCycleBoundaries = [0];
        for (const row of rows) {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            rowCycleBoundaries.push(rowCycleBoundaries[rowCycleBoundaries.length - 1] + repeats);
        }

        const editor = dom.repl.editor;
        await editor.repl.evaluate(arrangementCode, false);
        const pattern = editor.repl.scheduler.pattern;
        if (!pattern) throw new Error('No arrangement pattern found');

        // Only include instruments that are used in this arrangement (from blocks' channelInstruments)
        const usedAliases = new Set();
        for (const block of context.blocks) {
            const ts = block.trackerState || context.trackerStateByFilename[block.filename];
            if (ts && Array.isArray(ts.channelInstruments)) {
                ts.channelInstruments.forEach((id) => { if (id) usedAliases.add(id); });
            }
        }
        const fullList = getDefragmentedInstruments();
        const {
            array: fullInstrumentArray,
            mapping: fullMapping,
            monophonicByIndex: fullMonophonic,
        } = await getInstrumentsForExporter();
        const usedIndices = [];
        fullList.forEach((inst, i) => {
            if (usedAliases.has(inst.strudelAlias)) usedIndices.push(i);
        });
        const instrumentArray = usedIndices.length > 0
            ? usedIndices.map((i) => fullInstrumentArray[i])
            : fullInstrumentArray;
        const instrumentMapping = usedIndices.length > 0
            ? Object.fromEntries(usedIndices.map((oldIdx, newIdx) => [fullList[oldIdx].strudelAlias, newIdx]))
            : fullMapping;
        const monophonicByIndex = usedIndices.length > 0
            ? usedIndices.map((i) => fullMonophonic[i])
            : fullMonophonic;

        const isLimitEnabled = dom.limitChannels.checked;
        const maxChannels = isLimitEnabled ? (parseInt(dom.maxChannelsInput.value, 10) || 16) : Infinity;
        const normalizeLayers = dom.normalizeLayers?.checked || false;
        const resolutionInput = document.querySelector('input[name="exportResolution"]:checked');
        let rowsPerCycle = 96;
        if (resolutionInput?.value === '48') {
            rowsPerCycle = 48;
        } else if (resolutionInput?.value === 'custom') {
            const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
            if (parsed && !Number.isNaN(parsed)) rowsPerCycle = parsed;
        }

        const result = exportPattern(pattern, bpm, instrumentArray, instrumentMapping, arrangementCycles || 4, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers,
            rowsPerCycle,
            monophonicByInstrumentIndex: monophonicByIndex,
            forceCycles: arrangementCycles || null,
            rowCycleBoundaries: rowCycleBoundaries.length >= 2 ? rowCycleBoundaries : null,
            simpleExport: Boolean(dom.simpleExport?.checked),
        });
        const rawSong = result.song;
        const exportData = { song: rawSong, mix: getPlaybackMixSettings() };
        const {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases = [],
        } = result.stats;

        setZzfxmPreviewData(exportData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'arrangement',
            filename: appState.currentArrangementFilename,
            reveal: true,
        });

        const jsonFilename = appState.currentArrangementFilename.replace(/\.js$/i, '.json');
        await saveExportedSongFiles(jsonFilename, exportData);

        let statusMsg = `/output/${jsonFilename} (${channelCount} ch)`;
        if (droppedNotes > 0) {
            statusMsg += ` • ${droppedNotes} notes dropped`;
        }
        if (unknownInstrumentNotes > 0) {
            const incompatibleList = unknownInstrumentAliases.length
                ? unknownInstrumentAliases.join(', ')
                : `${unknownInstrumentNotes} unknown`;
            setStatus(`${statusMsg} • Incompatible sounds: ${incompatibleList}`, 'error');
        } else if (DEMO_MODE) {
            setStatus(`${statusMsg} • Demo mode: not written to /output`, 'success');
        } else {
            setStatus(statusMsg, 'success');
        }
    } catch (e) {
        console.error(e);
        setStatus(`Arrangement export failed: ${e.message}`, 'error');
    }
}

async function exportCurrentArrangementWav() {
    if (!appState.currentArrangementFilename || !appState.arrangementDraftState) return;

    try {
        await saveCurrentArrangement();
        const context = await buildArrangementExportContext();
        if (!context) {
            setStatus('WAV export failed: no arrangement selected.', 'error');
            return;
        }

        const renderResult = renderArrangementStateForExport(
            context.arrangementState,
            context.trackerStateByFilename,
            context.instrumentList,
            context.bpm,
            { mixSettings: getPlaybackMixSettings() }
        );
        if (!renderResult?.mixBuffer?.length) {
            throw new Error('Arrangement has no playable tracker blocks');
        }

        const wavSettings = getWavExportSettings();
        const pcm = wavSettings.sampleRate === renderResult.sampleRate
            ? renderResult.mixBuffer
            : resampleLinear(renderResult.mixBuffer, renderResult.sampleRate, wavSettings.sampleRate);
        const wavBuffer = encodeWavMono(pcm, wavSettings.sampleRate, wavSettings.bitDepth);
        const wavName = appState.currentArrangementFilename.replace(/\.js$/i, '.wav');
        triggerFileDownload(wavName, new Blob([wavBuffer], { type: 'audio/wav' }), 'audio/wav');
        setStatus(`Downloaded WAV: ${wavName} (${wavSettings.sampleRate} Hz, ${wavSettings.bitDepth}-bit)`, 'success');
    } catch (e) {
        console.error(e);
        setStatus(`Arrangement WAV export failed: ${e.message}`, 'error');
    }
}

function buildBlockSourceFromApi(item) {
    const name = item?.name || 'Block';
    const description = item?.description || '';
    const pattern = item?.pattern || '';
    const trackerState = item?.trackerState ?? null;
    const scope = normalizeScope(item?.scope);
    return `// Block: ${name}
// ${description || 'No description'}

export const name = "${String(name).replace(/"/g, '\\"')}";
export const description = "${String(description).replace(/"/g, '\\"')}";
export const scope = "${scope}";

export const pattern = \`${String(pattern).replace(/`/g, '\\`')}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;
}

function buildArrangementSourceFromApi(item) {
    const name = item?.name || 'Arrangement';
    const arrangementState = item?.arrangementState ?? null;
    const scope = normalizeScope(item?.scope);
    return `// Arrangement: ${name}

export const name = "${String(name).replace(/"/g, '\\"')}";
export const scope = "${scope}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;
}

function parseBlockSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const descMatch = content.match(/export\s+const\s+description\s*=\s*["']([^"']*)["']/);
    const scopeMatch = content.match(/export\s+const\s+scope\s*=\s*["']([^"']+)["']/);
    const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*([`"'])([\s\S]*?)\1\s*;?/);
    const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\})\s*;/);

    let trackerState = null;
    if (trackerStateMatch) {
        try { trackerState = JSON.parse(trackerStateMatch[1]); } catch (_e) { trackerState = null; }
    }

    return {
        name: nameMatch ? nameMatch[1] : 'Block',
        description: descMatch ? descMatch[1] : '',
        scope: normalizeScope(scopeMatch ? scopeMatch[1] : 'user'),
        pattern: patternMatch ? patternMatch[2].trim() : '',
        trackerState
    };
}

function parseArrangementSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const scopeMatch = content.match(/export\s+const\s+scope\s*=\s*["']([^"']+)["']/);
    const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
    let arrangementState = { version: 1, name: nameMatch ? nameMatch[1] : 'Arrangement', bpm: 120, rows: [] };
    if (arrangementStateMatch) {
        try { arrangementState = JSON.parse(arrangementStateMatch[1]); } catch (_e) { /* keep fallback */ }
    }
    return {
        name: nameMatch ? nameMatch[1] : arrangementState?.name || 'Arrangement',
        scope: normalizeScope(scopeMatch ? scopeMatch[1] : 'user'),
        arrangementState
    };
}

async function getInstrumentsFileContent() {
    const cached = sessionStorage.getItem('instruments-js-content');
    if (cached && cached.trim()) {
        return cached;
    }

    const res = await fetch('/instruments.js');
    if (!res.ok) return '';
    const fileCode = await res.text();
    return fileCode.trim() ? fileCode : '';
}

async function downloadPatternsAndInstruments() {
    try {
        const zip = new JSZip();

        let downloadedInstruments = 0;
        const instrumentsContent = await getInstrumentsFileContent();
        if (instrumentsContent) {
            zip.file('instruments.js', instrumentsContent);
            downloadedInstruments = 1;
        }

        const files = DEMO_MODE
            ? Array.from(demoPatternSourceByFile.keys()).sort()
            : normalizePatternEntries(await listPatterns()).map((entry) => entry.filename);

        let downloadedPatterns = 0;
        for (const filename of files) {
            let fileCode = '';
            if (filename === appState.currentPatternFilename && dom.repl.editor?.code) {
                fileCode = editorToFile(dom.repl.editor.code);
            } else if (DEMO_MODE) {
                fileCode = demoPatternSourceByFile.get(filename) || '';
            } else {
                fileCode = await getPatternSourceOrEmpty(filename);
                if (!fileCode.trim()) continue;
            }

            if (!fileCode.trim()) continue;
            zip.file(`patterns/${decodeURIComponent(filename)}`, fileCode);
            downloadedPatterns++;

            if (DEMO_MODE) {
                const metaFilename = filename.replace(/\.js$/i, '.meta.json');
                zip.file(`patterns/${decodeURIComponent(metaFilename)}`, JSON.stringify({ scope: 'system' }, null, 2));
            } else {
                const metaText = await getPatternMetaTextOrNull(filename);
                if (metaText) {
                    const metaFilename = filename.replace(/\.js$/i, '.meta.json');
                    zip.file(`patterns/${decodeURIComponent(metaFilename)}`, metaText);
                }
            }
        }

        let downloadedBlocks = 0;
        if (DEMO_MODE) {
            const blockFiles = Array.from(demoBlockSourceByFile.keys()).sort();
            for (const filename of blockFiles) {
                const code = demoBlockSourceByFile.get(filename) || '';
                if (!code.trim()) continue;
                zip.file(`blocks/${decodeURIComponent(filename)}`, code);
                downloadedBlocks++;
            }
        } else {
            const blockItems = await listBlocksOrEmpty();
            for (const item of blockItems || []) {
                const filename = item?.filename;
                if (!filename) continue;
                let code = '';
                const rawRes = await fetch(`/blocks/${filename}`);
                if (rawRes.ok) {
                    code = await rawRes.text();
                } else {
                    const detail = await getBlockDetailOrNull(filename);
                    if (detail) {
                        code = buildBlockSourceFromApi(detail);
                    }
                }
                if (!code.trim()) continue;
                zip.file(`blocks/${decodeURIComponent(filename)}`, code);
                downloadedBlocks++;
            }
        }

        let downloadedArrangements = 0;
        if (DEMO_MODE) {
            const arrangementFiles = Array.from(demoArrangementSourceByFile.keys()).sort();
            for (const filename of arrangementFiles) {
                const code = demoArrangementSourceByFile.get(filename) || '';
                if (!code.trim()) continue;
                zip.file(`arrangements/${decodeURIComponent(filename)}`, code);
                downloadedArrangements++;
            }
        } else {
            const arrangementItems = await listArrangementsOrEmpty();
            for (const item of arrangementItems || []) {
                const filename = item?.filename;
                if (!filename) continue;
                let code = '';
                const rawRes = await fetch(`/arrangements/${filename}`);
                if (rawRes.ok) {
                    code = await rawRes.text();
                } else {
                    const detail = await getArrangementOrNull(filename);
                    if (detail) {
                        code = buildArrangementSourceFromApi(detail);
                    }
                }
                if (!code.trim()) continue;
                zip.file(`arrangements/${decodeURIComponent(filename)}`, code);
                downloadedArrangements++;
            }
        }

        if (!downloadedPatterns && !downloadedBlocks && !downloadedArrangements && !downloadedInstruments) {
            setStatus('Nothing to download', 'error');
            return;
        }

        const stampIso = new Date().toISOString();
        zip.file(
            UPLOAD_BUNDLE_MANIFEST_NAME,
            JSON.stringify(
                {
                    kind: UPLOAD_BUNDLE_KIND,
                    version: 1,
                    generatedAt: stampIso,
                    counts: {
                        patterns: downloadedPatterns,
                        blocks: downloadedBlocks,
                        arrangements: downloadedArrangements,
                        instruments: downloadedInstruments,
                    },
                },
                null,
                2
            )
        );
        const stamp = stampIso.replace(/[:]/g, '-').replace(/\..+/, '');
        const zipName = `strudel-project-bundle-${stamp}.zip`;
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerFileDownload(zipName, zipBlob, 'application/zip');

        const instrumentsLabel = downloadedInstruments ? ' + instruments.js' : ' (no instruments.js)';
        setStatus(
            `Downloaded ZIP: ${downloadedPatterns} pattern${downloadedPatterns === 1 ? '' : 's'}, ${downloadedBlocks} block${downloadedBlocks === 1 ? '' : 's'}, ${downloadedArrangements} arrangement${downloadedArrangements === 1 ? '' : 's'}${instrumentsLabel}`,
            'success'
        );
    } catch (e) {
        console.error(e);
        setStatus(`Download failed: ${e.message}`, 'error');
    }
}

function normalizeZipEntryPath(name) {
    return String(name || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

function getFilenameFromSection(pathname, section) {
    const match = pathname.match(new RegExp(`(?:^|/)${section}/(.+\\.js)$`, 'i'));
    if (!match) return '';
    const file = match[1].split('/').pop() || '';
    if (!file || file.includes('..') || !file.endsWith('.js')) return '';
    return file;
}

async function buildUploadBundle(file) {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);

    const patterns = new Map();
    const blocks = new Map();
    const arrangements = new Map();
    let instrumentsContent = '';
    let manifest = null;
    let hasInvalidManifest = false;
    const unknownPaths = [];

    for (const entry of entries) {
        const normalized = normalizeZipEntryPath(entry.name);
        const normalizedLower = normalized.toLowerCase();
        const content = await entry.async('string');
        if (!content.trim()) continue;

        if (normalizedLower.endsWith(`/${UPLOAD_BUNDLE_MANIFEST_NAME}`) || normalizedLower === UPLOAD_BUNDLE_MANIFEST_NAME) {
            try {
                manifest = JSON.parse(content);
            } catch (_e) {
                hasInvalidManifest = true;
            }
            continue;
        }

        if (normalizedLower.endsWith('/instruments.js') || normalizedLower === 'instruments.js') {
            instrumentsContent = content;
            continue;
        }

        const patternFile = getFilenameFromSection(normalized, 'patterns');
        if (patternFile) {
            patterns.set(patternFile, content);
            continue;
        }

        const blockFile = getFilenameFromSection(normalized, 'blocks');
        if (blockFile) {
            blocks.set(blockFile, content);
            continue;
        }

        const arrangementFile = getFilenameFromSection(normalized, 'arrangements');
        if (arrangementFile) {
            arrangements.set(arrangementFile, content);
            continue;
        }

        unknownPaths.push(normalized);
    }

    return {
        fileName: file.name || 'upload.zip',
        patterns: Array.from(patterns, ([filename, content]) => ({ filename, content })),
        blocks: Array.from(blocks, ([filename, content]) => ({ filename, content })),
        arrangements: Array.from(arrangements, ([filename, content]) => ({ filename, content })),
        instrumentsContent,
        manifest,
        hasInvalidManifest,
        unknownPaths,
    };
}

function describeUploadBundle(bundle) {
    if (!bundle) return '';
    return `${bundle.patterns.length} patterns, ${bundle.blocks.length} blocks, ${bundle.arrangements.length} arrangements${bundle.instrumentsContent ? ', instruments.js' : ''}`;
}

function setUploadProjectFooterMessage(message, type = 'normal') {
    if (!dom.uploadProjectFooterMessage) return;
    dom.uploadProjectFooterMessage.classList.remove('text-muted-foreground', 'text-destructive', 'text-primary');
    if (type === 'error') {
        dom.uploadProjectFooterMessage.classList.add('text-destructive');
    } else if (type === 'success') {
        dom.uploadProjectFooterMessage.classList.add('text-primary');
    } else {
        dom.uploadProjectFooterMessage.classList.add('text-muted-foreground');
    }
    dom.uploadProjectFooterMessage.textContent = message || '';
}

function setUploadProjectValidationState(bundle) {
    pendingUploadBundle = bundle || null;
    if (dom.confirmUploadProjectBtn) {
        dom.confirmUploadProjectBtn.disabled = !bundle;
    }
    if (!bundle) {
        if (dom.uploadProjectFilename) dom.uploadProjectFilename.textContent = '';
        if (dom.uploadProjectSummary) dom.uploadProjectSummary.textContent = '';
        return;
    }
    if (dom.uploadProjectFilename) {
        dom.uploadProjectFilename.textContent = `File: ${bundle.fileName}`;
    }
    if (dom.uploadProjectSummary) {
        dom.uploadProjectSummary.textContent = describeUploadBundle(bundle);
    }
}

function validateUploadBundle(bundle) {
    if (!bundle) return 'No file selected.';

    const hasAnyData = Boolean(bundle.patterns.length || bundle.blocks.length || bundle.arrangements.length || bundle.instrumentsContent);
    if (!hasAnyData) return 'Incompatible ZIP: no importable app data found.';

    if (bundle.hasInvalidManifest) {
        return 'Incompatible ZIP: metadata is corrupted.';
    }
    if (bundle.unknownPaths.length) {
        return 'Incompatible ZIP: contains unsupported files.';
    }

    if (bundle.manifest) {
        if (bundle.manifest.kind !== UPLOAD_BUNDLE_KIND || bundle.manifest.version !== 1) {
            return 'Incompatible ZIP: invalid bundle metadata.';
        }
        const expected = bundle.manifest.counts || {};
        const countChecks = [
            ['patterns', bundle.patterns.length],
            ['blocks', bundle.blocks.length],
            ['arrangements', bundle.arrangements.length],
            ['instruments', bundle.instrumentsContent ? 1 : 0],
        ];
        for (const [key, actual] of countChecks) {
            const value = expected[key];
            if (Number.isFinite(value) && value !== actual) {
                return 'Incompatible ZIP: bundle integrity check failed.';
            }
        }
        return '';
    }

    const patternsLookValid = bundle.patterns.every((item) => /export\s+default\b/.test(item.content));
    if (!patternsLookValid) return 'Incompatible ZIP: patterns payload is invalid.';

    const blocksLookValid = bundle.blocks.every((item) => /export\s+const\s+name\b/.test(item.content) && /export\s+const\s+pattern\b/.test(item.content));
    if (!blocksLookValid) return 'Incompatible ZIP: blocks payload is invalid.';

    const arrangementsLookValid = bundle.arrangements.every((item) => /export\s+const\s+arrangementState\b/.test(item.content));
    if (!arrangementsLookValid) return 'Incompatible ZIP: arrangements payload is invalid.';

    const instrumentsLookValid = !bundle.instrumentsContent || /export\s+const\s+instruments\b/.test(bundle.instrumentsContent);
    if (!instrumentsLookValid) return 'Incompatible ZIP: instruments payload is invalid.';

    return '';
}

async function getExistingNamesBySection() {
    if (DEMO_MODE) {
        return {
            patterns: new Set(Array.from(demoPatternSourceByFile.keys(), (f) => f.toLowerCase())),
            blocks: new Set(Array.from(demoBlockSourceByFile.keys(), (f) => f.toLowerCase())),
            arrangements: new Set(Array.from(demoArrangementSourceByFile.keys(), (f) => f.toLowerCase())),
        };
    }

    const [patternsList, blocks, arrangements] = await Promise.all([
        listPatterns().catch(() => []),
        listBlocksOrEmpty(),
        listArrangementsOrEmpty(),
    ]);

    return {
        patterns: new Set(normalizePatternEntries(patternsList || []).map((entry) => String(entry.filename || '').toLowerCase())),
        blocks: new Set((blocks || []).map((b) => String(b?.filename || '').toLowerCase())),
        arrangements: new Set((arrangements || []).map((a) => String(a?.filename || '').toLowerCase())),
    };
}

function makeImportedFilename(originalFilename, existingSet) {
    const safe = String(originalFilename || 'imported.js');
    const ext = safe.endsWith('.js') ? '.js' : '';
    const base = ext ? safe.slice(0, -3) : safe;
    let i = 1;
    let candidate = `${base}-import-${i}.js`;
    while (existingSet.has(candidate.toLowerCase())) {
        i++;
        candidate = `${base}-import-${i}.js`;
    }
    return candidate;
}

function normalizeContent(content) {
    return String(content || '').replace(/\r\n/g, '\n').trim();
}

async function fetchExistingContent(section, filename) {
    if (DEMO_MODE) {
        if (section === 'patterns') return demoPatternSourceByFile.get(filename) || '';
        if (section === 'blocks') return demoBlockSourceByFile.get(filename) || '';
        if (section === 'arrangements') return demoArrangementSourceByFile.get(filename) || '';
        return '';
    }

    if (section === 'patterns') {
        return await getPatternSourceOrEmpty(filename);
    }
    if (section === 'blocks') {
        const res = await fetch(`/blocks/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detail = await getBlockDetailOrNull(filename);
        if (detail) return buildBlockSourceFromApi(detail);
    }
    if (section === 'arrangements') {
        const res = await fetch(`/arrangements/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detail = await getArrangementOrNull(filename);
        if (detail) return buildArrangementSourceFromApi(detail);
    }
    return '';
}

async function writeImportedFile(section, filename, content) {
    if (DEMO_MODE) {
        if (section === 'patterns') demoPatternSourceByFile.set(filename, content);
        if (section === 'blocks') demoBlockSourceByFile.set(filename, content);
        if (section === 'arrangements') demoArrangementSourceByFile.set(filename, content);
        return true;
    }

    if (section === 'patterns') {
        try {
            await savePatternSource(filename, content, getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    if (section === 'blocks') {
        const parsed = parseBlockSource(content);
        try {
            await saveBlockDetail(filename, parsed, getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    if (section === 'arrangements') {
        const parsed = parseArrangementSource(content);
        try {
            await saveArrangement(filename, parsed, getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    return false;
}

function closeUploadProjectModal() {
    setUploadProjectValidationState(null);
    setUploadProjectFooterMessage('Select or drag a ZIP file to validate.', 'normal');
    if (dom.uploadProjectInput) dom.uploadProjectInput.value = '';
    dom.uploadProjectDropzone?.classList.remove('is-dragover');
    dom.uploadProjectModal?.classList.remove('open');
}

function openUploadProjectModal() {
    setUploadProjectValidationState(null);
    setUploadProjectFooterMessage('Select or drag a ZIP file to validate.', 'normal');
    dom.uploadProjectModal?.classList.add('open');
}

async function importSectionItems(section, items, include, mode, existingSet) {
    const stats = { written: 0, renamed: 0, replaced: 0, skipped: 0 };
    if (!include || !Array.isArray(items) || !items.length) return stats;

    for (const item of items) {
        const originalFilename = item.filename;
        let targetFilename = originalFilename;
        const exists = existingSet.has(originalFilename.toLowerCase());

        if (exists && mode === 'merge') {
            const existingContent = await fetchExistingContent(section, originalFilename);
            if (normalizeContent(existingContent) === normalizeContent(item.content)) {
                stats.skipped++;
                continue;
            }
            targetFilename = makeImportedFilename(originalFilename, existingSet);
            stats.renamed++;
        } else if (exists && mode === 'replace') {
            stats.replaced++;
        }

        const ok = await writeImportedFile(section, targetFilename, item.content);
        if (ok) {
            stats.written++;
            existingSet.add(targetFilename.toLowerCase());
        }
    }

    return stats;
}

async function applyUploadProject() {
    if (!pendingUploadBundle) return;

    const includePatterns = pendingUploadBundle.patterns.length > 0;
    const includeBlocks = pendingUploadBundle.blocks.length > 0;
    const includeArrangements = pendingUploadBundle.arrangements.length > 0;
    const includeInstruments = Boolean(pendingUploadBundle.instrumentsContent);
    const mode = 'merge';
    const replaceInstruments = true;

    try {
        if (dom.confirmUploadProjectBtn) dom.confirmUploadProjectBtn.disabled = true;
        setUploadProjectFooterMessage('Uploading...', 'normal');
        setStatus('Importing ZIP...', 'normal');
        const existing = await getExistingNamesBySection();

        const patternsStats = await importSectionItems('patterns', pendingUploadBundle.patterns, includePatterns, mode, existing.patterns);
        const blocksStats = await importSectionItems('blocks', pendingUploadBundle.blocks, includeBlocks, mode, existing.blocks);
        const arrangementsStats = await importSectionItems('arrangements', pendingUploadBundle.arrangements, includeArrangements, mode, existing.arrangements);

        let instrumentsImported = 0;
        if (includeInstruments && pendingUploadBundle.instrumentsContent && replaceInstruments) {
            if (DEMO_MODE) {
                sessionStorage.setItem('instruments-js-content', pendingUploadBundle.instrumentsContent);
                instrumentsImported = 1;
            } else {
                try {
                    await updateInstrumentsSourceFile(pendingUploadBundle.instrumentsContent);
                    instrumentsImported = 1;
                } catch (_e) {
                    instrumentsImported = 0;
                }
            }
        }

        await refreshPatternList();
        if (instrumentsImported) await reloadInstruments();

        setStatus(
            `Imported patterns ${patternsStats.written} (renamed ${patternsStats.renamed}, skipped ${patternsStats.skipped}), blocks ${blocksStats.written} (renamed ${blocksStats.renamed}, skipped ${blocksStats.skipped}), arrangements ${arrangementsStats.written} (renamed ${arrangementsStats.renamed}, skipped ${arrangementsStats.skipped}), instruments ${instrumentsImported}`,
            'success'
        );
        closeUploadProjectModal();
    } catch (e) {
        console.error(e);
        setUploadProjectFooterMessage(`Upload failed: ${e.message}`, 'error');
        setStatus(`Upload failed: ${e.message}`, 'error');
    } finally {
        if (dom.uploadProjectModal?.classList.contains('open') && dom.confirmUploadProjectBtn) {
            dom.confirmUploadProjectBtn.disabled = !pendingUploadBundle;
        }
    }
}

async function handleUploadSelection(file) {
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage('Incompatible file: only .zip is accepted.', 'error');
        return;
    }

    try {
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage('Validating ZIP...', 'normal');
        const bundle = await buildUploadBundle(file);
        const validationError = validateUploadBundle(bundle);
        if (validationError) {
            setUploadProjectValidationState(null);
            setUploadProjectFooterMessage(validationError, 'error');
            return;
        }
        setUploadProjectValidationState(bundle);
        setUploadProjectFooterMessage('Data validation successful', 'success');
    } catch (e) {
        console.error(e);
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage(`Validation failed: ${e.message}`, 'error');
    } finally {
        if (dom.uploadProjectInput) dom.uploadProjectInput.value = '';
    }
}

function closeModal() {
    dom.newPatternModal.classList.remove('open');
    dom.newPatternName.value = '';
}

// --- Event Listeners ---

// Event Listeners ---

dom.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
});
if (dom.exportJsonBtn) {
    dom.exportJsonBtn.addEventListener('click', () => {
        closeExportMenu();
        if (isArrangementWorkspaceActive()) {
            exportCurrentArrangement();
            return;
        }
        exportCurrentPattern();
    });
}
if (dom.exportWavBtn) {
    dom.exportWavBtn.addEventListener('click', () => {
        closeExportMenu();
        if (isArrangementWorkspaceActive()) {
            exportCurrentArrangementWav();
            return;
        }
        exportCurrentPatternWav();
    });
}
document.addEventListener('click', (e) => {
    if (!dom.exportMenuWrap?.contains(e.target)) {
        closeExportMenu();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeExportMenu();
});
if (dom.downloadProjectBtn) dom.downloadProjectBtn.addEventListener('click', downloadPatternsAndInstruments);
if (dom.uploadProjectBtn) dom.uploadProjectBtn.addEventListener('click', openUploadProjectModal);
if (dom.uploadProjectInput) {
    dom.uploadProjectInput.addEventListener('change', (e) => {
        const file = e.target?.files?.[0];
        if (file) handleUploadSelection(file);
    });
}
if (dom.uploadProjectDropzone) {
    dom.uploadProjectDropzone.addEventListener('click', () => dom.uploadProjectInput?.click());
    dom.uploadProjectDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dom.uploadProjectDropzone?.classList.add('is-dragover');
    });
    dom.uploadProjectDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.uploadProjectDropzone?.classList.add('is-dragover');
    });
    dom.uploadProjectDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dom.uploadProjectDropzone?.classList.remove('is-dragover');
    });
    dom.uploadProjectDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadProjectDropzone?.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) handleUploadSelection(file);
    });
}
const trackerBlockNameLabel = document.getElementById('trackerBlockNameLabel');
if (trackerBlockNameLabel) {
    trackerBlockNameLabel.draggable = true;
    trackerBlockNameLabel.addEventListener('dragstart', (e) => {
        const filename = appState.activeArrangementBlockFilename;
        if (!filename || !e.dataTransfer) return;
        const fromRowIndex = (appState.arrangementDraftState?.rows && typeof appState.arrangementDraftState.rows.findIndex === 'function')
            ? appState.arrangementDraftState.rows.findIndex((r) => Array.isArray(r?.blocks) && r.blocks.includes(filename))
            : -1;
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify({
            filename,
            fromRowIndex: fromRowIndex >= 0 ? fromRowIndex : null,
        }));
        e.dataTransfer.setData('text/plain', filename);
        document.body.classList.add('tracker-block-label-dragging');
    });
    trackerBlockNameLabel.addEventListener('dragend', () => {
        document.body.classList.remove('tracker-block-label-dragging');
    });
}
const trackerBlockNameInput = document.getElementById('trackerBlockName');
if (trackerBlockNameInput) {
    trackerBlockNameInput.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; });
    trackerBlockNameInput.addEventListener('drop', (e) => { e.preventDefault(); });
}

if (dom.closeUploadProjectModalBtn) dom.closeUploadProjectModalBtn.addEventListener('click', closeUploadProjectModal);
if (dom.cancelUploadProjectBtn) dom.cancelUploadProjectBtn.addEventListener('click', closeUploadProjectModal);
if (dom.confirmUploadProjectBtn) dom.confirmUploadProjectBtn.addEventListener('click', applyUploadProject);
if (dom.uploadProjectModal) {
    dom.uploadProjectModal.addEventListener('click', (e) => {
        if (e.target === dom.uploadProjectModal) {
            closeUploadProjectModal();
        }
    });
}

dom.sidebarTitle.addEventListener('click', handleSidebarTitleClick);
dom.newPatternBtn.addEventListener('click', openModal);
dom.newArrangementBtn?.addEventListener('click', openNewArrangementModal);
dom.blocksLibraryToggle?.addEventListener('click', () => {
    const sidebar = dom.blocksLibrarySidebar;
    if (!sidebar) return;
    const collapsed = sidebar.getAttribute('data-collapsed') === 'true';
    sidebar.setAttribute('data-collapsed', String(!collapsed));
    dom.blocksLibraryToggle?.setAttribute('aria-expanded', String(collapsed));
    const isNowCollapsed = !collapsed;
    const chevron = dom.blocksLibraryToggle?.querySelector('.blocks-library-chevron');
    if (chevron) {
        chevron.setAttribute('data-lucide', isNowCollapsed ? 'circle-chevron-down' : 'circle-chevron-up');
        createIcons({ icons });
    }
});
dom.newSidebarBlockBtn?.addEventListener('click', () => {
    void createUntitledBlock();
});
dom.cancelNewPattern.addEventListener('click', closeModal);
dom.cancelNewArrangement?.addEventListener('click', closeNewArrangementModal);
if (dom.openPatternAdvancedSettingsBtn) {
    dom.openPatternAdvancedSettingsBtn.addEventListener('click', () => {
        if (!appState.currentPatternFilename) return;
        openAdvancedSettingsModal({
            type: 'pattern',
            filename: appState.currentPatternFilename,
            name: currentPatternDisplayName || appState.currentPatternFilename.replace(/\.js$/, ''),
            scope: appState.currentPatternScope,
        });
    });
}
document.addEventListener('resource-scope:open', (e) => {
    const detail = e?.detail || null;
    if (!detail) return;
    openAdvancedSettingsModal(detail);
});
dom.confirmNewPattern.addEventListener('click', () => {
    const name = dom.newPatternName.value.trim();
    if (name) createNewPattern(name);
});
dom.confirmNewArrangement?.addEventListener('click', () => {
    const name = dom.newArrangementName?.value?.trim() || '';
    if (name) {
        void createNewArrangement(name);
    }
});
document.addEventListener('sidebar:viewChanged', async (e) => {
    const view = e?.detail?.view;
    if (view === 'strudel') {
        if (appState.currentPatternFilename) {
            showEditor();
        }
        refreshPatternListActiveState();
    } else if (view === 'blocks') {
        await refreshArrangementList();
        await refreshBlocksLibrary();
        if (appState.currentArrangementFilename) {
            showArrangementWorkspace();
        } else if (!appState.currentPatternFilename) {
            showWelcome();
        }
    }
    updatePatternListVisualizer();
    updateArrangementListScopeVisualizer();
});
document.addEventListener('visualizer:ready', () => {
    updatePatternListVisualizer();
    updateArrangementListScopeVisualizer();
});
dom.newPatternName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = dom.newPatternName.value.trim();
    if (name) createNewPattern(name);
});
dom.newArrangementName?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = dom.newArrangementName?.value?.trim() || '';
    if (name) {
        void createNewArrangement(name);
    }
});
if (dom.closeAdvancedSettingsModalBtn) dom.closeAdvancedSettingsModalBtn.addEventListener('click', closeAdvancedSettingsModal);
if (dom.cancelAdvancedSettingsBtn) dom.cancelAdvancedSettingsBtn.addEventListener('click', closeAdvancedSettingsModal);
if (dom.saveAdvancedSettingsBtn) dom.saveAdvancedSettingsBtn.addEventListener('click', applyAdvancedSettings);
if (dom.advancedSettingsModal) {
    dom.advancedSettingsModal.addEventListener('click', (e) => {
        if (e.target === dom.advancedSettingsModal) {
            closeAdvancedSettingsModal();
        }
    });
}
if (dom.newArrangementModal) {
    dom.newArrangementModal.addEventListener('click', (e) => {
        if (e.target === dom.newArrangementModal) {
            closeNewArrangementModal();
        }
    });
}

// Delete Confirmation
let patternToDelete = null;

function showDeleteConfirmation(filename) {
    const scope = normalizeScope(getPatternEntry(filename)?.scope);
    if (scope === 'system' && !isDeveloperModeEnabled()) {
        setStatus('System patterns cannot be deleted', 'normal');
        return;
    }
    patternToDelete = filename;
    dom.deleteConfirmText.innerHTML = `Pattern: <strong>${decodeURIComponent(filename)}</strong><br>This cannot be undone.`;
    dom.deleteConfirmModal.classList.add('open');
}

function closeDeleteModal() {
    dom.deleteConfirmModal.classList.remove('open');
    patternToDelete = null;
}



dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);

// Pattern Rename Functionality
let originalPatternName = '';

// Input: do not save; draft is the input value. Save/rename only on blur (or Enter → blur).
dom.patternNameInput.addEventListener('input', () => {
    if (!appState.currentPatternFilename) return;
    if (DEMO_MODE || (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled())) return;
    // No-op: name is saved on blur only.
});

// Save/rename when leaving the input (only renames if name actually changed).
dom.patternNameInput.addEventListener('blur', () => {
    if (!appState.currentPatternFilename) return;
    if (DEMO_MODE || (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled())) return;
    renamePattern({ quiet: true });
});

// Enter blurs the field; blur handler runs rename when name has changed.
dom.patternNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        dom.patternNameInput.blur();
    }
});

dom.confirmDeleteBtn.addEventListener('click', async () => {
    if (patternToDelete) {
        await deletePattern(patternToDelete);
        closeDeleteModal();
    }
});

// Preview Panel Listeners
dom.previewPlayBtn.addEventListener('click', () => {
    if (isPreviewPlaying) {
        stopZzfxmSong();
        updatePreviewPlayButton(false);
        return;
    }

    if (!lastExportedData) {
        setStatus('Nothing to play. Export ZzFXTrack first.', 'error');
        return;
    }

    // Stop Strudel, arrangement preview, and tracker preview so only ZzFXTrack Player preview plays.
    stopAllPlaybackForSelectionChange();

    playZzfxmSong(lastExportedData, getAudioContext(), () => {
        updatePreviewPlayButton(false);
    }, { ...(lastExportedMeta || {}), ...getPlaybackMixSettings() });
    updatePreviewPlayButton(true);
});

function updatePreviewPlayButton(playing) {
    isPreviewPlaying = playing;
    dom.previewPlayBtn.dataset.previewPlaying = playing ? 'true' : 'false';
    dom.previewPlayBtn.innerHTML = playing ? '<i data-lucide="square" class="w-4 h-4 fill-current"></i>' : '<i data-lucide="play" class="w-4 h-4 fill-current"></i>';
    createIcons({ icons });
}


// Shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (DEMO_MODE) {
            setStatus('Demo mode: save is disabled', 'normal');
        } else {
            saveCurrentPattern();
        }
    }
});


// --- PLAYBACK LOGIC ---

async function togglePlay(e) {
    const editor = dom.repl.editor;
    if (!editor) return;

    validateCodeForExport(editor.code, {
        setStatus,
        getStatusText: () => dom.statusMsg?.innerText || '',
    });

    const scheduler = editor.repl.scheduler;
    const isRunning = scheduler.started;
    const isPlayingCurrent = isRunning && playingPatternFilename === appState.currentPatternFilename;
    const shiftPause = e && e.shiftKey;

    if (isPlayingCurrent) {
        if (shiftPause) {
            // Pause playback (resumable with play)
            editor.repl.pause();
            isStrudelPaused = true;
            updatePlayState(false);
        } else {
            // Stop current pattern
            editor.stop();
            isStrudelPaused = false;
            updatePlayState(false);
        }
        return;
    }

    // Stop any other playback (arrangement preview, ZzFXTrack Player, tracker) before starting Strudel.
    stopAllPlaybackForSelectionChange();
    isStrudelPaused = false;

    // Ensure ZzFX instruments are registered right before starting playback.
    // This prevents default Strudel sound registries (e.g. sample packs) from overriding aliases like "cowbell".
    try {
        await reloadInstruments();
    } catch (err) {
        console.warn('[ReplApp] Failed to reload instruments before playback:', err);
    }

    if (isRunning) {
        // Another pattern is currently running. Switch to selected pattern and restart
        editor.stop();
        isStrudelPaused = false;
        editor.evaluate();
        updatePlayState(true);
    } else {
        if (isStrudelPaused && playingPatternFilename === appState.currentPatternFilename) {
            // Resume from pause
            editor.repl.start();
            isStrudelPaused = false;
            updatePlayState(true);
        } else {
            // Start selected pattern from the beginning
            editor.evaluate();
            updatePlayState(true);
        }
    }
}

function updatePlayState(isPlaying) {
    // Sync visualizer location and playing state context
    if (isPlaying) {
        playingPatternFilename = appState.currentPatternFilename;
    } else {
        playingPatternFilename = null;
    }
    updatePatternListVisualizer();
    renderPlayButton();
}

function renderPlayButton() {
    const editor = dom.repl.editor;
    const isRunning = editor && editor.repl.scheduler.started;
    const showStop = isRunning && playingPatternFilename === appState.currentPatternFilename;
    const showPauseIcon = showStop && playBtnShiftHover;

    let iconName = 'play';
    if (showPauseIcon) iconName = 'pause';
    else if (showStop) iconName = 'square';

    dom.playBtn.innerHTML = `<i data-lucide="${iconName}" class="w-[18px] h-5 fill-current text-primary"></i>`;
    createIcons({ icons });
}

function setPlayBtnShiftHover(shiftHover) {
    if (playBtnShiftHover === shiftHover) return;
    playBtnShiftHover = shiftHover;
    renderPlayButton();
}

// Listen for global Strudel events to keep UI in sync (e.g. Ctrl+Enter)
document.addEventListener('start-repl', (e) => {
    // If our repl started, update button
    if (dom.repl.editor && e.detail === dom.repl.editor.id) {
        updatePlayState(true);
        // Ensure our ZzFX instruments win any name collisions (e.g. "cowbell") after REPL start.
        // Some Strudel setups may (re)register default sound sources when the REPL starts.
        void reloadInstruments();
    }
});

// Add listener
dom.playBtn.addEventListener('click', togglePlay);

// Shift + hover: show pause icon on stop button
dom.playBtn.addEventListener('mouseenter', (e) => setPlayBtnShiftHover(!!e.shiftKey));
dom.playBtn.addEventListener('mouseleave', () => setPlayBtnShiftHover(false));

function updatePlayBtnShiftHoverFromKey(shiftKey) {
    const hovered = dom.playBtn && dom.playBtn.matches(':hover');
    setPlayBtnShiftHover(shiftKey && hovered);
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') updatePlayBtnShiftHoverFromKey(true);
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') updatePlayBtnShiftHoverFromKey(false);
});

function buildZzfxmSongJsModule(songData) {
    const headerLines = [
        '//! Generated by ZzFXTrack',
        '// ZzFXTrack Player song data: [instruments, patterns, sequence, BPM]',
        ''
    ];
    const json = JSON.stringify(songData);
    return `${headerLines.join('\n')}export const songData = ${json};\nexport default songData;\n`;
}

function renderSongDataPreview() {
    if (!lastExportedData || !dom.previewJson) return;
    if (songDataViewMode === 'js') {
        dom.previewJson.innerText = buildZzfxmSongJsModule(lastExportedData);
    } else {
        dom.previewJson.innerText = JSON.stringify(lastExportedData, null, 2);
    }
}

function setSongDataViewMode(mode) {
    if (mode !== 'json' && mode !== 'js') return;
    songDataViewMode = mode;
    if (dom.songDataJsonTab) {
        dom.songDataJsonTab.classList.toggle('active', mode === 'json');
    }
    if (dom.songDataJsTab) {
        dom.songDataJsTab.classList.toggle('active', mode === 'js');
    }
    if (lastExportedData) {
        renderSongDataPreview();
    }
}

async function saveExportedSongFiles(jsonFilename, songData) {
    if (DEMO_MODE) return;
    await saveExportedJsonFile(jsonFilename, songData);

    const baseName = jsonFilename.replace(/\.json$/i, '');
    const jsFilename = `${baseName}.js`;
    try {
        const moduleText = buildZzfxmSongJsModule(songData);
        await saveExportedJsFile(jsFilename, moduleText);
    } catch (e) {
        console.warn('Failed to save JS song module', e);
    }
}

// --- JSON Preview Modal Logic ---

function openJsonModal() {
    setSongDataViewMode(songDataViewMode || 'json');
    dom.jsonPreviewModal.classList.add('open');
}

function closeJsonModal() {
    dom.jsonPreviewModal.classList.remove('open');
}

async function copyJsonToClipboard() {
    const text = dom.previewJson.innerText;
    if (!text) return;
    
    try {
        await navigator.clipboard.writeText(text);
        
        const originalText = dom.copyJsonBtn.innerText;
        dom.copyJsonBtn.innerText = 'Copied!';
        dom.copyJsonBtn.disabled = true;
        
        setTimeout(() => {
            dom.copyJsonBtn.innerText = originalText;
            dom.copyJsonBtn.disabled = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
        setStatus('Failed to copy to clipboard', 'error');
    }
}

function downloadJsonData() {
    const text = dom.previewJson?.innerText || '';
    if (!text || !text.trim()) {
        setStatus('No exported data to download.', 'error');
        return;
    }
    const contextFilename = lastExportedContext?.filename || appState.currentPatternFilename || appState.currentArrangementFilename || null;
    const baseName = contextFilename
        ? contextFilename.replace(/\.(js|json)$/i, '')
        : 'pattern-data';
    const isJs = songDataViewMode === 'js';
    const filename = isJs ? `${baseName}.js` : `${baseName}.json`;
    const mime = isJs
        ? 'application/javascript;charset=utf-8'
        : 'application/json;charset=utf-8';
    triggerFileDownload(filename, text, mime);
    setStatus(`Downloaded ${filename}`, 'success');
}

// JSON Modal Listeners
if(dom.showJsonBtn) dom.showJsonBtn.addEventListener('click', openJsonModal);
if(dom.closeJsonModalBtn) dom.closeJsonModalBtn.addEventListener('click', closeJsonModal);
if(dom.closeJsonModalBottomBtn) dom.closeJsonModalBottomBtn.addEventListener('click', closeJsonModal);
if(dom.downloadJsonBtn) dom.downloadJsonBtn.addEventListener('click', downloadJsonData);
if(dom.copyJsonBtn) dom.copyJsonBtn.addEventListener('click', copyJsonToClipboard);
if(dom.songDataJsonTab) dom.songDataJsonTab.addEventListener('click', () => setSongDataViewMode('json'));
if(dom.songDataJsTab) dom.songDataJsTab.addEventListener('click', () => setSongDataViewMode('js'));

// --- About Modal Logic ---
function openAboutModal() {
    dom.aboutModal?.classList.add('open');
    createIcons({ icons });
}

function closeAboutModal() {
    dom.aboutModal?.classList.remove('open');
}

if (dom.openAboutModalBtn) dom.openAboutModalBtn.addEventListener('click', openAboutModal);
if (dom.closeAboutModalBtn) dom.closeAboutModalBtn.addEventListener('click', closeAboutModal);
if (dom.closeAboutModalBottomBtn) dom.closeAboutModalBottomBtn.addEventListener('click', closeAboutModal);
if (dom.aboutModal) {
    dom.aboutModal.addEventListener('click', (e) => {
        if (e.target === dom.aboutModal) closeAboutModal();
    });
}

// --- Licensing Modal Logic ---
function openLicenseModal() {
    dom.licenseAttributionModal?.classList.add('open');
}

function closeLicenseModal() {
    dom.licenseAttributionModal?.classList.remove('open');
}

if (dom.openLicenseModalBtn) dom.openLicenseModalBtn.addEventListener('click', openLicenseModal);
if (dom.closeLicenseModalBtn) dom.closeLicenseModalBtn.addEventListener('click', closeLicenseModal);
if (dom.closeLicenseModalBottomBtn) dom.closeLicenseModalBottomBtn.addEventListener('click', closeLicenseModal);
if (dom.licenseAttributionModal) {
    dom.licenseAttributionModal.addEventListener('click', (e) => {
        if (e.target === dom.licenseAttributionModal) {
            closeLicenseModal();
        }
    });
}

// --- Technical Details Modal Logic ---
function openTechnicalDetailsModal() {
    dom.technicalDetailsModal?.classList.add('open');
    createIcons({ icons });
}

function closeTechnicalDetailsModal() {
    dom.technicalDetailsModal?.classList.remove('open');
}

if (dom.openTechnicalDetailsModalBtn) dom.openTechnicalDetailsModalBtn.addEventListener('click', openTechnicalDetailsModal);
if (dom.closeTechnicalDetailsModalBtn) dom.closeTechnicalDetailsModalBtn.addEventListener('click', closeTechnicalDetailsModal);
if (dom.closeTechnicalDetailsModalBottomBtn) dom.closeTechnicalDetailsModalBottomBtn.addEventListener('click', closeTechnicalDetailsModal);
if (dom.technicalDetailsModal) {
    dom.technicalDetailsModal.addEventListener('click', (e) => {
        if (e.target === dom.technicalDetailsModal) {
            closeTechnicalDetailsModal();
        }
    });
}

// --- Change Log Modal Logic ---
function openChangelogModal() {
    dom.changelogModal?.classList.add('open');
}

function closeChangelogModal() {
    dom.changelogModal?.classList.remove('open');
}

if (dom.openChangelogModalBtn) dom.openChangelogModalBtn.addEventListener('click', openChangelogModal);
if (dom.closeChangelogModalBtn) dom.closeChangelogModalBtn.addEventListener('click', closeChangelogModal);
if (dom.closeChangelogModalBottomBtn) dom.closeChangelogModalBottomBtn.addEventListener('click', closeChangelogModal);
if (dom.changelogModal) {
    dom.changelogModal.addEventListener('click', (e) => {
        if (e.target === dom.changelogModal) {
            closeChangelogModal();
        }
    });
}

// --- System Settings Modal Logic ---

/** Resolve a CSS variable to rgb components (0-255) and alpha (0-1). */
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

/** Convert r,g,b (0-255) and alpha (0-1) to HSL string for Coloris (format: hsl). */
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
    if (a < 1) {
        return `hsl(${H} ${S}% ${L}% / ${a})`;
    }
    return `hsl(${H} ${S}% ${L}%)`;
}

/** Resolve a CSS variable to HSL string so theme pickers show HSL (matches Coloris format). */
function getCssVarAsHsl(varName) {
    const { r, g, b, a } = getCssVarAsRgbA(varName);
    return rgbToHslString(r, g, b, a);
}

function syncThemeColorPickers() {
    const root = dom.systemSettingsModal;
    if (!root) return;
    root.querySelectorAll('input[data-theme-var]').forEach((input) => {
        const varName = input.getAttribute('data-theme-var');
        if (!varName) return;
        try {
            const hsl = getCssVarAsHsl(varName);
            input.value = hsl;
            // Coloris inline swatch is .clr-field’s color (button uses currentColor); no .clr-preview on the field
            const field = input.closest('.clr-field');
            if (field) field.style.color = hsl;
        } catch (_) {
            // ignore
        }
    });
}

function applyThemeColorOverride(varName, colorValue) {
    const key = varName.startsWith('--') ? varName.slice(2) : varName;
    const prop = `--${key}`;
    document.documentElement.style.setProperty(prop, colorValue);
    // Tailwind v4 utilities use --color-* theme variables; sync so utilities update
    if (key === 'background') document.documentElement.style.setProperty('--color-background', colorValue);
    if (key === 'foreground') document.documentElement.style.setProperty('--color-foreground', colorValue);
    if (key === 'card') document.documentElement.style.setProperty('--color-card', colorValue);
    if (key === 'card-foreground') document.documentElement.style.setProperty('--color-card-foreground', colorValue);
    if (key === 'popover') document.documentElement.style.setProperty('--color-popover', colorValue);
    if (key === 'popover-foreground') document.documentElement.style.setProperty('--color-popover-foreground', colorValue);
    if (key === 'primary') document.documentElement.style.setProperty('--color-primary', colorValue);
    if (key === 'primary-foreground') document.documentElement.style.setProperty('--color-primary-foreground', colorValue);
    if (key === 'secondary') document.documentElement.style.setProperty('--color-secondary', colorValue);
    if (key === 'secondary-foreground') document.documentElement.style.setProperty('--color-secondary-foreground', colorValue);
    if (key === 'tertiary') document.documentElement.style.setProperty('--color-tertiary', colorValue);
    if (key === 'tertiary-foreground') document.documentElement.style.setProperty('--color-tertiary-foreground', colorValue);
    if (key === 'quaternary') document.documentElement.style.setProperty('--color-quaternary', colorValue);
    if (key === 'quaternary-foreground') document.documentElement.style.setProperty('--color-quaternary-foreground', colorValue);
    if (key === 'muted') document.documentElement.style.setProperty('--color-muted', colorValue);
    if (key === 'muted-foreground') document.documentElement.style.setProperty('--color-muted-foreground', colorValue);
    if (key === 'accent') document.documentElement.style.setProperty('--color-accent', colorValue);
    if (key === 'accent-foreground') document.documentElement.style.setProperty('--color-accent-foreground', colorValue);
    if (key === 'border') document.documentElement.style.setProperty('--color-border', colorValue);
    if (key === 'input') document.documentElement.style.setProperty('--color-input', colorValue);
    if (key === 'input-bg') document.documentElement.style.setProperty('--color-input-bg', colorValue);
    if (key === 'destructive') document.documentElement.style.setProperty('--color-destructive', colorValue);
    if (key === 'destructive-foreground') document.documentElement.style.setProperty('--color-destructive-foreground', colorValue);
    if (key === 'ring') document.documentElement.style.setProperty('--color-ring', colorValue);
}

function resetThemeToDefaults() {
    const vars = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'tertiary', 'tertiary-foreground', 'quaternary', 'quaternary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'input-bg', 'ring'];
    vars.forEach((name) => document.documentElement.style.removeProperty(`--${name}`));
    ['--color-background', '--color-foreground', '--color-card', '--color-card-foreground', '--color-popover', '--color-popover-foreground', '--color-primary', '--color-primary-foreground', '--color-secondary', '--color-secondary-foreground', '--color-tertiary', '--color-tertiary-foreground', '--color-quaternary', '--color-quaternary-foreground', '--color-muted', '--color-muted-foreground', '--color-accent', '--color-accent-foreground', '--color-destructive', '--color-destructive-foreground', '--color-border', '--color-input', '--color-input-bg', '--color-ring'].forEach((p) => document.documentElement.style.removeProperty(p));
    syncThemeColorPickers();
}

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

function setAllThemeColorsToWhite() {
    const white = 'hsl(0 0% 100%)';
    const root = document.documentElement;
    THEME_COLOR_VARS_AND_TAILWIND.forEach((name) => root.style.setProperty(`--${name}`, white));
    TAILWIND_COLOR_VARS.forEach((name) => root.style.setProperty(`--color-${name}`, white));
    syncThemeColorPickers();
}

const THEME_VAR_NAMES = [
    'background', 'foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground',
    'secondary', 'secondary-foreground', 'tertiary', 'tertiary-foreground',
    'quaternary', 'quaternary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
    'border', 'input', 'ring', 'input-bg', 'radius',
];

/** Get a theme variable value from the active theme block in stylesheets (fallback when getComputedStyle omits it). */
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
            const selectorsForTheme = theme
                ? [`html[data-theme="${theme}"]`]
                : ['html:root', ':root'];
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
        // ignore
    }
    return '';
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
    if (!dom.systemSettingsThemeCopyBtn) return;
    const label = dom.systemSettingsThemeCopyBtn.textContent.trim();
    dom.systemSettingsThemeCopyBtn.textContent = message;
    setTimeout(() => { dom.systemSettingsThemeCopyBtn.textContent = label; }, resetAfterMs);
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
        } else {
            if (!fallbackCopy()) throw new Error('execCommand copy failed');
        }
        setCopyButtonFeedback('Copied!');
    } catch (err) {
        if (fallbackCopy()) {
            setCopyButtonFeedback('Copied!');
        } else {
            console.warn('Copy failed:', err);
            setCopyButtonFeedback('Copy failed');
        }
    }
}

function getActiveColorTheme() {
    return document.documentElement.getAttribute('data-theme') || '';
}

function setColorTheme(theme) {
    if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    try {
        localStorage.setItem(COLOR_THEME_KEY, theme || '');
    } catch (_e) { /* ignore */ }
    updateThemeOptionButtonsState();
    syncThemeColorPickers();
}

function updateThemeOptionButtonsState() {
    const active = getActiveColorTheme();
    [dom.systemSettingsThemeDefaultBtn, dom.systemSettingsThemeLegacyBtn, dom.systemSettingsThemeRomulanBtn, dom.systemSettingsThemeMonoBtn, dom.systemSettingsThemeMilkBtn].forEach((btn) => {
        if (!btn) return;
        const value = (btn.getAttribute('data-theme') || '').trim();
        const isActive = value === active;
        btn.classList.toggle('bg-primary', isActive);
        btn.classList.toggle('text-primary-foreground', isActive);
        btn.classList.toggle('text-muted-foreground', !isActive);
        btn.classList.toggle('hover:text-foreground', !isActive);
    });
}

/** Populate REPL theme dropdown from Strudel presets and sync selected value to current setting. */
function syncReplThemeSelect() {
    const select = dom.systemSettingsReplThemeSelect;
    if (!select) return;
    if (select.options.length === 0) {
        const names = Object.keys(strudelReplThemes).sort();
        names.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }
    const current = codemirrorSettings.get().theme;
    if (Object.prototype.hasOwnProperty.call(strudelReplThemes, current)) {
        select.value = current;
    } else {
        select.value = 'strudelTheme';
    }
}

function openSystemSettingsModal() {
    if (!dom.systemSettingsModal) return;
    if (dom.systemSettingsDevModeToggle) {
        dom.systemSettingsDevModeToggle.checked = isDeveloperModeEnabled();
        dom.systemSettingsDevModeToggle.disabled = DEMO_MODE;
    }
    updateThemeOptionButtonsState();
    syncThemeColorPickers();
    syncReplThemeSelect();
    scopeStrudelThemeVarsToRepl();
    dom.systemSettingsModal.classList.add('open');
    createIcons({ icons });
}

function closeSystemSettingsModal() {
    dom.systemSettingsModal?.classList.remove('open');
}

if (dom.openSystemSettingsModalBtn) dom.openSystemSettingsModalBtn.addEventListener('click', openSystemSettingsModal);
if (dom.closeSystemSettingsModalBtn) dom.closeSystemSettingsModalBtn.addEventListener('click', closeSystemSettingsModal);
if (dom.closeSystemSettingsModalBottomBtn) dom.closeSystemSettingsModalBottomBtn.addEventListener('click', closeSystemSettingsModal);
if (dom.systemSettingsModal) {
    dom.systemSettingsModal.addEventListener('click', (e) => {
        if (e.target === dom.systemSettingsModal) closeSystemSettingsModal();
    });
}
if (dom.systemSettingsDevModeToggle) {
    dom.systemSettingsDevModeToggle.addEventListener('change', () => {
        setDeveloperModeEnabled(Boolean(dom.systemSettingsDevModeToggle.checked));
    });
}

// Theme color pickers (Coloris): apply override on change; reset button clears overrides
if (dom.systemSettingsModal) {
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
if (dom.systemSettingsThemeResetBtn) {
    dom.systemSettingsThemeResetBtn.addEventListener('click', resetThemeToDefaults);
}
if (dom.systemSettingsThemeCopyBtn) {
    dom.systemSettingsThemeCopyBtn.addEventListener('click', copyThemeToClipboard);
}
if (dom.systemSettingsThemeDefaultBtn) {
    dom.systemSettingsThemeDefaultBtn.addEventListener('click', () => setColorTheme(''));
}
if (dom.systemSettingsThemeLegacyBtn) {
    dom.systemSettingsThemeLegacyBtn.addEventListener('click', () => setColorTheme('jester'));
}
if (dom.systemSettingsThemeRomulanBtn) {
    dom.systemSettingsThemeRomulanBtn.addEventListener('click', () => setColorTheme('phantom'));
}
if (dom.systemSettingsThemeMonoBtn) {
    dom.systemSettingsThemeMonoBtn.addEventListener('click', () => setColorTheme('mono'));
}
if (dom.systemSettingsThemeMilkBtn) {
    dom.systemSettingsThemeMilkBtn.addEventListener('click', () => setColorTheme('milk'));
}
if (dom.systemSettingsThemeWhiteDebugBtn) {
    dom.systemSettingsThemeWhiteDebugBtn.addEventListener('click', setAllThemeColorsToWhite);
}
/** Scope Strudel's injected theme vars to .editor-pane so they don't override the app's --background/--foreground. Keep app in dark mode. */
function scopeStrudelThemeVarsToRepl() {
    const styleEl = document.getElementById('strudel-theme-vars');
    if (styleEl?.textContent) {
        const content = styleEl.textContent.trim();
        if (content.startsWith(':root')) {
            styleEl.textContent = content.replace(/^:root\b/, '.editor-pane');
        }
    }
    document.documentElement.classList.add('dark');
}

if (dom.systemSettingsReplThemeSelect) {
    dom.systemSettingsReplThemeSelect.addEventListener('change', () => {
        const theme = dom.systemSettingsReplThemeSelect.value;
        const next = { ...codemirrorSettings.get(), theme };
        codemirrorSettings.set(next);
        if (dom.repl?.editor) dom.repl.editor.updateSettings({ theme });
        requestAnimationFrame(() => scopeStrudelThemeVarsToRepl());
    });
}

// Initialize Coloris for theme color inputs (dark theme, hex + alpha support)
Coloris.init();
Coloris({
    el: '#systemSettingsModal input[data-coloris]',
    themeMode: 'dark',
    format: 'hsl',
    alpha: true,
});

document.addEventListener('developer-mode:changed', () => {
    // Immediately update local read-only flags and rerender lists.
    if (dom.patternNameInput) {
        dom.patternNameInput.readOnly = DEMO_MODE || (appState.currentPatternScope === 'system' && !isDeveloperModeEnabled());
    }
    updateAdvancedSettingsButtonsVisibility();
    updateDevModeToolbarLabelVisibility();
    void refreshPatternList();
    try {
        refreshInstrumentListUI?.();
    } catch (_e) {
        // ignore
    }
});

// --- Demo Mode Modal Logic ---
function openDemoModeModal() {
    dom.demoModeModal?.classList.add('open');
}

function closeDemoModeModal() {
    dom.demoModeModal?.classList.remove('open');
}

if (dom.demoModeBadge) {
    dom.demoModeBadge.addEventListener('click', () => {
        if (!DEMO_MODE) return;
        openDemoModeModal();
    });
}
if (dom.closeDemoModeModalBtn) dom.closeDemoModeModalBtn.addEventListener('click', closeDemoModeModal);
if (dom.closeDemoModeModalBottomBtn) dom.closeDemoModeModalBottomBtn.addEventListener('click', closeDemoModeModal);
if (dom.demoModeModal) {
    dom.demoModeModal.addEventListener('click', (e) => {
        if (e.target === dom.demoModeModal) {
            closeDemoModeModal();
        }
    });
}

/**
 * Handle confirmation of external links
 */
function setupExternalLinkInterception() {
    // Intercept all link clicks
    document.addEventListener('click', (e) => {
        // Find the nearest anchor tag
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Check if it's an external link
        const isExternal = href.startsWith('http') || href.startsWith('//');
        
        // Also check if it's pointing to the same origin
        const isSameOrigin = href.startsWith(window.location.origin) || (href.startsWith('/') && !href.startsWith('//'));

        if (isExternal && !isSameOrigin) {
            e.preventDefault();
            pendingExternalUrl = href;
            dom.externalLinkModal.classList.add('open');
        }
    });

    // Handle modal buttons
    dom.confirmExternalLink.addEventListener('click', () => {
        if (pendingExternalUrl) {
            window.open(pendingExternalUrl, '_blank', 'noopener,noreferrer');
        }
        closeExternalLinkModal();
    });

    dom.cancelExternalLink.addEventListener('click', () => {
        closeExternalLinkModal();
    });

    // Close on overlay click
    dom.externalLinkModal.addEventListener('click', (e) => {
        if (e.target === dom.externalLinkModal) {
            closeExternalLinkModal();
        }
    });
}

function closeExternalLinkModal() {
    dom.externalLinkModal.classList.remove('open');
    pendingExternalUrl = null;
}

// --- Export Settings Modal ---

function updateExportSettingsApplyButton() {
    if (!dom.applyExportSettings) return;
    dom.applyExportSettings.disabled = !hasExportSettingsChanges();
}

/** Apply current playback loudness settings to live preview (no persist). So changes are heard immediately. */
function applyPlaybackMixToPreview() {
    const mixSettings = getPlaybackMixSettings();
    updateArrangementPreview({
        mixSettings,
        keepPosition: true,
    });
    if (isTrackerPreviewPlaying()) {
        refreshTrackerPreview();
    }
}

function setupExportSettingsModal() {
    if (dom.playbackLoudnessPreset && !normalizePlaybackPresetId(dom.playbackLoudnessPreset.value)) {
        dom.playbackLoudnessPreset.value = DEFAULT_PLAYBACK_PRESET_ID;
    }

    // Open modal: take snapshot so Cancel can revert and Apply disabled state is correct
    dom.exportSettingsBtn.addEventListener('click', () => {
        exportSettingsSnapshot = getExportSettingsSnapshot();
        dom.exportSettingsModal.classList.add('open');
        updateExportSettingsApplyButton();
    });

    // Cancel: revert form to snapshot and close
    dom.cancelExportSettings?.addEventListener('click', () => {
        applyExportSettingsSnapshot(exportSettingsSnapshot);
        dom.exportSettingsModal.classList.remove('open');
    });

    // Apply: persist and close
    dom.applyExportSettings?.addEventListener('click', () => {
        if (!hasExportSettingsChanges()) return;
        savePatternMeta();
        const inferred = inferPlaybackPresetId(getPlaybackMixSettings());
        setPlaybackPresetControl(inferred);
        applyPlaybackMixToPreview();
        exportSettingsSnapshot = getExportSettingsSnapshot();
        dom.exportSettingsModal.classList.remove('open');
    });

    // Close on overlay click (same as Cancel: revert and close)
    dom.exportSettingsModal.addEventListener('click', (e) => {
        if (e.target === dom.exportSettingsModal) {
            applyExportSettingsSnapshot(exportSettingsSnapshot);
            dom.exportSettingsModal.classList.remove('open');
        }
    });

    const resolutionInputs = document.querySelectorAll('input[name="exportResolution"]');
    const updateResolutionUi = () => {
        const selected = document.querySelector('input[name="exportResolution"]:checked');
        const isCustom = selected?.value === 'custom';
        if (dom.exportResolutionHint) {
            dom.exportResolutionHint.style.display = selected?.value === '48' ? 'block' : 'none';
        }
        if (dom.exportResolutionCustomWrap) {
            dom.exportResolutionCustomWrap.classList.toggle('hidden', !isCustom);
        }
    };
    resolutionInputs.forEach(input => {
        input.addEventListener('change', () => {
            updateResolutionUi();
            updateExportSettingsApplyButton();
        });
    });
    dom.exportResolutionCustom?.addEventListener('input', () => {
        updateResolutionUi();
        updateExportSettingsApplyButton();
    });
    updateResolutionUi();

    // Toggle channel limit input based on checkbox
    dom.limitChannels.addEventListener('change', () => {
        if (dom.limitChannels.checked) {
            dom.channelLimitGroup.classList.remove('hidden');
            dom.maxChannelsInput.disabled = false;
            dom.maxChannelsInput.focus();
        } else {
            dom.channelLimitGroup.classList.add('hidden');
            dom.maxChannelsInput.disabled = true;
        }
        updateExportSettingsApplyButton();
    });

    dom.maxChannelsInput?.addEventListener('input', updateExportSettingsApplyButton);
    dom.normalizeLayers?.addEventListener('change', updateExportSettingsApplyButton);
    dom.simpleExport?.addEventListener('change', updateExportSettingsApplyButton);
    dom.playbackLoudnessPreset?.addEventListener('change', () => {
        const presetId = normalizePlaybackPresetId(dom.playbackLoudnessPreset?.value);
        if (!presetId || presetId === 'custom') {
            setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
        } else {
            const presetSettings = PLAYBACK_LOUDNESS_PRESETS[presetId];
            applyPlaybackMixSettingsToInputs(presetSettings);
        }
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackTargetPeak?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackMasterGainDb?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackSoftClipDrive?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.wavSampleRate?.addEventListener('change', updateExportSettingsApplyButton);
    dom.wavBitDepth?.addEventListener('change', updateExportSettingsApplyButton);

    if (!dom.playbackTargetPeak?.value || !dom.playbackMasterGainDb?.value || !dom.playbackSoftClipDrive?.value) {
        applyPlaybackMixSettingsToInputs(PLAYBACK_LOUDNESS_PRESETS[DEFAULT_PLAYBACK_PRESET_ID]);
    }
    setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
    exportSettingsSnapshot = getExportSettingsSnapshot();
}

// Initialize export settings modal
setupExportSettingsModal();

// --- Tracker Integration ---

/**
 * Initialize tracker with current instruments
 */
async function initTrackerWithInstruments() {
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    
    const instrumentList = instruments.map(inst => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
    
    initTracker(instrumentList);
}

/**
 * Setup tracker event listeners
 */
function setupTrackerEventListeners() {

    document.addEventListener('tracker:closed', (e) => {
        const { returnToBlocksOnClose, returnToArrangementsOnClose } = e.detail || {};
        if (returnToArrangementsOnClose) return;
        if (!returnToBlocksOnClose) return;
        if (isArrangementWorkspaceActive()) return;
        if (isBlocksModalOpen()) return;
        openBlocksModal('blocks');
    });

    document.addEventListener('tracker:closed', (e) => {
        if (!isArrangementWorkspaceActive()) return;
        if (e?.detail?.returnToArrangementsOnClose) return;
        if (!appState.activeArrangementBlockFilename) return;
        trackerWorkspaceLoadedFilename = null;
        renderTrackerWorkspace();
    });

    document.addEventListener('tracker:previewInstruments', (e) => {
        const detail = e?.detail || {};
        const aliases = Array.isArray(detail.aliases) ? detail.aliases : [];
        if (detail.playing) {
            // Stop Strudel pattern and ZzFXTrack Player export preview so only tracker preview is heard
            try {
                if (dom.repl.editor?.repl?.scheduler?.started) {
                    dom.repl.editor.stop();
                    updatePlayState(false);
                }
            } catch (_err) { /* ignore */ }
            if (isPreviewPlaying) {
                stopZzfxmSong();
                updatePreviewPlayButton(false);
            }
            if (aliases.length) {
                setPlaybackInstrumentAliases('tracker-preview', aliases);
            }
        } else {
            clearPlaybackInstrumentAliases('tracker-preview');
        }
    });

    document.addEventListener('instruments:updated', async () => {
        const { getDefragmentedInstruments } = await import('./instrument-manager.js');
        const instruments = getDefragmentedInstruments();
        const instrumentList = instruments.map(inst => ({
            id: inst.strudelAlias,
            name: inst.strudelAlias,
            params: inst.params,
        }));

        if (isTrackerOpen()) {
            updateTrackerInstruments(instrumentList);
            scheduleTrackerPreviewInstrumentRefresh();
        }

        if (isArrangementPreviewPlaying()) {
            const currentByFilename = arrangementPreviewContext?.trackerStateByFilename || {};
            const resolvedTrackerStateByFilename = {};
            for (const [filename, ts] of Object.entries(currentByFilename)) {
                resolvedTrackerStateByFilename[filename] = resolveTrackerStateChannelInstruments(ts);
            }
            arrangementPreviewContext = {
                ...arrangementPreviewContext,
                instrumentList,
                trackerStateByFilename: resolvedTrackerStateByFilename,
            };
            scheduleArrangementPreviewInstrumentUpdate(instrumentList);
        }
    });

    
    // Add keyboard shortcut to open tracker (Ctrl/Cmd + T)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 't') {
            // Only if not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                openTrackerModal();
            }
        }
    });
}

/**
 * Open the tracker modal with current instruments
 */
async function syncTrackerPreviewReferenceContext(options = {}) {
    const useArrangementReference = Boolean(
        appState.currentArrangementFilename
        && appState.arrangementDraftState
        && (
            isArrangementWorkspaceActive()
            || options?.returnToArrangementsOnClose
            || options?.returnToBlocksOnClose === false
        )
    );
    if (!useArrangementReference) {
        clearTrackerPreviewReferenceContext();
        return;
    }

    const context = await buildArrangementExportContext();
    if (!context) {
        clearTrackerPreviewReferenceContext();
        return;
    }
    setTrackerPreviewReferenceContext(context);
}

function scheduleTrackerPreviewInstrumentRefresh() {
    trackerPreviewInstrumentRefreshSeq += 1;
    const refreshSeq = trackerPreviewInstrumentRefreshSeq;
    if (trackerPreviewInstrumentRefreshTimeout) {
        clearTimeout(trackerPreviewInstrumentRefreshTimeout);
    }
    trackerPreviewInstrumentRefreshTimeout = setTimeout(async () => {
        trackerPreviewInstrumentRefreshTimeout = null;
        if (refreshSeq !== trackerPreviewInstrumentRefreshSeq) return;
        if (!isTrackerOpen()) return;

        const shouldSyncArrangementReference = Boolean(
            appState.currentArrangementFilename
            && appState.arrangementDraftState
            && (isArrangementWorkspaceActive() || arrangementLiveEditSession.active)
        );
        if (shouldSyncArrangementReference) {
            const context = await buildArrangementExportContext();
            if (refreshSeq !== trackerPreviewInstrumentRefreshSeq) return;
            if (context) {
                setTrackerPreviewReferenceContext(context);
            } else {
                clearTrackerPreviewReferenceContext();
            }
        }

        if (isTrackerPreviewPlaying()) {
            refreshTrackerPreview();
        }
    }, TRACKER_PREVIEW_INSTRUMENT_REFRESH_DEBOUNCE_MS);
}

async function openTrackerModal(options = {}) {
    if (options?.returnToArrangementsOnClose) {
        arrangementLiveEditSession = { active: true, committed: false };
    } else {
        arrangementLiveEditSession = { active: false, committed: false };
    }
    await syncTrackerPreviewReferenceContext(options);
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    
    const instrumentList = instruments.map(inst => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
    
    openTracker(instrumentList, options);
}

// Expose tracker open function globally for button access
window.openTrackerModal = openTrackerModal;

/**
 * Open the tracker modal for editing an existing block
 */
async function openTrackerModalForEdit(block, trackerState, options = {}) {
    if (options?.returnToArrangementsOnClose) {
        arrangementLiveEditSession = { active: true, committed: false };
    } else {
        arrangementLiveEditSession = { active: false, committed: false };
    }
    await syncTrackerPreviewReferenceContext(options);
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    
    const instrumentList = instruments.map(inst => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
    
    // Resolve latest block scope/name/denseRows from API so immutable system safeguards are accurate.
    let resolvedBlock = { ...block };
    if (block?.filename) {
        try {
            const fullBlock = await getBlockDetailOrNull(block.filename);
            if (fullBlock) {
                resolvedBlock = {
                    ...resolvedBlock,
                    scope: fullBlock?.scope ?? resolvedBlock.scope,
                    name: fullBlock?.name || resolvedBlock.name,
                    description: fullBlock?.description || resolvedBlock.description,
                };
            }
        } catch (_e) {
            // Keep existing block metadata if lookup fails.
        }
    }

    // Prepare block data for edit mode
    let recoveredTrackerState = trackerState;
    const recoveredBlockCache = readUnsavedBlockTrackerState(resolvedBlock.filename, resolvedBlock.scope);
    const recoveredBlockFromCache = Boolean(recoveredBlockCache);
    if (recoveredBlockCache) {
        recoveredTrackerState = recoveredBlockCache;
        setStatus('Recovered unsaved block edits from previous session', 'normal');
    }

    const blockData = {
        filename: resolvedBlock.filename,
        name: resolvedBlock.name,
        description: resolvedBlock.description,
        scope: normalizeScope(resolvedBlock.scope),
        trackerState: recoveredTrackerState,
        autoSaveOnInput: !!options.autoSaveOnInput,
        returnToArrangementsOnClose: options.returnToArrangementsOnClose,
        returnToBlocksOnClose: options.returnToBlocksOnClose,
    };
    
    openTrackerForEdit(instrumentList, blockData);
    if (recoveredBlockFromCache && blockData.filename && blockData.trackerState) {
        setTimeout(() => {
            scheduleTrackerAutoSave({
                filename: blockData.filename,
                trackerState: blockData.trackerState,
            });
        }, 500);
    }
}

/**
 * Setup blocks event listeners
 */
function setupBlocksEventListeners() {
	    // Blocks button in header
	    const blocksBtn = document.getElementById('blocksBtn');
	    blocksBtn?.addEventListener('click', () => {
            if (!appState.currentPatternFilename) return;
            openBlocksModal();
        });

	    // Stop Strudel playback when entering the Blocks modal (avoids confusion with previews/exports).
	    document.addEventListener('blocks:modalOpen', () => {
	        const editor = dom.repl.editor;
	        if (editor && editor.repl.scheduler.started) {
	            editor.stop();
	            updatePlayState(false);
	        }
          document.dispatchEvent(new CustomEvent('blocks:targetPatternScope', {
            detail: { scope: appState.currentPatternScope }
          }));
	    });

    // Stop any tracker-based preview playback when exiting the Blocks modal.
    document.addEventListener('blocks:modalClose', (e) => {
        if (e?.detail?.reason === 'arrangement') return;
        stopTrackerPreviewPlayback();
    });
	    
	    // Listen for blocks:create event (from Blocks modal)
    document.addEventListener('blocks:create', (e) => {
        const detail = e?.detail || {};
        Promise.resolve(openTrackerModal({
            returnToArrangementsOnClose: !!detail.returnToArrangementsOnClose,
            returnToBlocksOnClose: typeof detail.returnToBlocksOnClose === 'boolean' ? detail.returnToBlocksOnClose : undefined,
            arrangementInsertRowIndex: detail.arrangementInsertRowIndex,
        })).catch((err) => {
            console.error('[Blocks] Failed to open tracker for new block:', err);
            restoreSuspendedBlocksModals({ arrangement: !!detail.returnToArrangementsOnClose });
            setStatus('Failed to open tracker', 'error');
        });

    });
    
    // Listen for blocks:edit event (from Blocks modal)
    document.addEventListener('blocks:edit', async (e) => {
        const { block, trackerState, returnToArrangementsOnClose, returnToBlocksOnClose } = e.detail;
        try {
            await openTrackerModalForEdit(block, trackerState, { returnToArrangementsOnClose, returnToBlocksOnClose });
        } catch (err) {
            console.error('[Blocks] Failed to open tracker for edit:', err);
            restoreSuspendedBlocksModals({ arrangement: !!returnToArrangementsOnClose });
            setStatus('Failed to open block in tracker', 'error');
        }
    });
    
    // Listen for blocks:insert event
    document.addEventListener('blocks:insert', (e) => {
        const { pattern, name, preserveBlockBpm, blockBpm, blockSteps } = e.detail;
        if (pattern && dom.repl.editor) {
            // Get the current code and convert it to file format (with exports)
            let fileCode = editorToFile(dom.repl.editor.code || '');

            const toBlockSlug = (str) => slugify(str, { fallback: 'block', maxLength: 32 });

            fileCode = ensureBlocksSection(fileCode);

            const baseVar = `block_${toBlockSlug(name)}`;
            const varName = nextAvailableVarName(fileCode, baseVar);

            let scaledPattern = pattern;
            if (preserveBlockBpm && blockBpm) {
                const bpmMatch = fileCode.match(/export\s+const\s+bpm\s*=\s*(\d+)/);
                const patternBpm = bpmMatch ? Number(bpmMatch[1]) : 120;
                const factor = patternBpm && blockBpm ? (patternBpm / blockBpm) : 1;
                if (Number.isFinite(factor) && factor !== 1) {
                    const factorStr = Number(factor.toFixed(4));
                    scaledPattern = `(${pattern}).slow(${factorStr})`;
                }
            }

            // Keep row timing consistent: steps are 16ths, so 32 steps should take 2 cycles, etc.
            const stepsInt = Number.isInteger(blockSteps) ? blockSteps : null;
            if (stepsInt && stepsInt !== 16) {
                const stepFactor = stepsInt / 16;
                if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                    const stepFactorStr = Number(stepFactor.toFixed(4));
                    scaledPattern = `(${scaledPattern}).slow(${stepFactorStr})`;
                }
            }

            fileCode = fileCode.replace(
                /\/\/ BLOCKS END/,
                `const ${varName} = ${scaledPattern};\n// BLOCKS END`
            );

            fileCode = upsertPatternLayerShared(fileCode, varName, { validateExistingExpression: true });
            fileCode = normalizePatternStackShared(fileCode);
            
            // Convert back to editor format and set
            const editorCode = fileToEditor(fileCode);
            dom.repl.editor.setCode(editorCode);
            
            // Also save to server
            savePatternSource(appState.currentPatternFilename, fileCode, getDeveloperModeHeaders()).catch(() => {});
            
            setStatus(`Block "${name}" inserted into pattern`, 'success');
        }
    });

	    // Listen for arrangements:insert event
	    document.addEventListener('arrangements:insert', async (e) => {
	        const { arrangement } = e.detail || {};
	        if (!arrangement || !dom.repl.editor) return;

        let fileCode = editorToFile(dom.repl.editor.code || '');

        const toVarSlug = (str) => slugify(str, { fallback: 'x', maxLength: 32 });

	        fileCode = ensureBlocksSection(fileCode);
	        fileCode = ensureArrangementsSection(fileCode);

	        const rows = arrangement.arrangementState?.rows || [];
	        const wantedBlockFiles = Array.from(new Set(
	            rows.flatMap(r => Array.isArray(r.blocks) ? r.blocks : [])
	        ));

	        const blockVarByFilename = {};
	        const usedBlockVars = new Set();
	        for (const filename of wantedBlockFiles) {
	            try {
	                const block = await getBlockDetailOrNull(filename);
	                if (!block) continue;
	                // Use filename-derived var names to avoid name collisions between blocks.
	                const baseVar = `block_${toVarSlug(filename.replace(/\\.js$/, ''))}`;
	                const varName = usedBlockVars.has(baseVar) ? nextAvailableVarName(fileCode, baseVar) : baseVar;
	                blockVarByFilename[filename] = varName;
	                usedBlockVars.add(varName);

	                const already = new RegExp(`\\bconst\\s+${varName}\\b`).test(fileCode);
	                if (already) continue;

                const stepsInt = block?.trackerState?.steps;
                let scaledPattern = block.pattern;
                if (Number.isInteger(stepsInt) && stepsInt !== 16) {
                    const stepFactor = stepsInt / 16;
                    if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                        const stepFactorStr = Number(stepFactor.toFixed(4));
                        scaledPattern = `(${scaledPattern}).slow(${stepFactorStr})`;
                    }
                }

	                fileCode = fileCode.replace(
	                    /\/\/ BLOCKS END/,
	                    `const ${varName} = ${scaledPattern};\n// BLOCKS END`
	                );
	            } catch (err) {
	                console.warn('[Arranger] Failed to fetch block for insertion:', filename, err);
	            }
	        }

	        const arrName = arrangement.name || arrangement.arrangementState?.name || 'arrangement';
	        const baseArrVar = `arr_${toVarSlug(arrName)}`;
	        const arrVar = new RegExp(`\\bconst\\s+${baseArrVar}\\b`).test(fileCode) ? nextAvailableVarName(fileCode, baseArrVar) : baseArrVar;
	        {
	            const arrangeLines = rows.map(r => {
	                const reps = Number.isInteger(r.repeats) ? r.repeats : 1;
	                const blocks = Array.isArray(r.blocks) ? r.blocks : [];
	                if (!blocks.length) {
                    return `  [${reps}, silence]`;
                }
                const vars = blocks.map(f => blockVarByFilename[f]).filter(Boolean);
                if (!vars.length) return `  [${reps}, silence]`;
                return `  [${reps}, stack(${vars.join(', ')})]`;
            });

	            const arrangeExpr = `arrange(\n${arrangeLines.join(',\n')}\n)`;
	            fileCode = fileCode.replace(
	                /\/\/ ARRANGEMENTS END/,
	                `const ${arrVar} = ${arrangeExpr};\n// ARRANGEMENTS END`
	            );
	        }

	        fileCode = upsertPatternLayerShared(fileCode, arrVar);
	        fileCode = normalizePatternStackShared(fileCode);

        const editorCode = fileToEditor(fileCode);
        dom.repl.editor.setCode(editorCode);

        savePatternSource(appState.currentPatternFilename, fileCode, getDeveloperModeHeaders()).catch(() => {});

        setStatus(`Arrangement "${arrName}" inserted into pattern`, 'success');
    });

	    // Listen for blocks:preview event
	    document.addEventListener('blocks:preview', async (e) => {
	        const { trackerState } = e.detail || {};
	        if (!trackerState) return;

        const { getDefragmentedInstruments } = await import('./instrument-manager.js');
        const instruments = getDefragmentedInstruments();
        const instrumentList = instruments.map(inst => ({
            id: inst.strudelAlias,
            name: inst.strudelAlias,
            params: inst.params,
        }));

	        const resolved = resolveTrackerStateChannelInstruments(trackerState);
	        previewTrackerStateOnce(resolved, instrumentList, (resolved || trackerState).bpm || 120, getPlaybackMixSettings());
	    });

        installArrangementPreviewEventListeners();

        document.addEventListener('tracker:stateChanged', (e) => {
            const { filename, trackerState, arrangementInsertRowIndex, name, pattern, immediate } = e.detail || {};
            if (!trackerState) return;
            if (filename && (appState.currentArrangementFilename || appState.activeArrangementBlockFilename)) {
                scheduleTrackerAutoSave({ filename, trackerState, name, pattern, immediate });
            }

            if (filename) {
                setArrangementLiveOverride({ filename, trackerState });
            } else if (Number.isInteger(arrangementInsertRowIndex)) {
                setArrangementLiveOverride({ rowIndex: arrangementInsertRowIndex, trackerState });
            }
        });

        document.addEventListener('tracker:closed', (e) => {
            if (!e?.detail?.returnToArrangementsOnClose) return;
            const wasCommitted = arrangementLiveEditSession.active && arrangementLiveEditSession.committed;
            arrangementLiveEditSession = { active: false, committed: false };
            clearArrangementLiveOverrides({ scheduleUpdate: false });
            if (!isArrangementPreviewPlaying()) return;
            if (!arrangementPreviewContext?.arrangementState) return;
            if (wasCommitted) return;
            const rerender = () => {
	                updateArrangementPreview({
	                    arrangementState: arrangementPreviewContext.arrangementState,
	                    trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
	                    instrumentList: arrangementPreviewContext.instrumentList,
	                    bpm: arrangementPreviewContext.bpm,
                        mixSettings: getPlaybackMixSettings(),
	                    keepPosition: true,
	                });
            };
            if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                window.requestIdleCallback(rerender, { timeout: 200 });
            } else {
                setTimeout(rerender, 0);
            }
        });
    
    // Keyboard shortcut for blocks (Ctrl/Cmd + B)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            if (!appState.currentPatternFilename) return;
            // Only if not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                openBlocksModal();
            }
        }
    });
}



document.addEventListener('arrangement:displayNameChanged', (e) => {
    const { filename, name } = e?.detail || {};
    if (!filename) return;
    updateArrangementDisplayName(filename, name);
});

document.addEventListener('arrangements:saved', () => {
    refreshArrangementList();
});

document.addEventListener('block:displayNameChanged', (e) => {
    const { filename, name } = e?.detail || {};
    if (!filename) return;
    updateBlockDisplayName(filename, name);
});

// Listen for tracker:saveBlock event (when saving edits)
document.addEventListener('tracker:saveBlock', async (e) => {
    const { isNewBlock, filename, name, description, pattern, trackerState, scope, returnToArrangementsOnClose, arrangementInsertRowIndex } = e.detail;
    
    if (isNewBlock) {
        // Handle new block creation
        const result = await saveBlock(name, description || "Created in tracker", pattern, trackerState, scope || 'user');
        if (result) {
            // Keep footer status quiet for block creation; the UI updates immediately.
            setStatus('', 'normal');
            if (returnToArrangementsOnClose && Number.isInteger(arrangementInsertRowIndex)) {
                const createdBlock = result?.block || null;
                if (createdBlock?.filename) {
                    document.dispatchEvent(new CustomEvent('arrangements:blockCreated', {
                        detail: {
                            rowIndex: arrangementInsertRowIndex,
                            block: createdBlock,
                        }
                    }));
                }
            }
            if (returnToArrangementsOnClose) {
                arrangementLiveEditSession.committed = true;
                if (isArrangementPreviewPlaying()) {
                    const createdBlock = result?.block || null;
                    if (createdBlock?.filename) {
                        arrangementPreviewContext.trackerStateByFilename[createdBlock.filename] = trackerState;
                    }
                }
            }
            // Close tracker and return to blocks list
            closeTracker();
            if (!returnToArrangementsOnClose) {
                if (isArrangementWorkspaceActive()) {
                    const createdBlock = result?.block || null;
                    if (createdBlock?.filename) {
                        appState.activeArrangementBlockFilename = createdBlock.filename;
                        trackerWorkspaceLoadedFilename = null;
                    }
                    await refreshBlocksLibrary();
                    renderArrangementWorkspace();
                    renderTrackerWorkspace();
                } else {
                    openBlocksModal('blocks');
                }
            }
        } else {
            setStatus('Failed to create block', 'error');
        }
    } else {
        // Handle existing block update
        // Update the block
        const updateResult = await updateBlock(filename, name, description, pattern, trackerState, scope || 'user');
        if (updateResult && updateResult.ok !== false) {
            const updatedFilename = updateResult.filename || filename;
            const previousFilename = updateResult.previousFilename || filename;
            setStatus(`Block "${name}" updated successfully`, 'success');
            try {
                if (returnToArrangementsOnClose) {
                    arrangementLiveEditSession.committed = true;
                    if (isArrangementPreviewPlaying() && updatedFilename) {
                        if (!arrangementPreviewContext.trackerStateByFilename || typeof arrangementPreviewContext.trackerStateByFilename !== 'object') {
                            arrangementPreviewContext.trackerStateByFilename = {};
                        }
                        if (previousFilename && previousFilename !== updatedFilename) {
                            const oldState = arrangementPreviewContext.trackerStateByFilename?.[previousFilename];
                            if (oldState && !arrangementPreviewContext.trackerStateByFilename?.[updatedFilename]) {
                                arrangementPreviewContext.trackerStateByFilename[updatedFilename] = oldState;
                            }
                            if (arrangementPreviewContext.trackerStateByFilename) {
                                delete arrangementPreviewContext.trackerStateByFilename[previousFilename];
                            }
                            clearArrangementLiveOverride({ filename: previousFilename, scheduleUpdate: false });
                        }
                        arrangementPreviewContext.trackerStateByFilename[updatedFilename] = trackerState;
                        clearArrangementLiveOverride({ filename: updatedFilename, scheduleUpdate: false });
                    }
                }
            } catch (syncErr) {
                console.error('[Tracker Save] Arrangement sync failed:', syncErr);
            }
            closeTracker();
            if (!returnToArrangementsOnClose) {
                if (isArrangementWorkspaceActive()) {
                    if (updatedFilename) {
                        appState.activeArrangementBlockFilename = updatedFilename;
                    }
                    trackerWorkspaceLoadedFilename = null;
                    await refreshBlocksLibrary();
                    renderArrangementWorkspace();
                    renderTrackerWorkspace();
                } else {
                    openBlocksModal('blocks');
                }
            }
        } else {
            setStatus(`Failed to update block${updateResult?.error ? `: ${updateResult.error}` : ''}`, 'error');
        }
    }
});

// Listen for tracker:duplicateBlock (create a new block with same content, name suffix -2, -3, …)
document.addEventListener('tracker:duplicateBlock', async (e) => {
    const { filename, name, description, pattern, trackerState, scope } = e.detail || {};
    const baseName = String(name || '').trim() || 'block';

    let existing = [];
    try {
        existing = await listBlocksOrEmpty();
    } catch (_) {}
    const existingNames = new Set((existing || []).map((b) => String(b?.name ?? '').toLowerCase()));

    let duplicateName = `${baseName}-2`;
    let n = 2;
    while (existingNames.has(duplicateName.toLowerCase())) {
        n += 1;
        duplicateName = `${baseName}-${n}`;
    }

    const result = await saveBlock(duplicateName, description || `Duplicate of ${baseName}`, pattern, trackerState, scope || 'user');
    if (result && result.ok !== false && result.block) {
        const createdBlock = result.block;
        appState.activeArrangementBlockFilename = createdBlock.filename;
        if (appState.currentArrangementFilename) arrangementSelectedBlockByArrangement[appState.currentArrangementFilename] = createdBlock.filename;
        trackerWorkspaceLoadedFilename = null;

        setStatus(`Block "${duplicateName}" created`, 'success');
        if (isArrangementWorkspaceActive()) {
            await refreshBlocksLibrary();
            renderArrangementWorkspace();
            renderTrackerWorkspace();
        } else {
            await refreshBlocksLibrary();
            openBlocksModal('blocks');
        }
    } else {
        setStatus('Failed to duplicate block', 'error');
    }
});

// Start
init();
