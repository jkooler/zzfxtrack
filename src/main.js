/**
 * Module: main (composition root)
 * Purpose: App bootstrap and dependency wiring across feature modules.
 *
 * Import groups: Strudel/audio → app shell → legacy modules → features (by area) → shared.
 * Feature deps objects use alphabetical key order for consistency (see feature module headers).
 */

// --- Strudel, audio, and core runtime ---
import '@strudel/repl/index.mjs';
import { codemirrorSettings, themes as strudelReplThemes, updateMiniLocations } from '@strudel/codemirror';
import { getAudioContext } from '@strudel/webaudio';
import '@melloware/coloris/dist/coloris.css';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { buildSong, playZzFXTrackSong, stopZzFXTrackSong } from './zzfxtrack-player.js';
import { attachVisualizer } from './visualizer.js';

// --- App shell (dom, state, API) ---
import { dom } from './app/dom.js';
import { appState } from './app/state.js';
import { createArrangement, deleteArrangementByFilename, deleteBlockByFilenameWithConflictInfo, deletePatternByFilename, getArrangement, getArrangementOrNull, getBlockDetailOrNull, getPatternMetaTextOrNull, getPatternSource, getPatternSourceOrEmpty, listArrangements, listArrangementsOrEmpty, listBlocksOrEmpty, listPatterns, renameArrangementFile, renamePatternFile, saveArrangement, saveArrangementKeepalive, saveBlockDetail, saveBlockDetailKeepalive, saveExportedJsFile, saveExportedJsonFile, savePatternSource, savePatternSourceKeepalive, sendPatternSourceBeacon, updateInstrumentsSourceFile } from './app/api.js';

// --- Legacy / shared app modules (instruments, tracker, blocks, mix, unload, dialog) ---
import { initInstrumentUI, hideInitOverlay, getInstrumentsForExporter, updateInstrumentUsage, updatePatternSelectionState, updateArrangementSelectionState, refreshInstrumentListUI, setPlaybackInstrumentAliases, clearPlaybackInstrumentAliases, setupScrubInteraction } from './instrument-ui.js';
import { setInstrumentScope, getDefragmentedInstruments } from './instrument-manager.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';
import { initTracker, openTracker, openTrackerForEdit, closeTracker, isTrackerOpen, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState, previewTrackerStateOnce, startArrangementPreview, stopArrangementPreview, primeArrangementPreviewBuffer, updateArrangementPreview, isArrangementPreviewPlaying, setArrangementLiveOverride, clearArrangementLiveOverride, clearArrangementLiveOverrides, primePreviewAudioContext, stopTrackerPreviewPlayback, renderArrangementStateForExport, flushTrackerSaveForBlockSwitch, clearArrangementPendingLiveSwap, isTrackerPreviewPlaying, refreshTrackerPreview, scheduleArrangementPreviewInstrumentUpdate, setTrackerPreviewReferenceContext, clearTrackerPreviewReferenceContext } from './tracker.js';
import { resolveTrackerStateChannelInstruments } from './instrument-rename-map.js';
import { initBlocks, openBlocksModal, isBlocksModalOpen, saveBlock, updateBlock, BLOCKS_FOLDER_STATE_KEY, restoreSuspendedBlocksModals } from './blocks.js';
import { DEFAULT_PLAYBACK_MIX_SETTINGS, sanitizePlaybackMixSettings } from './mix-settings.js';
import { setupBeforeUnloadHandler, registerBeforeUnloadFlusher, registerBeforeUnloadConfirmer } from './unload.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { createIcons, icons } from 'lucide';

// --- Features: instruments ---
import { reloadInstruments } from './features/instruments/instrument-runtime.js';
import { configureInstrumentReferenceSync } from './features/instruments/instrument-reference-sync.js';

// --- Features: patterns ---
import { configurePatternList, getPatternEntry, normalizePatternEntries, refreshPatternList, refreshPatternListActiveState, updatePatternListVisualizer } from './features/patterns/pattern-list.js';
import { configurePatternController, createNewPattern, deletePattern, loadPattern, renamePattern, saveCurrentPattern } from './features/patterns/pattern-controller.js';
import { configurePatternEditor, editorToFile, fileToEditor, setupPatternEditorAutosave, validateCodeForExport } from './features/patterns/pattern-editor.js';
import { configurePatternMeta, loadPatternMeta, normalizePatternBaseName, savePatternMeta, updatePatternAdvancedSettings, updatePatternScope } from './features/patterns/pattern-meta.js';

// --- Features: arrangements ---
import { configureArrangementList, getArrangementEntry, refreshArrangementList, refreshArrangementListActiveState, updateArrangementListScopeVisualizer } from './features/arrangements/arrangement-list.js';
import { buildArrangementStatePayload, canRecoverUnsavedForScope, cloneArrangementState, configureArrangementPersistence, emitArrangementStateChanged, getArrangementReadonly, readUnsavedArrangementState, saveCurrentArrangement, scheduleArrangementAutoSave } from './features/arrangements/arrangement-persistence.js';
import { configureArrangementPreview, scheduleArrangementPreviewPrime } from './features/arrangements/arrangement-preview.js';
import { closeNewArrangementModal, configureArrangementController, createNewArrangement, createUntitledBlock, deleteArrangement, loadArrangement, openNewArrangementModal, renameArrangement } from './features/arrangements/arrangement-controller.js';
import { buildArrangementExportContext, configureArrangementExportContext, getArrangementInstrumentList, updateArrangementInstrumentUsage } from './features/arrangements/arrangement-export-context.js';
import { configureArrangementPreviewEvents, installArrangementPreviewEventListeners } from './features/arrangements/arrangement-preview-events.js';
import { applyArrangementPreviewAfterBlockRemoved, clearArrangementPlaybackInstrumentAliases, configureArrangementPreviewRuntime, updateArrangementPlaybackInstrumentAliases } from './features/arrangements/arrangement-preview-runtime.js';
import { applyArrangementWorkspacePlayhead, clearArrangementWorkspacePlayheadVisuals, configureArrangementWorkspace, renderArrangementWorkspace, showArrangementWorkspace, updateArrangementWorkspaceChipSteps, updateArrangementWorkspacePreviewButtonState } from './features/arrangements/arrangement-workspace.js';

// --- Features: tracker ---
import { configureTrackerController, openTrackerModal, openTrackerModalForEdit, scheduleTrackerAutoSave } from './features/tracker/tracker-controller.js';
import { configureTrackerPreviewSync, scheduleTrackerPreviewInstrumentRefresh } from './features/tracker/tracker-preview-sync.js';
import { configureTrackerWorkspace, renderTrackerWorkspace, undockTrackerModalFromWorkspace } from './features/tracker/tracker-workspace.js';

// --- Features: blocks ---
import { configureBlockLibrary, refreshBlocksLibrary } from './features/blocks/block-library.js';
import { configureBlockController, deleteBlockFromLibrary, setupBlocksEventListeners as setupBlocksFeatureEventListeners } from './features/blocks/block-controller.js';

// --- Features: playback & export ---
import { buildExportLengthWarningMessage, estimateExportSizeBytes, formatExportSize, getExportDurationSeconds, inferArrangeCyclesFromCode, shouldWarnExportLength } from './features/playback/export-actions.js';
import { configurePlaybackController } from './features/playback/playback-controller.js';
import { buildZzFXTrackSongJsModule, configureExportPreview, installExportPreviewHandlers, renderSongDataPreview, updatePreviewPlayButton } from './features/playback/export-preview.js';
import { configureExportExecution, exportCurrentArrangement as runExportCurrentArrangement, exportCurrentPattern as runExportCurrentPattern } from './features/playback/export-execution.js';
import { applyPlaybackMixSettingsToInputs, configureExportSettings, getPlaybackMixSettings, getWavExportSettings, inferPlaybackPresetId, normalizePlaybackPresetId, setPlaybackPresetControl, setupExportSettingsModal } from './features/playback/export-settings.js';
import { configureExportWav, exportArrangementWav, exportPatternWav } from './features/playback/export-wav.js';

// --- Features: project (import/export bundle) ---
import { buildArrangementSourceFromApi, buildBlockSourceFromApi, parseBlockSource } from './features/project/bundle-utils.js';
import { configureProjectExport, downloadProjectBundle } from './features/project/project-export.js';
import { configureProjectImport, installProjectImportHandlers } from './features/project/project-import.js';

// --- Features: settings ---
import { configureAdvancedSettings, installAdvancedSettingsHandlers, openAdvancedSettingsModal } from './features/settings/advanced-settings.js';
import { configureDevMode, getDeveloperModeHeaders, isDeveloperModeEnabled, setDeveloperModeEnabled, updateAdvancedSettingsButtonsVisibility, updateDevModeToolbarLabelVisibility } from './features/settings/dev-mode.js';
import { configureExternalLinks, setupExternalLinkInterception } from './features/settings/external-links.js';
import { configureSystemSettings, installSystemSettingsHandlers, scopeStrudelThemeVarsToRepl } from './features/settings/system-settings.js';
import { applyInitialColorTheme } from './features/settings/theme-controller.js';

// --- Features: UI (view switching, status, modals, touch) ---
import { setStatus, clearStatusAfter, configureStatusBar, installStatusEventListener } from './features/ui/status-bar.js';
import { configureStaticModals, installStaticModalHandlers } from './features/ui/static-modals.js';
import { setupListTouchActivation } from './features/ui/touch-activation.js';
import { closeExportMenu, configureViewSwitching, isArrangementWorkspaceActive, refreshZzFXTrackPreviewControlsVisibility, setExportControlsDisabled, showEditor, showIntroduction, showWelcome, toggleExportMenu, updateFooterExportActionLabels } from './features/ui/view-switching.js';

// --- Shared utilities ---
import { ensureArrangementsSection, ensureBlocksSection, nextAvailableVarName, normalizePatternStack as normalizePatternStackShared, slugify, upsertPatternLayer as upsertPatternLayerShared } from './shared/code-transform-utils.js';
import { escapeHtml } from './shared/formatters.js';

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
let autoSaveTimeout = null; // Debounce timer for auto-save
let isPreviewPlaying = false;
let playingPatternFilename = null;
let isStrudelPaused = false; // true after Shift+click stop (pause); next play resumes
let playBtnShiftHover = false; // shift held and mouse over play button (for pause icon)
let renameDebounceTimeout = null;
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

// --- Wiring: configure* calls (order: playback → view → patterns → arrangements → tracker → blocks → instruments → export → project → settings → UI) ---
configurePlaybackController({
    getEditor: () => dom.repl?.editor || null,
});

configureViewSwitching({
    getDom: () => dom,
    getLastExportedData: () => lastExportedData,
    getLastExportedContext: () => lastExportedContext,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    setCurrentPatternFilename: (value) => { appState.currentPatternFilename = value; },
    setCurrentPatternScope: (value) => { appState.currentPatternScope = value; },
    setCurrentArrangementFilename: (value) => { appState.currentArrangementFilename = value; },
    setCurrentArrangementScope: (value) => { appState.currentArrangementScope = value; },
    setArrangementDraftState: (value) => { appState.arrangementDraftState = value; },
    setActiveArrangementBlockFilename: (value) => { appState.activeArrangementBlockFilename = value; },
    setPlayingPatternFilename: (value) => { playingPatternFilename = value; },
    undockTrackerModalFromWorkspace,
    updatePatternSelectionState,
    updateArrangementSelectionState,
    updateAdvancedSettingsButtonsVisibility,
    updateArrangementListScopeVisualizer,
    renderPlayButton,
    updatePatternListVisualizer,
    clearZzFXTrackPreviewData,
    refreshArrangementListActiveState,
    renderArrangementWorkspace,
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
    getStrudelTabElement: () => dom.strudelTab,
    attachVisualizer,
});

configurePatternMeta({
    isDemoMode: () => DEMO_MODE,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentPatternMetadata: () => appState.currentPatternMetadata,
    setCurrentPatternScope: (scope) => { appState.currentPatternScope = scope; },
    setCurrentPatternMetadata: (metadata) => { appState.currentPatternMetadata = metadata; },
    updatePatternNameReadOnly: () => {
        dom.patternNameInput.readOnly = DEMO_MODE;
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
    clearZzFXTrackPreviewData,
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
    getBlocksTabElement: () => dom.blocksTab,
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
    refreshZzFXTrackPreviewControlsVisibility,
    updateAdvancedSettingsButtonsVisibility,
    updateFooterExportActionLabels,
    updateArrangementListScopeVisualizer,
    updatePatternListVisualizer,
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

configureTrackerController({
    isDemoMode: () => DEMO_MODE,
    getBlockByFilename,
    normalizeScope,
    isDeveloperModeEnabled,
    updateBlock,
    getAppState: () => appState,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    setSelectedBlockForArrangement: (filename, blockFilename) => { arrangementSelectedBlockByArrangement[filename] = blockFilename; },
    setActiveArrangementBlockFilename: (filename) => { appState.activeArrangementBlockFilename = filename; },
    refreshBlocksLibrary,
    renderArrangementWorkspace,
    renderTrackerWorkspace,
    setStatus,
    getTrackerAutoSaveTimeout: () => trackerAutoSaveTimeout,
    setTrackerAutoSaveTimeout: (value) => { trackerAutoSaveTimeout = value; },
    getPendingTrackerSavePayload: () => pendingTrackerSavePayload,
    setPendingTrackerSavePayload: (value) => { pendingTrackerSavePayload = value; },
    getArrangementLiveEditSession: () => arrangementLiveEditSession,
    setArrangementLiveEditSession: (value) => { arrangementLiveEditSession = value; },
    isArrangementWorkspaceActive,
    openTracker,
    openTrackerForEdit,
    getDefragmentedInstruments: async () => getDefragmentedInstruments(),
    getBlockDetailOrNull,
    readUnsavedBlockTrackerState,
    logError: (...args) => console.error(...args),
});

configureTrackerPreviewSync({
    getAppState: () => appState,
    isArrangementWorkspaceActive,
    buildArrangementExportContext,
    setTrackerPreviewReferenceContext,
    clearTrackerPreviewReferenceContext,
    getArrangementLiveEditSession: () => arrangementLiveEditSession,
    getTrackerPreviewInstrumentRefreshSeq: () => trackerPreviewInstrumentRefreshSeq,
    setTrackerPreviewInstrumentRefreshSeq: (value) => { trackerPreviewInstrumentRefreshSeq = value; },
    getTrackerPreviewInstrumentRefreshTimeout: () => trackerPreviewInstrumentRefreshTimeout,
    setTrackerPreviewInstrumentRefreshTimeout: (value) => { trackerPreviewInstrumentRefreshTimeout = value; },
    isTrackerOpen,
    isTrackerPreviewPlaying,
    refreshTrackerPreview,
    getTrackerPreviewInstrumentRefreshDebounceMs: () => TRACKER_PREVIEW_INSTRUMENT_REFRESH_DEBOUNCE_MS,
});

configureTrackerWorkspace({
    getTrackerWorkspacePane: () => dom.trackerWorkspacePane,
    getActiveArrangementBlockFilename: () => appState.activeArrangementBlockFilename,
    getBlockByFilename,
    getTrackerWorkspaceLoadedFilename: () => trackerWorkspaceLoadedFilename,
    setTrackerWorkspaceLoadedFilename: (value) => { trackerWorkspaceLoadedFilename = value; },
    getTrackerWorkspaceLoadToken: () => trackerWorkspaceLoadToken,
    setTrackerWorkspaceLoadToken: (value) => { trackerWorkspaceLoadToken = value; },
    isTrackerOpen,
    closeTracker,
    openTrackerModalForEdit,
    setStatus,
    getActiveArrangementBlockFilenameForDrag: () => appState.activeArrangementBlockFilename,
    logError: (...args) => console.error(...args),
    getTrackerDockRestoreParent: () => trackerDockRestoreParent,
    setTrackerDockRestoreParent: (value) => { trackerDockRestoreParent = value; },
    getTrackerDockRestoreNextSibling: () => trackerDockRestoreNextSibling,
    setTrackerDockRestoreNextSibling: (value) => { trackerDockRestoreNextSibling = value; },
});

configureBlockController({
    isDemoMode: () => DEMO_MODE,
    getBlockByFilename,
    normalizeScope,
    isDeveloperModeEnabled,
    setStatus,
    getArrangementEntriesCache: () => appState.arrangementEntriesCache,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getArrangementDraftState: () => appState.arrangementDraftState,
    getCurrentArrangementScope: () => appState.currentArrangementScope,
    alertDialog,
    confirmDialog,
    deleteBlockByFilenameWithConflictInfo,
    getDeveloperModeHeaders,
    getActiveArrangementBlockFilename: () => appState.activeArrangementBlockFilename,
    setActiveArrangementBlockFilename: (value) => { appState.activeArrangementBlockFilename = value; },
    renderTrackerWorkspace,
    refreshBlocksLibrary,
    logError: (...args) => console.error(...args),
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    openBlocksModal,
    getReplEditor: () => dom.repl.editor,
    updatePlayState,
    getCurrentPatternScope: () => appState.currentPatternScope,
    dispatchBlocksTargetPatternScope: (detail) => {
        document.dispatchEvent(new CustomEvent('blocks:targetPatternScope', { detail }));
    },
    stopTrackerPreviewPlayback,
    openTrackerModal,
    openTrackerModalForEdit,
    restoreSuspendedBlocksModals,
    editorToFile,
    fileToEditor,
    slugify,
    ensureBlocksSection,
    ensureArrangementsSection,
    nextAvailableVarName,
    upsertPatternLayer: upsertPatternLayerShared,
    normalizePatternStack: normalizePatternStackShared,
    savePatternSource,
    getBlockDetailOrNull,
    getDefragmentedInstruments: async () => getDefragmentedInstruments(),
    resolveTrackerStateChannelInstruments,
    previewTrackerStateOnce,
    getPlaybackMixSettings,
});

configureBlockLibrary({
    getBlocksLibraryList: () => dom.blocksLibraryList,
    getBlocksLibraryCache: () => appState.blocksLibraryCache,
    setBlocksLibraryCache: (value) => { appState.blocksLibraryCache = value; },
    getActiveArrangementBlockFilename: () => appState.activeArrangementBlockFilename,
    setActiveArrangementBlockFilename: (value) => { appState.activeArrangementBlockFilename = value; },
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    setSelectedBlockForArrangement: (filename, blockFilename) => { arrangementSelectedBlockByArrangement[filename] = blockFilename; },
    renderArrangementWorkspace,
    renderTrackerWorkspace,
    flushTrackerSaveForBlockSwitch,
    createIcons,
    icons,
    normalizeScope,
    isDeveloperModeEnabled,
    escapeHtml,
    listBlocksOrEmpty,
    isDemoMode: () => DEMO_MODE,
    getDemoBlockSourceKeys: () => Array.from(demoBlockSourceByFile.keys()),
    deleteBlockFromLibrary,
    getBlocksFolderStateKey: () => BLOCKS_FOLDER_STATE_KEY,
    setStatus,
    logError: (...args) => console.error(...args),
});

configureInstrumentReferenceSync({
    getDeveloperModeHeaders,
    refreshPatternList,
    isDemoMode: () => DEMO_MODE,
});

configureExportSettings({
    getDom: () => dom,
    sanitizePlaybackMixSettings,
    getPlaybackLoudnessPresets: () => PLAYBACK_LOUDNESS_PRESETS,
    getDefaultPlaybackPresetId: () => DEFAULT_PLAYBACK_PRESET_ID,
    savePatternMeta,
    updateArrangementPreview,
    isTrackerPreviewPlaying,
    refreshTrackerPreview,
});

configureExportPreview({
    getDom: () => dom,
    getLastExportedData: () => lastExportedData,
    getLastExportedMeta: () => lastExportedMeta,
    getLastExportedContext: () => lastExportedContext,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getPlaybackMixSettings,
    getAudioContext,
    stopAllPlaybackForSelectionChange,
    playZzFXTrackSong,
    stopZzFXTrackSong,
    triggerFileDownload,
    setStatus,
    getIsPreviewPlaying: () => isPreviewPlaying,
    setIsPreviewPlaying: (value) => { isPreviewPlaying = value; },
    createIcons,
    icons,
});

configureExportWav({
    buildSong,
    triggerFileDownload,
    setStatus,
    logError: (...args) => console.error(...args),
});

configureExportExecution({
    getDom: () => dom,
    isDemoMode: () => DEMO_MODE,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentPatternMetadata: () => appState.currentPatternMetadata,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getCurrentArrangementDraftState: () => appState.arrangementDraftState,
    saveCurrentPattern,
    saveCurrentArrangement,
    validateCodeForExport,
    confirmDialog,
    setStatus,
    clearStatusAfter,
    inferArrangeCyclesFromCode,
    shouldWarnExportLength,
    getExportDurationSeconds,
    estimateExportSizeBytes,
    formatExportSize,
    buildExportLengthWarningMessage,
    getInstrumentsForExporter,
    getDefragmentedInstruments,
    buildArrangementExportContext,
    getPlaybackMixSettings,
    setZzFXTrackPreviewData,
    buildZzFXTrackSongJsModule,
    saveExportedJsonFile,
    saveExportedJsFile,
    slugify,
    escapeHtml,
    logError: (...args) => console.error(...args),
});

configureProjectExport({
    isDemoMode: () => DEMO_MODE,
    getDemoPatternSourceByFile: () => demoPatternSourceByFile,
    getDemoBlockSourceByFile: () => demoBlockSourceByFile,
    getDemoArrangementSourceByFile: () => demoArrangementSourceByFile,
    normalizePatternEntries,
    listPatterns,
    listBlocksOrEmpty,
    listArrangementsOrEmpty,
    getPatternSourceOrEmpty,
    getPatternMetaTextOrNull,
    getBlockDetailOrNull,
    getArrangementOrNull,
    buildBlockSourceFromApi,
    buildArrangementSourceFromApi,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getEditorCode: () => dom.repl.editor?.code || '',
    editorToFile,
    triggerFileDownload,
    setStatus,
    getBundleManifestName: () => UPLOAD_BUNDLE_MANIFEST_NAME,
    getBundleKind: () => UPLOAD_BUNDLE_KIND,
    logError: (...args) => console.error(...args),
});

configureProjectImport({
    getDom: () => dom,
    isDemoMode: () => DEMO_MODE,
    getDemoPatternSourceByFile: () => demoPatternSourceByFile,
    getDemoBlockSourceByFile: () => demoBlockSourceByFile,
    getDemoArrangementSourceByFile: () => demoArrangementSourceByFile,
    listPatterns,
    normalizePatternEntries,
    listBlocksOrEmpty,
    listArrangementsOrEmpty,
    getPatternSourceOrEmpty,
    getBlockDetailOrNull,
    getArrangementOrNull,
    savePatternSource,
    saveBlockDetail,
    saveArrangement,
    getDeveloperModeHeaders,
    updateInstrumentsSourceFile,
    reloadInstruments,
    refreshPatternList,
    setStatus,
    getBundleManifestName: () => UPLOAD_BUNDLE_MANIFEST_NAME,
    getBundleKind: () => UPLOAD_BUNDLE_KIND,
    logError: (...args) => console.error(...args),
});

configureDevMode({
    isDemoMode: () => DEMO_MODE,
    getDom: () => dom,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
});

configureSystemSettings({
    getDom: () => dom,
    isDemoMode: () => DEMO_MODE,
    isDeveloperModeEnabled,
    setDeveloperModeEnabled,
    createIcons,
    getIcons: () => icons,
    getCodemirrorSettings: () => codemirrorSettings,
    getStrudelReplThemes: () => strudelReplThemes,
    updateReplEditorTheme: (theme) => {
        if (dom.repl?.editor) dom.repl.editor.updateSettings({ theme });
    },
    setPatternNameReadOnlyForDevMode: () => {
        if (dom.patternNameInput) {
            dom.patternNameInput.readOnly = DEMO_MODE;
        }
    },
    updateAdvancedSettingsButtonsVisibility,
    updateDevModeToolbarLabelVisibility,
    refreshPatternList,
    refreshArrangementList,
    refreshBlocksLibrary,
    refreshInstrumentListUI,
    logWarning: (...args) => console.warn(...args),
});

configureAdvancedSettings({
    isDemoMode: () => DEMO_MODE,
    getDom: () => dom,
    normalizeScope,
    isDeveloperModeEnabled,
    createIcons,
    getIcons: () => icons,
    setStatus,
    getDeveloperModeHeaders,
    updatePatternScope,
    savePatternAdvancedSettings: updatePatternAdvancedSettings,
    getPatternEntry,
    getCurrentPatternFilename: () => appState.currentPatternFilename,
    getCurrentPatternMetadata: () => appState.currentPatternMetadata,
    setCurrentPatternScope: (scope) => { appState.currentPatternScope = scope; },
    setCurrentPatternMetadata: (metadata) => { appState.currentPatternMetadata = metadata; },
    setPatternNameReadOnly: () => {
        dom.patternNameInput.readOnly = DEMO_MODE;
    },
    refreshPatternList,
    setInstrumentScope,
    autoUpdateInstrumentsFile,
    reloadInstruments,
    refreshInstrumentListUI,
    updateBlockScope,
    refreshBlocksLibrary,
    updateArrangementScope,
    saveArrangementSettings: saveArrangement,
    getCurrentArrangementFilename: () => appState.currentArrangementFilename,
    getCurrentArrangementDraftState: () => appState.arrangementDraftState,
    setCurrentArrangementScope: (scope) => { appState.currentArrangementScope = scope; },
    setCurrentArrangementDraftState: (state) => { appState.arrangementDraftState = state; },
    refreshArrangementList,
    renderArrangementWorkspace,
    dispatchResourceScopeChanged: (detail) => {
        document.dispatchEvent(new CustomEvent('resource-scope:changed', { detail }));
    },
    logError: (...args) => console.error(...args),
});

configureExternalLinks({
    getDocument: () => document,
    getWindow: () => window,
    getExternalLinkModal: () => dom.externalLinkModal,
    getConfirmExternalLinkButton: () => dom.confirmExternalLink,
    getCancelExternalLinkButton: () => dom.cancelExternalLink,
});

configureStatusBar({
    getDom: () => dom,
    escapeHtml,
    createIcons,
    icons,
});
installStatusEventListener();
configureStaticModals({
    getDom: () => dom,
    createIcons,
    getIcons: () => icons,
    isDemoMode: () => DEMO_MODE,
});

const PATTERN_FOLDER_STATE_KEY = 'zzfxtrack-folder-state-patterns-v1';
/** Default: user folder open, system collapsed. User toggles are persisted and restored on next launch. */
let patternFolderState = loadFolderState(PATTERN_FOLDER_STATE_KEY, { user: true, system: false });

const ARRANGEMENT_FOLDER_STATE_KEY = 'zzfxtrack-folder-state-arrangements-v1';
let arrangementFolderState = loadFolderState(ARRANGEMENT_FOLDER_STATE_KEY, { user: true, system: false });

applyInitialColorTheme();

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
        stopZzFXTrackSong();
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

function setZzFXTrackPreviewData(songData, meta = null, { type, filename, reveal = true } = {}) {
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
        refreshZzFXTrackPreviewControlsVisibility();
    }
}

function clearZzFXTrackPreviewData({ placeholder = '// Click GENERATE to create ZzFXTrack Player data' } = {}) {
    if (isPreviewPlaying) {
        stopZzFXTrackSong();
        updatePreviewPlayButton(false);
    }
    lastExportedData = null;
    lastExportedMeta = null;
    lastExportedContext = { type: null, filename: null };
    dom.previewJson.innerText = placeholder;
    refreshZzFXTrackPreviewControlsVisibility();
}

function handleSidebarTitleClick() {
    const wasNonIntroState = Boolean(
        appState.currentPatternFilename
        || appState.currentArrangementFilename
        || isArrangementWorkspaceActive()
        || (dom.editorContainer && dom.editorContainer.style.display === 'flex')
    );
    // If introduction is visible and a pattern is selected, return to that pattern; otherwise show introduction.
    if (dom.sidebarTitle?.classList.contains('active') && appState.currentPatternFilename) {
        showEditor();
    } else {
        showIntroduction();
        // Keep initial launch intro unselected, but mark intro selected after any non-intro state.
        if (wasNonIntroState) {
            dom.sidebarTitle?.classList.add('active');
        }
    }
}

// --- Initialization ---
async function init() {
    setStatus('Initializing...', 'normal');
    
    // Disable default samples (TidalCycles/Dirt) to ensure only ZzFX instruments are used
    dom.repl.prelude = `
// ZzFXTrack
// Default samples are disabled.
// Only ZzFX instruments (system + user) are available.
`;
    
    // 1. Initialize Strudel Core
    await initStrudel();
    
    // 2. Load instruments (system from instruments.system.js + user from localStorage) into Strudel
    await reloadInstruments();
    
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
    
    // 5. Reload instruments again after UI init (sync may have loaded user file)
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
    return Boolean(autoSaveTimeout && appState.currentPatternFilename);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;
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

function upsertBlockLibraryCacheEntry({
    previousFilename = null,
    filename,
    name,
    description,
    pattern,
    trackerState,
    scope,
}) {
    if (!filename) return;
    const previousKey = previousFilename || filename;
    const cache = Array.isArray(appState.blocksLibraryCache) ? appState.blocksLibraryCache.slice() : [];
    const previousIndex = cache.findIndex((entry) => entry?.filename === previousKey);
    const existingEntry = previousIndex >= 0
        ? cache[previousIndex]
        : (cache.find((entry) => entry?.filename === filename) || null);
    const nextEntry = {
        ...(existingEntry || {}),
        filename,
        name: name != null ? name : (existingEntry?.name || filename.replace(/\.js$/i, '')),
        description: description != null ? description : (existingEntry?.description || ''),
        pattern: pattern != null ? pattern : (existingEntry?.pattern || ''),
        trackerState: trackerState != null ? trackerState : (existingEntry?.trackerState || null),
        scope: scope != null ? scope : (existingEntry?.scope || 'user'),
    };
    if (previousIndex >= 0) {
        cache[previousIndex] = nextEntry;
    } else {
        const currentIndex = cache.findIndex((entry) => entry?.filename === filename);
        if (currentIndex >= 0) cache[currentIndex] = nextEntry;
        else cache.push(nextEntry);
    }
    appState.blocksLibraryCache = cache;
}

// async function deleteCurrentPattern() removed for new custom modal implementation below

// --- BAKING LOGIC ---

async function exportCurrentPattern(options = {}) {
    await runExportCurrentPattern(options);
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

async function exportCurrentPatternWav() {
    if (!appState.currentPatternFilename) return;

    await exportCurrentPattern({ revealZzFXTrackPreview: false });
    if (!lastExportedData) {
        setStatus('WAV export failed: no pattern data generated.', 'error');
        return;
    }

    try {
        const wavSettings = getWavExportSettings();
        const mixSettings = getPlaybackMixSettings();
        const wavName = appState.currentPatternFilename.replace(/\.js$/i, '.wav');
        exportPatternWav({
            lastExportedData,
            lastExportedMeta,
            mixSettings,
            wavSettings,
            outputFilename: wavName,
        });
        setStatus(`Downloaded WAV: ${wavName} (${wavSettings.sampleRate} Hz, ${wavSettings.bitDepth}-bit)`, 'success');
    } catch (e) {
        console.error(e);
        setStatus(`WAV export failed: ${e.message}`, 'error');
    }
}

async function exportCurrentArrangement() {
    await runExportCurrentArrangement();
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
        const wavSettings = getWavExportSettings();
        const wavName = appState.currentArrangementFilename.replace(/\.js$/i, '.wav');
        exportArrangementWav({
            renderResult,
            wavSettings,
            outputFilename: wavName,
        });
        setStatus(`Downloaded WAV: ${wavName} (${wavSettings.sampleRate} Hz, ${wavSettings.bitDepth}-bit)`, 'success');
    } catch (e) {
        console.error(e);
        setStatus(`Arrangement WAV export failed: ${e.message}`, 'error');
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
if (dom.downloadProjectBtn) dom.downloadProjectBtn.addEventListener('click', downloadProjectBundle);
installProjectImportHandlers();
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
        e.dataTransfer.setData('application/x-zzfxtrack-arr-chip', JSON.stringify({
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
            metadata: appState.currentPatternMetadata,
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
    updateArrangementListScopeVisualizer();
    updatePatternListVisualizer();
});
document.addEventListener('visualizer:ready', () => {
    updateArrangementListScopeVisualizer();
    updatePatternListVisualizer();
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
installAdvancedSettingsHandlers();
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
        setStatus('System patterns cannot be deleted. Enable developer mode to delete them.', 'normal');
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
    if (DEMO_MODE) return;
    // No-op: name is saved on blur only.
});

// Save/rename when leaving the input (only renames if name actually changed).
dom.patternNameInput.addEventListener('blur', () => {
    if (!appState.currentPatternFilename) return;
    if (DEMO_MODE) return;
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

installExportPreviewHandlers();


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
    updateArrangementListScopeVisualizer();
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

installStaticModalHandlers();
installSystemSettingsHandlers();

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
                stopZzFXTrackSong();
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

// Expose tracker open function globally for button access
window.openTrackerModal = openTrackerModal;

/**
 * Setup blocks event listeners
 */
function setupBlocksEventListeners() {
    setupBlocksFeatureEventListeners();
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
        const result = await saveBlock(name, description || "Created in tracker", pattern, trackerState, scope || 'user', {
            allowAutoSuffix: false,
        });
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
            const createdBlock = result?.block || null;
            if (createdBlock?.filename) {
                upsertBlockLibraryCacheEntry({
                    filename: createdBlock.filename,
                    name: createdBlock.name || name,
                    description: createdBlock.description ?? description,
                    pattern: createdBlock.pattern ?? pattern,
                    trackerState: createdBlock.trackerState ?? trackerState,
                    scope: createdBlock.scope ?? scope ?? 'user',
                });
            }
            // Close tracker and return to blocks list
            closeTracker();
            await refreshBlocksLibrary();
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
            upsertBlockLibraryCacheEntry({
                previousFilename,
                filename: updatedFilename,
                name,
                description,
                pattern,
                trackerState,
                scope: scope || 'user',
            });
            try {
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
                if (returnToArrangementsOnClose) {
                    arrangementLiveEditSession.committed = true;
                }
            } catch (syncErr) {
                console.error('[Tracker Save] Arrangement sync failed:', syncErr);
            }
            closeTracker();
            await refreshBlocksLibrary();
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
