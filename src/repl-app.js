import '@strudel/repl/index.mjs';
import { codemirrorSettings, themes as strudelReplThemes, updateMiniLocations } from '@strudel/codemirror';
import '@melloware/coloris/dist/coloris.css';
import Coloris from '@melloware/coloris';
import { instruments as staticInstruments, instrumentMonophonic as staticMonophonic } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { exportPattern } from './export-logic.js';
import { buildSong, playZzfxmSong, stopZzfxmSong } from './zzfxmicro-player.js';
import { attachVisualizer } from './visualizer.js';
import { getAudioContext } from '@strudel/webaudio';
import { initInstrumentUI, hideInitOverlay, getInstrumentsForExporter, updateInstrumentUsage, updatePatternSelectionState, updateArrangementSelectionState, refreshInstrumentListUI, setPlaybackInstrumentAliases, clearPlaybackInstrumentAliases, setupScrubInteraction } from './instrument-ui.js';
import { setInstrumentScope } from './instrument-manager.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';
import { createIcons, icons } from 'lucide';
import { initTracker, openTracker, openTrackerForEdit, closeTracker, isTrackerOpen, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState, previewTrackerStateOnce, startArrangementPreview, stopArrangementPreview, primeArrangementPreviewBuffer, updateArrangementPreview, isArrangementPreviewPlaying, setArrangementLiveOverride, clearArrangementLiveOverride, clearArrangementLiveOverrides, primePreviewAudioContext, stopTrackerPreviewPlayback, renderArrangementStateForExport, flushTrackerSaveForBlockSwitch, clearArrangementPendingLiveSwap, isTrackerPreviewPlaying, refreshTrackerPreview, scheduleArrangementPreviewInstrumentUpdate } from './tracker.js';
import { resolveTrackerStateChannelInstruments } from './instrument-rename-map.js';
import { initBlocks, openBlocksModal, isBlocksModalOpen, saveBlock, updateBlock, BLOCKS_FOLDER_STATE_KEY } from './blocks.js';
import { DEFAULT_PLAYBACK_MIX_SETTINGS, sanitizePlaybackMixSettings } from './mix-settings.js';
import { setupBeforeUnloadHandler, registerBeforeUnloadFlusher, registerBeforeUnloadConfirmer } from './unload.js';
import { confirmDialog, alertDialog } from './dialog.js';
import JSZip from 'jszip';

const DEMO_MODE = import.meta.env.MODE === 'demo';
const DEVELOPER_MODE_KEY = 'zzfxm-developer-mode';

setupBeforeUnloadHandler();

function isDeveloperModeEnabled() {
    if (DEMO_MODE) return false;
    try {
        return localStorage.getItem(DEVELOPER_MODE_KEY) === '1';
    } catch (_e) {
        return false;
    }
}

function setDeveloperModeEnabled(enabled) {
    if (DEMO_MODE) return;
    try {
        localStorage.setItem(DEVELOPER_MODE_KEY, enabled ? '1' : '0');
    } catch (_e) {
        // Ignore localStorage failures.
    }
    document.dispatchEvent(new CustomEvent('developer-mode:changed', { detail: { enabled: Boolean(enabled) } }));
}

function getDeveloperModeHeaders() {
    return isDeveloperModeEnabled() ? { 'X-Developer-Mode': '1' } : {};
}

function updateAdvancedSettingsButtonsVisibility() {
    const show = !DEMO_MODE;
    if (dom.openPatternAdvancedSettingsBtn) {
        const shouldShow = show && Boolean(currentPatternFilename) && !dom.patternNameInput.classList.contains('hidden');
        dom.openPatternAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
    }
    const arrangementWorkspaceSettingsBtn = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceAdvancedSettingsBtn');
    if (arrangementWorkspaceSettingsBtn) {
        const shouldShowArrangement = show && Boolean(currentArrangementFilename);
        arrangementWorkspaceSettingsBtn.classList.toggle('dev-only-hidden', !shouldShowArrangement);
    }
}

function updateDevModeToolbarLabelVisibility() {
    if (!dom.devModeToolbarLabel) return;
    const show = !DEMO_MODE && isDeveloperModeEnabled();
    dom.devModeToolbarLabel.classList.toggle('hidden', !show);
}
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
let currentPatternFilename = null;
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
const STATUS_ROW_COLLAPSE_MS = 3000;
const STATUS_ROW_TRANSITION_MS = 300;
let statusFadeClearTimeout = null;
let statusAutoCollapseTimeout = null;
let renameDebounceTimeout = null;
let pendingUploadBundle = null;
let patternEntriesCache = [];
let currentPatternScope = 'user';
let currentArrangementFilename = null;
let currentArrangementScope = 'user';
let arrangementEntriesCache = [];
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
let arrangementAutoSaveTimeout = null;
let arrangementRenameDebounceTimeout = null;
let arrangementPreviewPrimeTimeoutId = null;
let trackerAutoSaveTimeout = null;
let pendingTrackerSavePayload = null;
let arrangementDraftState = null;
let blocksLibraryCache = [];
let activeArrangementBlockFilename = null;
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

// --- DOM Elements ---
const dom = {
    repl: document.getElementById('repl'),
    sidebarTitle: document.getElementById('sidebarTitle'),
    patternList: document.getElementById('patternList'),
    arrangementList: document.getElementById('arrangementList'),
    blocksTab: document.getElementById('blocksTab'),
    newArrangementBtn: document.getElementById('newArrangementBtn'),
    patternNameInput: document.getElementById('patternNameInput'),
    openPatternAdvancedSettingsBtn: document.getElementById('openPatternAdvancedSettingsBtn'),
    playBtn: document.getElementById('playBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportBtnLabel: document.getElementById('exportBtnLabel'),
    exportWavBtn: document.getElementById('exportWavBtn'),
    exportWavBtnLabel: document.getElementById('exportWavBtnLabel'),
    newPatternBtn: document.getElementById('newPatternBtn'),
    statusMsg: document.getElementById('statusMsg'),
    footerStatusRow: document.getElementById('footerStatusRow'),
    demoModeBadge: document.getElementById('demoModeBadge'),
    devModeToolbarLabel: document.getElementById('devModeToolbarLabel'),
    
    // Views
    welcomeView: document.getElementById('welcomeView'),
    editorContainer: document.getElementById('editorContainer'),
    arrangementWorkspace: document.getElementById('arrangementWorkspace'),
    arrangementWorkspacePane: document.getElementById('arrangementWorkspacePane'),
    arrangementWorkspacePlaceholder: document.getElementById('arrangementWorkspacePlaceholder'),
    trackerWorkspacePane: document.getElementById('trackerWorkspacePane'),
    blocksLibrarySidebar: document.getElementById('blocksLibrarySidebar'),
    blocksLibraryList: document.getElementById('blocksLibraryList'),
    blocksLibraryToggle: document.getElementById('blocksLibraryToggle'),
    newSidebarBlockBtn: document.getElementById('newSidebarBlockBtn'),
    mainHeader: document.getElementById('mainHeader'),
    mainFooter: document.getElementById('mainFooter'),
    
    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    downloadProjectBtn: document.getElementById('downloadProjectBtn'),
    uploadProjectBtn: document.getElementById('uploadProjectBtn'),
    uploadProjectInput: document.getElementById('uploadProjectInput'),
    uploadProjectModal: document.getElementById('uploadProjectModal'),
    uploadProjectDropzone: document.getElementById('uploadProjectDropzone'),
    closeUploadProjectModalBtn: document.getElementById('closeUploadProjectModalBtn'),
    cancelUploadProjectBtn: document.getElementById('cancelUploadProjectBtn'),
    confirmUploadProjectBtn: document.getElementById('confirmUploadProjectBtn'),
    uploadProjectFilename: document.getElementById('uploadProjectFilename'),
    uploadProjectSummary: document.getElementById('uploadProjectSummary'),
    uploadProjectFooterMessage: document.getElementById('uploadProjectFooterMessage'),

    // System Settings Modal
    openSystemSettingsModalBtn: document.getElementById('openSystemSettingsModalBtn'),
    systemSettingsModal: document.getElementById('systemSettingsModal'),
    closeSystemSettingsModalBtn: document.getElementById('closeSystemSettingsModalBtn'),
    closeSystemSettingsModalBottomBtn: document.getElementById('closeSystemSettingsModalBottomBtn'),
    systemSettingsDevModeToggle: document.getElementById('systemSettingsDevModeToggle'),
    systemSettingsThemeDetails: document.getElementById('systemSettingsThemeDetails'),
    systemSettingsThemeResetBtn: document.getElementById('systemSettingsThemeResetBtn'),
    systemSettingsThemeCopyBtn: document.getElementById('systemSettingsThemeCopyBtn'),
    systemSettingsThemeDefaultBtn: document.getElementById('systemSettingsThemeDefaultBtn'),
    systemSettingsThemeLegacyBtn: document.getElementById('systemSettingsThemeLegacyBtn'),
    systemSettingsThemeRomulanBtn: document.getElementById('systemSettingsThemeRomulanBtn'),
    systemSettingsThemeMonoBtn: document.getElementById('systemSettingsThemeMonoBtn'),
    systemSettingsThemeMilkBtn: document.getElementById('systemSettingsThemeMilkBtn'),
    systemSettingsThemeWhiteDebugBtn: document.getElementById('systemSettingsThemeWhiteDebugBtn'),
    systemSettingsReplThemeSelect: document.getElementById('systemSettingsReplThemeSelect'),

    // Modals
    newPatternModal: document.getElementById('newPatternModal'),
    newPatternName: document.getElementById('newPatternName'),
    confirmNewPattern: document.getElementById('confirmNewPattern'),
    cancelNewPattern: document.getElementById('cancelNewPattern'),
    newArrangementModal: document.getElementById('newArrangementModal'),
    newArrangementName: document.getElementById('newArrangementName'),
    confirmNewArrangement: document.getElementById('confirmNewArrangement'),
    cancelNewArrangement: document.getElementById('cancelNewArrangement'),
    
    // Delete Confirmation
    deleteConfirmModal: document.getElementById('deleteConfirmModal'),
    deleteConfirmText: document.getElementById('deleteConfirmText'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    deleteConfirmText: document.getElementById('deleteConfirmText'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    
    // JSON Modal
    showJsonBtn: document.getElementById('showJsonBtn'),
    jsonPreviewModal: document.getElementById('jsonPreviewModal'),
    songDataJsonTab: document.getElementById('songDataJsonTab'),
    songDataJsTab: document.getElementById('songDataJsTab'),
    closeJsonModalBtn: document.getElementById('closeJsonModalBtn'),
    closeJsonModalBottomBtn: document.getElementById('closeJsonModalBottomBtn'),
    downloadJsonBtn: document.getElementById('downloadJsonBtn'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),

    // About Modal
    openAboutModalBtn: document.getElementById('openAboutModalBtn'),
    aboutModal: document.getElementById('aboutModal'),
    closeAboutModalBtn: document.getElementById('closeAboutModalBtn'),
    closeAboutModalBottomBtn: document.getElementById('closeAboutModalBottomBtn'),
    
    // Licensing Modal
    openLicenseModalBtn: document.getElementById('openLicenseModalBtn'),
    licenseAttributionModal: document.getElementById('licenseAttributionModal'),
    closeLicenseModalBtn: document.getElementById('closeLicenseModalBtn'),
    closeLicenseModalBottomBtn: document.getElementById('closeLicenseModalBottomBtn'),

    // Technical Details Modal
    openTechnicalDetailsModalBtn: document.getElementById('openTechnicalDetailsModalBtn'),
    technicalDetailsModal: document.getElementById('technicalDetailsModal'),
    closeTechnicalDetailsModalBtn: document.getElementById('closeTechnicalDetailsModalBtn'),
    closeTechnicalDetailsModalBottomBtn: document.getElementById('closeTechnicalDetailsModalBottomBtn'),
    
    // Change Log Modal
    openChangelogModalBtn: document.getElementById('openChangelogModalBtn'),
    changelogModal: document.getElementById('changelogModal'),
    closeChangelogModalBtn: document.getElementById('closeChangelogModalBtn'),
    closeChangelogModalBottomBtn: document.getElementById('closeChangelogModalBottomBtn'),

    // Demo Mode Modal
    demoModeModal: document.getElementById('demoModeModal'),
    closeDemoModeModalBtn: document.getElementById('closeDemoModeModalBtn'),
    closeDemoModeModalBottomBtn: document.getElementById('closeDemoModeModalBottomBtn'),

    // External Link Modal
    externalLinkModal: document.getElementById('externalLinkModal'),
    confirmExternalLink: document.getElementById('confirmExternalLink'),
    cancelExternalLink: document.getElementById('cancelExternalLink'),
    
    // Export Settings Modal
    exportSettingsBtn: document.getElementById('exportSettingsBtn'),
    exportSettingsModal: document.getElementById('exportSettingsModal'),
    limitChannels: document.getElementById('limitChannels'),
    channelLimitGroup: document.getElementById('channelLimitGroup'),
    maxChannelsInput: document.getElementById('maxChannelsInput'),
    normalizeLayers: document.getElementById('normalizeLayers'),
    closeExportSettings: document.getElementById('closeExportSettings'),
    exportResolutionHint: document.getElementById('exportResolutionHint'),
    exportResolutionCustomWrap: document.getElementById('exportResolutionCustomWrap'),
    exportResolutionCustom: document.getElementById('exportResolutionCustom'),
    wavSampleRate: document.getElementById('wavSampleRate'),
    wavBitDepth: document.getElementById('wavBitDepth'),
    playbackLoudnessPreset: document.getElementById('playbackLoudnessPreset'),
    playbackTargetPeak: document.getElementById('playbackTargetPeak'),
    playbackMasterGainDb: document.getElementById('playbackMasterGainDb'),
    playbackSoftClipDrive: document.getElementById('playbackSoftClipDrive'),

    // Advanced Settings Modal
    advancedSettingsModal: document.getElementById('advancedSettingsModal'),
    advancedSettingsTitle: document.getElementById('advancedSettingsTitle'),
    advancedSettingsResourceLabel: document.getElementById('advancedSettingsResourceLabel'),
    advancedSettingsSystemToggle: document.getElementById('advancedSettingsSystemToggle'),
    advancedSettingsSystemLockIcon: document.getElementById('advancedSettingsSystemLockIcon'),
    advancedSettingsSystemLabel: document.getElementById('advancedSettingsSystemLabel'),
    closeAdvancedSettingsModalBtn: document.getElementById('closeAdvancedSettingsModalBtn'),
    cancelAdvancedSettingsBtn: document.getElementById('cancelAdvancedSettingsBtn'),
    saveAdvancedSettingsBtn: document.getElementById('saveAdvancedSettingsBtn'),
};

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

function normalizePatternEntries(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((item) => {
            if (typeof item === 'string') {
                return { filename: item, scope: 'user' };
            }
            if (!item || typeof item !== 'object' || typeof item.filename !== 'string') {
                return null;
            }
            return {
                filename: item.filename,
                scope: normalizeScope(item.scope),
            };
        })
        .filter(Boolean);
}

function getPatternEntry(filename) {
    return patternEntriesCache.find((entry) => entry.filename === filename) || null;
}

function normalizeArrangementEntries(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((item) => {
            if (typeof item === 'string') {
                return { filename: item, name: item.replace(/\.js$/i, ''), scope: 'user', bpm: 120, arrangementState: null };
            }
            if (!item || typeof item !== 'object' || typeof item.filename !== 'string') {
                return null;
            }
            return {
                filename: item.filename,
                name: item.filename.replace(/\.js$/i, ''),
                scope: normalizeScope(item.scope),
                bpm: Number.isFinite(Number(item.bpm)) ? Number(item.bpm) : 120,
                arrangementState: item.arrangementState ?? null,
            };
        })
        .filter(Boolean);
}

function getArrangementEntry(filename) {
    return arrangementEntriesCache.find((entry) => entry.filename === filename) || null;
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
    clearArrangementWorkspacePlayheadVisuals();
    clearPlaybackInstrumentAliases('tracker-preview');
    clearArrangementPlaybackInstrumentAliases();
}

function refreshZzfxmPreviewControlsVisibility() {
    const hasExportedData = Boolean(lastExportedData);
    const matchesPattern = hasExportedData
        && lastExportedContext.type === 'pattern'
        && Boolean(currentPatternFilename)
        && lastExportedContext.filename === currentPatternFilename
        && !isArrangementWorkspaceActive();
    const matchesArrangement = hasExportedData
        && lastExportedContext.type === 'arrangement'
        && Boolean(currentArrangementFilename)
        && lastExportedContext.filename === currentArrangementFilename
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

function clearZzfxmPreviewData({ placeholder = '// Click GENERATE to create ZzFXMicro Player data' } = {}) {
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
        dom.exportBtnLabel.textContent = 'EXPORT ZzFXMicro';
    }
    if (dom.exportBtn) {
        dom.exportBtn.title = arrangementMode ? 'Export arrangement to ZzFXMicro JSON' : 'Export pattern to ZzFXMicro JSON';
        dom.exportBtn.classList.toggle('export-arrangement-mode', arrangementMode);
    }
    if (dom.exportWavBtnLabel) {
        dom.exportWavBtnLabel.textContent = arrangementMode ? 'Export WAV' : 'Export WAV';
    }
    if (dom.exportWavBtn) {
        dom.exportWavBtn.title = arrangementMode ? 'Download arrangement mix as WAV' : '';
    }
}

function showWelcome() {
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
    dom.exportBtn.disabled = true;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = true;
    
    updatePatternSelectionState(false);
    dom.previewPlayBtn.style.display = 'none';
    dom.previewPlayBtn.disabled = true;
    if(dom.showJsonBtn) {
        dom.showJsonBtn.style.display = 'none';
        dom.showJsonBtn.disabled = true;
    }
    updateAdvancedSettingsButtonsVisibility();
    
    // Clear state
    currentPatternFilename = null;
    currentPatternScope = 'user';
    currentArrangementFilename = null;
    currentArrangementScope = 'user';
    arrangementDraftState = null;
    activeArrangementBlockFilename = null;
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
    if (dom.sidebarTitle?.classList.contains('active') && currentPatternFilename) {
        showEditor();
    } else {
        showIntroduction();
    }
}

function showIntroduction() {
    // If no pattern is loaded, the introduction view is also the "empty" state.
    if (!currentPatternFilename) {
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
    dom.exportBtn.disabled = false;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = false;

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
    dom.exportBtn.disabled = false;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = false;
    dom.patternNameInput.classList.remove('hidden');
    updatePatternSelectionState(!!currentPatternFilename);
    refreshZzfxmPreviewControlsVisibility();
    updateAdvancedSettingsButtonsVisibility();
    dom.sidebarTitle?.classList.remove('active');
    updateFooterExportActionLabels();
}

function showArrangementWorkspace() {
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'flex';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.remove('footer-intro-mode');
    }
    dom.sidebarTitle?.classList.remove('active');
    dom.patternNameInput.classList.add('hidden');
    updatePatternSelectionState(false);
    updateArrangementSelectionState(!!currentArrangementFilename);
    updateArrangementInstrumentUsage();
    dom.exportBtn.disabled = false;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = false;
    refreshZzfxmPreviewControlsVisibility();
    updateAdvancedSettingsButtonsVisibility();
    updateFooterExportActionLabels();
    updateArrangementListScopeVisualizer();
    updateArrangementWorkspacePreviewButtonState();
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

/** Selector for touch activation: list items + instrument drawer close (single-tap on iPad). */
const LIST_ITEM_SELECTOR = '.list-item, .instrument-item, .block-item, #closeDrawerBtn';
/** If touch started on one of these, we do not synthesize click (let the button handle it). */
const LIST_ITEM_BUTTON_SELECTOR = '.sidebar-del-btn, .sidebar-edit-btn, .list-item-actions button, .arr-chip-del';

/**
 * iPad / touch: make first tap activate list items instead of requiring double-tap.
 * Uses touchend to synthesize an immediate click so the item's handler runs on first tap.
 */
function setupListTouchActivation() {
    let touchStartItem = null;
    let touchStartOnButton = false;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.target;
        const item = t.closest(LIST_ITEM_SELECTOR);
        if (!item) return;
        touchStartItem = item;
        touchStartOnButton = t.closest(LIST_ITEM_BUTTON_SELECTOR) != null;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1 || !touchStartItem) return;
        const endTarget = document.elementFromPoint(
            e.changedTouches[0].clientX,
            e.changedTouches[0].clientY
        );
        if (!endTarget || !touchStartItem.contains(endTarget)) return;
        if (touchStartOnButton) return;
        e.preventDefault();
        // Instrument list: handler is on .instrument-info, not the li — trigger that so drawer opens
        const clickTarget = touchStartItem.matches('.instrument-item')
            ? touchStartItem.querySelector('.instrument-info')
            : touchStartItem;
        (clickTarget || touchStartItem).click();
        touchStartItem = null;
    }, { passive: false });

    document.addEventListener('touchcancel', () => { touchStartItem = null; });
}

// --- Initialization ---
async function init() {
    setStatus('Initializing...', 'normal');
    
    // Disable default samples (TidalCycles/Dirt) to ensure only ZzFX instruments are used
    dom.repl.prelude = `
// ZzFXMicro Music
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
    setupAutoSave();
    
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

/**
 * Reload instruments into Strudel
 * Call this after instruments are modified to update the sound registry
 */
export async function reloadInstruments() {
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');

    const map = {};
    const monophonicAliases = new Set();
    const defragged = getDefragmentedInstruments();

    defragged.forEach((inst) => {
        map[inst.strudelAlias] = inst.params;
        if (inst.monophonic) monophonicAliases.add(inst.strudelAlias);
    });

    // Only use static fallback when user has no instruments (initial/demo state).
    // When user has instruments, their list is the source of truth — do not re-inject
    // renamed/removed aliases from staticInstruments.
    if (defragged.length === 0) {
        for (const [alias, params] of Object.entries(staticInstruments)) {
            if (Array.isArray(params) && map[alias] === undefined) {
                map[alias] = params;
                if (staticMonophonic && staticMonophonic[alias]) monophonicAliases.add(alias);
            }
        }
    }

    // If we still have nothing (no storage and no static?), keep initial registry
    if (Object.keys(map).length === 0) {
        console.log('[ReplApp] No instruments to load; keeping initial registry');
        return;
    }

    loadZzFXInstruments(map, { monophonicAliases });
    console.log('[ReplApp] Reloaded', Object.keys(map).length, 'instruments into Strudel');
}

/**
 * Replace instrument alias in Strudel code (exact match in double or single quotes)
 */
function replaceAliasInCode(code, oldAlias, newAlias) {
    if (!oldAlias || oldAlias === newAlias) return code;
    let out = code;
    out = out.split(`"${oldAlias}"`).join(`"${newAlias}"`);
    out = out.split(`'${oldAlias}'`).join(`'${newAlias}'`);
    return out;
}

/**
 * Replace instrument alias in trackerState.channelInstruments array
 */
function replaceAliasInTrackerState(trackerState, oldAlias, newAlias) {
    if (!trackerState || !oldAlias || oldAlias === newAlias) return trackerState;
    const channelInstruments = Array.isArray(trackerState.channelInstruments) ? [...trackerState.channelInstruments] : [];
    const updated = channelInstruments.map((id) => (id === oldAlias ? newAlias : id));
    if (JSON.stringify(updated) === JSON.stringify(channelInstruments)) return trackerState;
    return { ...trackerState, channelInstruments: updated };
}

/**
 * Update all patterns and blocks that reference oldAlias to use newAlias.
 * Only touches user-scope files. Shows confirmation before bulk edit.
 */
export async function updateInstrumentReferencesInPatternsAndBlocks(oldAlias, newAlias) {
    if (DEMO_MODE) return;
    if (!oldAlias || !newAlias || oldAlias === newAlias) return;

    try {
        const [patternsRes, blocksRes] = await Promise.all([
            fetch('/api/patterns'),
            fetch('/api/blocks'),
        ]);
        if (!patternsRes.ok || !blocksRes.ok) return;

        const patternsPayload = await patternsRes.json();
        const blocksPayload = await blocksRes.json();
        const patternEntries = normalizePatternEntries(patternsPayload).filter((e) => normalizeScope(e?.scope) !== 'system');
        const blockItems = (Array.isArray(blocksPayload) ? blocksPayload : []).filter((b) => normalizeScope(b?.scope) !== 'system');

        let patternsToUpdate = [];
        let blocksToUpdate = [];

        for (const entry of patternEntries) {
            const filename = entry?.filename;
            if (!filename) continue;
            const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`);
            if (!res.ok) continue;
            const content = await res.text();
            if (content.includes(`"${oldAlias}"`) || content.includes(`'${oldAlias}'`)) {
                patternsToUpdate.push({ filename, content });
            }
        }

        for (const block of blockItems) {
            const filename = block?.filename;
            if (!filename) continue;
            const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
            if (!res.ok) continue;
            const detail = await res.json();
            const pattern = detail?.pattern || '';
            const channelInstruments = Array.isArray(detail?.trackerState?.channelInstruments) ? detail.trackerState.channelInstruments : [];
            const patternHasAlias = pattern.includes(`"${oldAlias}"`) || pattern.includes(`'${oldAlias}'`);
            const trackerHasAlias = channelInstruments.includes(oldAlias);
            if (patternHasAlias || trackerHasAlias) {
                blocksToUpdate.push({ filename, block: detail });
            }
        }

        const total = patternsToUpdate.length + blocksToUpdate.length;
        if (total === 0) return;

        const ok = await confirmDialog({
            title: 'Update References',
            message: `Update ${patternsToUpdate.length} pattern(s) and ${blocksToUpdate.length} block(s) to use "${newAlias}" instead of "${oldAlias}"?`,
            confirmLabel: 'Update',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        for (const { filename, content } of patternsToUpdate) {
            const updated = replaceAliasInCode(content, oldAlias, newAlias);
            const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
                method: 'POST',
                headers: getDeveloperModeHeaders(),
                body: updated,
            });
            if (!res.ok) console.warn('[ReplApp] Failed to update pattern:', filename);
        }

        const { updateBlock } = await import('./blocks.js');
        for (const { filename, block: detail } of blocksToUpdate) {
            const updatedPattern = replaceAliasInCode(detail.pattern || '', oldAlias, newAlias);
            const updatedTrackerState = replaceAliasInTrackerState(detail.trackerState ?? null, oldAlias, newAlias);
            await updateBlock(
                filename,
                detail.name || filename.replace('.js', ''),
                detail.description || '',
                updatedPattern,
                updatedTrackerState,
                normalizeScope(detail.scope, 'user')
            );
        }

        if (patternsToUpdate.length > 0) await refreshPatternList();
        setStatus(`Updated ${total} file(s) to use "${newAlias}"`, 'success');
    } catch (err) {
        console.error('[ReplApp] Failed to update instrument references:', err);
    }
}

// --- Auto-Save and Hot-Reload Setup ---
let hotReloadTimeout = null;

function setupAutoSave() {
    if (DEMO_MODE) {
        console.log('ℹ️ Demo mode: auto-save disabled');
        return;
    }
    console.log('setupAutoSave() called');
    let checkCount = 0;
    
    // Wait for editor to be ready
    const checkEditor = setInterval(() => {
        checkCount++;
        
        // dom.repl.editor.editor IS the CodeMirror EditorView
        if (dom.repl.editor && dom.repl.editor.editor) {
            clearInterval(checkEditor);
            console.log('✅ Editor found! Setting up auto-save and hot-reload...');
            
            const view = dom.repl.editor.editor; // This IS the EditorView
            
            // Use CodeMirror's update listener - this is event-driven, not polling!
            // We'll add a listener to the view's DOM that triggers on updates
            let lastCode = view.state.doc.toString();
            
            // Listen to the view's update events via DOM observation
            // CodeMirror updates the DOM on every change, so we can detect that
            const observer = new MutationObserver(() => {
                // Only process if editor is focused and a pattern is loaded
                if (!currentPatternFilename || !view.hasFocus) return;
                
                const currentCode = view.state.doc.toString();
                
                // Check if code actually changed
                if (currentCode !== lastCode) {
                    lastCode = currentCode;
                    
                    // Update indicators in sidebar
                    updateInstrumentUsage(currentCode);
                    
                    if (currentPatternScope !== 'system' || isDeveloperModeEnabled()) {
                        // IMMEDIATELY save to localStorage as backup
                        localStorage.setItem(`unsaved_${currentPatternFilename}`, currentCode);
                        
                        // Clear existing auto-save timeout
                        if (autoSaveTimeout) {
                            clearTimeout(autoSaveTimeout);
                        }
                        
                        // Set new timeout for 1 second (debounced server save)
                        autoSaveTimeout = setTimeout(() => {
                            saveCurrentPattern();
                            // Clear localStorage after successful server save
                            localStorage.removeItem(`unsaved_${currentPatternFilename}`);
                        }, 1000);
                    }
                    
                    // HOT-RELOAD: Auto-evaluate if REPL is playing
                    if (dom.repl.editor.repl.scheduler.started) {
                        // Clear existing hot-reload timeout
                        if (hotReloadTimeout) {
                            clearTimeout(hotReloadTimeout);
                        }
                        
                        // Debounce hot-reload to 500ms (faster than save for responsive live coding)
                        hotReloadTimeout = setTimeout(() => {
                            try {
                                dom.repl.editor.evaluate();
                                console.log('🔥 Hot-reloaded code changes');
                            } catch (e) {
                                console.error('Hot-reload evaluation error:', e);
                            }
                        }, 500);
                    }
                }
            });
            
            // Observe the content area for changes
            observer.observe(view.contentDOM, {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: false
            });
            
            console.log('✅ Auto-save enabled with 1s debounce (event-driven via MutationObserver)');
        } else if (checkCount > 50) {
            // Stop checking after 5 seconds (50 * 100ms)
            clearInterval(checkEditor);
            console.error('❌ Editor not found after 5 seconds. Auto-save disabled.');
        }
    }, 100);
}

registerBeforeUnloadConfirmer(() => {
    if (DEMO_MODE) return false;
    if (currentPatternScope === 'system' && !isDeveloperModeEnabled()) return false;
    return Boolean(autoSaveTimeout && currentPatternFilename);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;
    if (currentPatternScope === 'system' && !isDeveloperModeEnabled()) return;
    if (!(autoSaveTimeout && currentPatternFilename)) return;

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;

    const editorCode = dom.repl.editor?.code || '';
    const fileCode = editorToFile(editorCode);

    // Use sendBeacon for reliable delivery even as page closes.
    // Note: sendBeacon cannot send custom headers, so for developer mode (which needs a header)
    // we use fetch({ keepalive: true }) instead.
    if (currentPatternScope === 'system' && isDeveloperModeEnabled()) {
        fetch(`/api/pattern/${currentPatternFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode,
            keepalive: true,
        }).catch(() => {});
    } else {
        const blob = new Blob([fileCode], { type: 'text/plain' });
        navigator.sendBeacon(`/api/pattern/${currentPatternFilename}`, blob);
    }

    // Also keep in localStorage as backup
    try {
        localStorage.setItem(`unsaved_${currentPatternFilename}`, editorCode);
    } catch (_e) {
        // Ignore storage failures.
    }
});

registerBeforeUnloadConfirmer(() => {
    if (DEMO_MODE) return false;
    if (arrangementAutoSaveTimeout && currentArrangementFilename && !getArrangementReadonly()) return true;
    return Boolean(trackerAutoSaveTimeout && pendingTrackerSavePayload);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;

    if (arrangementAutoSaveTimeout && currentArrangementFilename && !getArrangementReadonly()) {
        clearTimeout(arrangementAutoSaveTimeout);
        arrangementAutoSaveTimeout = null;
        const arrangementState = buildArrangementStatePayload();
        const body = JSON.stringify({
            name: arrangementState.name,
            arrangementState,
            scope: currentArrangementScope,
        });
        fetch(`/api/arrangements/${encodeURIComponent(currentArrangementFilename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body,
            keepalive: true,
        }).catch(() => {});
        try {
            localStorage.setItem(`unsaved_arrangement_${currentArrangementFilename}`, JSON.stringify(arrangementState));
        } catch (_e) {
            // Ignore storage failures.
        }
    }

    if (trackerAutoSaveTimeout && pendingTrackerSavePayload) {
        clearTimeout(trackerAutoSaveTimeout);
        trackerAutoSaveTimeout = null;
        const payload = pendingTrackerSavePayload;
        pendingTrackerSavePayload = null;
        fetch(`/api/blocks/${encodeURIComponent(payload.filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {});
        try {
            localStorage.setItem(`unsaved_block_${payload.filename}`, JSON.stringify(payload.trackerState || {}));
        } catch (_e) {
            // Ignore storage failures.
        }
    }
});

// --- API Interactions ---

async function refreshPatternList() {
    try {
        const entries = DEMO_MODE
            ? Array.from(demoPatternSourceByFile.keys())
                .sort()
                .map((filename) => ({ filename, scope: 'system' }))
            : await (async () => {
                const res = await fetch('/api/patterns');
                if (!res.ok) throw new Error('Failed to list patterns');
                const payload = await res.json();
                const collator = typeof Intl !== 'undefined' && Intl.Collator
                    ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
                    : null;
                const sorted = normalizePatternEntries(payload).sort((a, b) =>
                    collator ? collator.compare(a.filename, b.filename) : a.filename.localeCompare(b.filename)
                );
                return sorted;
            })();

        patternEntriesCache = entries;
        dom.patternList.innerHTML = '';

        if (!entries.length) {
            dom.patternList.innerHTML = `
                <li class="text-xs text-muted-foreground px-3 py-2">No patterns available.</li>
            `;
            updatePatternListVisualizer();
            createIcons({ icons });
            return;
        }

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const expanded = isEmpty
                ? true
                : (scope === 'system' ? patternFolderState.system : patternFolderState.user);
            const folderIcon = expanded ? 'chevron-down' : 'chevron-right';
            const highlightIcon = expanded && (scope !== 'user' || items.length > 0);

            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1 border-b border-border/40';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-pattern-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-pattern-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-pattern-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-pattern-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
                if (scope === 'system') {
                    patternFolderState.system = !patternFolderState.system;
                } else {
                    patternFolderState.user = !patternFolderState.user;
                }
                saveFolderState(PATTERN_FOLDER_STATE_KEY, patternFolderState);
                refreshPatternList();
            });

            if (items.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'Create a new pattern to get started.'
                    : 'No system patterns available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const file = entry.filename;
                const fileName = decodeURIComponent(file.replace('.js', ''));
                const isSystem = normalizeScope(entry.scope) === 'system';
                const devMode = isDeveloperModeEnabled();
                const isImmutable = isSystem && !devMode;
                const li = document.createElement('li');
                const isIntroductionVisible = dom.welcomeView?.style?.display === 'flex';
                li.className = `list-item ${file === currentPatternFilename && !isIntroductionVisible ? 'active' : ''}`;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = file;

                li.innerHTML = (DEMO_MODE || isImmutable)
                    ? `<span class="font-medium">${fileName}</span>`
                    : `
                        <span class="font-medium">${fileName}</span>
                        <div class="list-item-actions">
                            <button class="sidebar-del-btn" title="Delete ${fileName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    `;

                li.querySelector('span').onclick = (e) => {
                    e.stopPropagation();
                    loadPattern(file);
                };
                li.onclick = () => loadPattern(file);

                if (!DEMO_MODE && !isImmutable) {
                    li.querySelector('.sidebar-del-btn').onclick = (e) => {
                        e.stopPropagation();
                        showDeleteConfirmation(file);
                    };
                }

                list?.appendChild(li);
            });

            dom.patternList.appendChild(folderLi);
        };

        const userEntries = entries.filter((entry) => normalizeScope(entry.scope) !== 'system');
        const systemEntries = entries.filter((entry) => normalizeScope(entry.scope) === 'system');
        appendFolder('user', 'Your patterns', userEntries);
        appendFolder('system', 'System', systemEntries);
        
        updatePatternListVisualizer();
        createIcons({ icons });
    } catch (e) {
        console.error(e);
        setStatus('Error loading patterns', 'error');
    }
}

function isPatternListVisible() {
    return Boolean(dom.patternList && !dom.patternList.classList.contains('hidden'));
}

function isArrangementListVisible() {
    return Boolean(dom.arrangementList && !dom.arrangementList.classList.contains('hidden'));
}

function updatePatternListVisualizer() {
    if (!isPatternListVisible()) return;

    const playingEntry = patternEntriesCache.find((e) => e.filename === playingPatternFilename);
    const playingScope = playingEntry ? normalizeScope(playingEntry.scope) : null;
    let visualizerAttached = false;

    // When the playing pattern's folder is collapsed, show the scope visualizer on the folder row
    const folderRows = Array.from(dom.patternList.children).filter((li) =>
        li.querySelector('[data-pattern-folder]')
    );
    folderRows.forEach((folderLi) => {
        const folderButton = folderLi.querySelector('[data-pattern-folder]');
        const scope = folderButton?.getAttribute('data-pattern-folder');
        const itemsUl = folderLi.querySelector('[data-pattern-folder-items]');
        const isCollapsed = itemsUl?.classList.contains('hidden');
        const isPlayingInThisFolder = playingScope === scope && playingPatternFilename;

        if (isCollapsed && isPlayingInThisFolder) {
            let canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'list-item-visualizer';
                folderLi.classList.add('relative', 'overflow-hidden');
                folderLi.insertBefore(canvas, folderLi.firstChild);
            }
            canvas.width = folderLi.clientWidth;
            canvas.height = folderLi.clientHeight;
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            const canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (canvas) canvas.remove();
            folderLi.classList.remove('relative', 'overflow-hidden');
        }
    });

    const listItems = Array.from(dom.patternList.querySelectorAll('.list-item'));
    listItems.forEach((li) => {
        const span = li.querySelector('span');
        // Visualizer should track the PLAYING pattern, not necessarily the selected one
        const isPlayingTarget =
            span &&
            playingPatternFilename &&
            span.innerText === decodeURIComponent(playingPatternFilename.replace('.js', ''));
        
        let canvas = li.querySelector('canvas.list-item-visualizer');

        if (isPlayingTarget && !visualizerAttached) {
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'list-item-visualizer';
                // Set internal resolution to match element size
                canvas.width = li.clientWidth;
                canvas.height = li.clientHeight;
                
                // Insert as first child to be behind everything (z-index handles it properly though)
                li.insertBefore(canvas, li.firstChild);
            }
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            if (canvas) {
                canvas.remove();
            }
        }
    });
    
    if (!visualizerAttached) {
        attachVisualizer(null);
    }
}

function updateArrangementListScopeVisualizer() {
    if (!isArrangementListVisible()) return;

    const playingFilename = arrangementPreviewPlayingFilename ?? (isArrangementPreviewPlaying() ? currentArrangementFilename : null);
    const playingEntry = arrangementEntriesCache.find((e) => e.filename === playingFilename);
    const playingScope = playingEntry ? normalizeScope(playingEntry.scope) : null;
    let visualizerAttached = false;

    // When the playing arrangement's folder is collapsed, show the scope visualizer on the folder row
    const folderRows = Array.from(dom.arrangementList.children).filter((li) =>
        li.querySelector('[data-arrangement-folder]')
    );
    folderRows.forEach((folderLi) => {
        const folderButton = folderLi.querySelector('[data-arrangement-folder]');
        const scope = folderButton?.getAttribute('data-arrangement-folder');
        const itemsUl = folderLi.querySelector('[data-arrangement-folder-items]');
        const isCollapsed = itemsUl?.classList.contains('hidden');
        const isPlayingInThisFolder = playingScope === scope && playingFilename;

        if (isCollapsed && isPlayingInThisFolder) {
            let canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'list-item-visualizer';
                folderLi.classList.add('relative', 'overflow-hidden');
                folderLi.insertBefore(canvas, folderLi.firstChild);
            }
            canvas.width = folderLi.clientWidth;
            canvas.height = folderLi.clientHeight;
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            const canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (canvas) canvas.remove();
            folderLi.classList.remove('relative', 'overflow-hidden');
        }
    });

    const listItems = Array.from(dom.arrangementList.querySelectorAll('.list-item'));
    const target = playingFilename
        ? listItems.find((item) => item.dataset.filename === playingFilename) || null
        : null;

    listItems.forEach((item) => {
        if (item !== target) {
            item.classList.remove('relative', 'overflow-hidden');
            item.querySelector('canvas.list-item-visualizer')?.remove();
        }
    });

    if (target && !visualizerAttached) {
        target.classList.add('relative', 'overflow-hidden');
        let canvas = target.querySelector('canvas.list-item-visualizer');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'list-item-visualizer';
            target.insertBefore(canvas, target.firstChild);
        }
        canvas.width = target.clientWidth;
        canvas.height = target.clientHeight;
        attachVisualizer(canvas);
        visualizerAttached = true;
    }

    if (!visualizerAttached) {
        attachVisualizer(null);
    }
}

/**
 * Re-apply active highlight to the currently selected pattern in the sidebar.
 * Used when user switches from introduction view to Strudel/Instruments tab.
 */
export function refreshPatternListActiveState() {
    if (!currentPatternFilename || !dom.patternList) return;
    Array.from(dom.patternList.querySelectorAll('.list-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === currentPatternFilename);
    });
}

function normalizeArrangementBaseName(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

async function refreshArrangementList() {
    if (!dom.arrangementList) return;

    try {
        const sortByLeadingNumber = (a, b) => {
            const padNum = (s) => {
                const m = (s || '').match(/^(\d+)/);
                return m ? m[1].padStart(8, '0') + s : '\x00' + s;
            };
            const aKey = padNum(a.filename || '');
            const bKey = padNum(b.filename || '');
            return aKey.localeCompare(bKey);
        };
        const entries = DEMO_MODE
            ? Array.from(demoArrangementSourceByFile.keys())
                .map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'system' }))
                .sort(sortByLeadingNumber)
            : await (async () => {
                const res = await fetch('/api/arrangements');
                if (!res.ok) throw new Error('Failed to list arrangements');
                const payload = await res.json();
                const entries = normalizeArrangementEntries(payload);
                entries.sort(sortByLeadingNumber);
                return entries;
            })();

        arrangementEntriesCache = entries;
        dom.arrangementList.innerHTML = '';

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const expanded = isEmpty
                ? true
                : (scope === 'system' ? arrangementFolderState.system : arrangementFolderState.user);
            const folderIcon = expanded ? 'chevron-down' : 'chevron-right';
            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1 border-b border-border/40';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-arrangement-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-arrangement-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-arrangement-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-arrangement-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
                if (scope === 'system') {
                    arrangementFolderState.system = !arrangementFolderState.system;
                } else {
                    arrangementFolderState.user = !arrangementFolderState.user;
                }
                saveFolderState(ARRANGEMENT_FOLDER_STATE_KEY, arrangementFolderState);
                refreshArrangementList();
            });

            if (isEmpty) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'Create a new arrangement to get started.'
                    : 'No system arrangements available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const isSystem = normalizeScope(entry.scope) === 'system';
                const devMode = isDeveloperModeEnabled();
                const isImmutable = isSystem && !devMode;
                const li = document.createElement('li');
                li.className = `list-item ${entry.filename === currentArrangementFilename ? 'active' : ''}`;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = entry.filename;

                const displayName = decodeURIComponent((entry.filename || '').replace(/\.js$/i, ''));
                li.innerHTML = (DEMO_MODE || isImmutable)
                    ? `<span class="font-medium">${escapeHtml(displayName)}</span>`
                    : `
                        <span class="font-medium">${escapeHtml(displayName)}</span>
                        <div class="list-item-actions">
                            <button class="sidebar-del-btn" title="Delete ${escapeHtml(displayName)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    `;

                li.querySelector('span')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadArrangement(entry.filename);
                });
                li.addEventListener('click', () => loadArrangement(entry.filename));

                if (!DEMO_MODE && !isImmutable) {
                    li.querySelector('.sidebar-del-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteArrangement(entry.filename);
                    });
                }

                list?.appendChild(li);
            });

            dom.arrangementList.appendChild(folderLi);
        };

        const userItems = [...entries.filter((entry) => normalizeScope(entry.scope) === 'user')].sort(sortByLeadingNumber);
        const systemItems = [...entries.filter((entry) => normalizeScope(entry.scope) === 'system')].sort(sortByLeadingNumber);
        appendFolder('user', 'Your arrangements', userItems);
        appendFolder('system', 'System', systemItems);
        createIcons({ icons });
        updateArrangementListScopeVisualizer();
    } catch (err) {
        console.error('[Arrangements] Failed to refresh list:', err);
        arrangementEntriesCache = [];
        dom.arrangementList.innerHTML = '<li class="text-xs text-destructive px-3 py-2">Failed to load arrangements.</li>';
    }
}

function refreshArrangementListActiveState() {
    if (!dom.arrangementList) return;
    Array.from(dom.arrangementList.querySelectorAll('.list-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === currentArrangementFilename);
    });
    updateArrangementListScopeVisualizer();
}

async function deleteArrangement(filename) {
    if (!filename || DEMO_MODE) return;
    const scope = normalizeScope(getArrangementEntry(filename)?.scope);
    if (scope === 'system' && !isDeveloperModeEnabled()) {
        setStatus('System arrangements are immutable', 'normal');
        return;
    }
    const displayName = decodeURIComponent(filename.replace(/\.js$/i, ''));
    const confirmed = await confirmDialog({
        title: 'Delete Arrangement?',
        message: `Delete arrangement "${displayName}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
    });
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: getDeveloperModeHeaders(),
        });
        if (!res.ok) throw new Error('Failed to delete arrangement');

        if (currentArrangementFilename === filename) {
            currentArrangementFilename = null;
            currentArrangementScope = 'user';
            arrangementDraftState = null;
            activeArrangementBlockFilename = null;
            showWelcome();
        }
        await refreshArrangementList();
        await refreshBlocksLibrary();
        setStatus('Arrangement deleted', 'success');
    } catch (err) {
        console.error('[Arrangements] Delete failed:', err);
        setStatus('Failed to delete arrangement', 'error');
    }
}

async function createNewArrangement(name) {
    if (DEMO_MODE) {
        setStatus('Demo mode: creating arrangements is disabled', 'normal');
        return;
    }

    const normalizedBase = normalizeArrangementBaseName(name);
    if (!normalizedBase) {
        setStatus('Invalid arrangement name', 'error');
        return;
    }

    try {
        const existing = await fetch('/api/arrangements').then((r) => (r.ok ? r.json() : [])).catch(() => []);
        const existingFilenames = new Set((existing || []).map((item) => String(item?.filename || '').toLowerCase()));
        let baseSlug = normalizedBase;
        let slug = baseSlug;
        let suffix = 1;
        while (existingFilenames.has(`${slug}.js`.toLowerCase())) {
            suffix += 1;
            slug = `${baseSlug}-${suffix}`;
        }
        const filename = `${slug}.js`;

        // Create a starter block for the new arrangement: 1 channel, 16 steps, hh-closed on steps 1, 5, 9 (1-based).
        let initialBlockFilename = null;
        try {
            const steps = 16;
            const grid = [Array(steps).fill(null)];
            // Rows 1, 5, 9 -> indices 0, 4, 8
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
            // Use the same Untitled-n naming scheme as other auto-created blocks.
            await refreshBlocksLibrary();
            const starterName = getNextUntitledBlockName();
            const blockResult = await saveBlock(starterName, '', pattern, trackerState, 'user');
            if (blockResult && blockResult.ok !== false && blockResult.block?.filename) {
                initialBlockFilename = blockResult.block.filename;
            }
        } catch (e) {
            console.warn('[Arrangements] Failed to create starter block for new arrangement:', e);
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

        const res = await fetch('/api/arrangements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, name: normalizedBase, arrangementState, scope: 'user' }),
        });
        if (!res.ok) throw new Error('Failed to create arrangement');

        await refreshArrangementList();
        await loadArrangement(filename);
        closeNewArrangementModal();

        // If we successfully created a starter block, select it and start arrangement playback immediately.
        if (initialBlockFilename) {
            activeArrangementBlockFilename = initialBlockFilename;
            arrangementSelectedBlockByArrangement[filename] = initialBlockFilename;
            await refreshBlocksLibrary();
            renderArrangementWorkspace();
            renderTrackerWorkspace();

            const payload = buildArrangementStatePayload();
            // Stop any other playback before starting the new arrangement.
            stopAllPlaybackForSelectionChange();
            document.dispatchEvent(new CustomEvent('arrangements:preview', {
                detail: {
                    arrangement: { name: arrangementDraftState.name, arrangementState: payload },
                    filename,
                },
            }));
        }
    } catch (err) {
        console.error('[Arrangements] Create failed:', err);
        setStatus('Failed to create arrangement', 'error');
    }
}

function getArrangementReadonly() {
    return DEMO_MODE || (currentArrangementScope === 'system' && !isDeveloperModeEnabled());
}

function canRecoverUnsavedForScope(scope) {
    const normalizedScope = normalizeScope(scope);
    return normalizedScope !== 'system' || isDeveloperModeEnabled();
}

function readUnsavedArrangementState(filename, scope) {
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

function cloneArrangementState(value) {
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

function getBlockByFilename(filename) {
    return blocksLibraryCache.find((block) => block.filename === filename) || null;
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

function collectInstrumentAliasesFromRowStep(rowIndex, rowStep, blockFilenames = []) {
    const aliases = new Set();
    const files = Array.isArray(blockFilenames) ? blockFilenames : [];
    files.forEach((filename) => {
        const trackerState = arrangementPreviewContext?.trackerStateByFilename?.[filename];
        if (!trackerState || !Array.isArray(trackerState.grid) || !Array.isArray(trackerState.channelInstruments)) return;
        const blockSteps = getTrackerStateSteps(trackerState);
        const localStep = ((rowStep % blockSteps) + blockSteps) % blockSteps;
        trackerState.grid.forEach((channel, channelIndex) => {
            const alias = trackerState.channelInstruments[channelIndex];
            if (!alias || !Array.isArray(channel)) return;
            const cell = channel[localStep];
            const note = typeof cell === 'object' ? cell?.note : cell;
            if (isPlayableTrackerNote(note)) {
                aliases.add(alias);
            }
        });
    });
    return Array.from(aliases).sort();
}

function clearArrangementPlaybackInstrumentAliases() {
    lastArrangementPlaybackInstrumentSignature = '';
    clearPlaybackInstrumentAliases('arrangement-preview');
}

function updateArrangementPlaybackInstrumentAliases(detail = {}) {
    if (!isArrangementPreviewPlaying()) {
        clearArrangementPlaybackInstrumentAliases();
        return;
    }

    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const row = rowIndex == null ? null : arrangementPreviewContext?.arrangementState?.rows?.[rowIndex];
    const blocks = Array.isArray(detail.blocks) && detail.blocks.length
        ? detail.blocks
        : (Array.isArray(row?.blocks) ? row.blocks : []);
    if (rowIndex == null || !blocks.length) {
        if (lastArrangementPlaybackInstrumentSignature !== 'empty') {
            lastArrangementPlaybackInstrumentSignature = 'empty';
            clearPlaybackInstrumentAliases('arrangement-preview');
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
    if (signature === lastArrangementPlaybackInstrumentSignature) return;
    lastArrangementPlaybackInstrumentSignature = signature;

    if (sortedAliases.length) {
        setPlaybackInstrumentAliases('arrangement-preview', sortedAliases);
    } else {
        clearPlaybackInstrumentAliases('arrangement-preview');
    }
}

async function getArrangementInstrumentList() {
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    return instruments.map((inst) => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
}

async function resolveBlockDetailForArrangement(filename) {
    if (!filename) return null;
    const cached = getBlockByFilename(filename);
    const hasTrackerState = Boolean(cached?.trackerState);
    const hasPattern = typeof cached?.pattern === 'string';
    const hasDescription = typeof cached?.description === 'string';
    if (hasTrackerState && hasPattern && hasDescription) return cached;

    if (DEMO_MODE) {
        const source = demoBlockSourceByFile.get(filename);
        if (!source) return cached || null;
        const parsed = parseBlockSource(source);
        return {
            filename,
            name: parsed?.name || cached?.name || filename.replace(/\.js$/i, ''),
            description: parsed?.description || cached?.description || '',
            pattern: parsed?.pattern || cached?.pattern || '',
            trackerState: parsed?.trackerState || cached?.trackerState || null,
            scope: normalizeScope(parsed?.scope || cached?.scope),
        };
    }

    try {
        const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
        if (!res.ok) return cached || null;
        const detail = await res.json();
        return {
            filename,
            name: detail?.name || cached?.name || filename.replace(/\.js$/i, ''),
            description: detail?.description || cached?.description || '',
            pattern: detail?.pattern || cached?.pattern || '',
            trackerState: detail?.trackerState || cached?.trackerState || null,
            scope: normalizeScope(detail?.scope || cached?.scope),
        };
    } catch (_e) {
        return cached || null;
    }
}

/**
 * Gather block patterns from the current arrangement and update instrument usage for "List used instruments".
 * Fire-and-forget; called when arrangement is loaded or when blocks change.
 */
async function updateArrangementInstrumentUsage() {
    if (!currentArrangementFilename || !arrangementDraftState) return;
    const arrangementState = buildArrangementStatePayload();
    const blockFiles = Array.from(new Set(
        (arrangementState.rows || []).flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
    ));
    const patterns = [];
    for (const filename of blockFiles) {
        const block = await resolveBlockDetailForArrangement(filename);
        if (block?.pattern) patterns.push(block.pattern);
    }
    const combinedCode = patterns.join('\n');
    updateInstrumentUsage(combinedCode);
}

async function buildArrangementExportContext() {
    if (!currentArrangementFilename || !arrangementDraftState) return null;

    const arrangementState = buildArrangementStatePayload();
    const blockFiles = Array.from(new Set(
        (arrangementState.rows || []).flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
    ));

    const blocks = [];
    const trackerStateByFilename = {};
    for (const filename of blockFiles) {
        const block = await resolveBlockDetailForArrangement(filename);
        if (!block) continue;
        blocks.push({
            filename,
            name: block.name || filename.replace(/\.js$/i, ''),
            description: block.description || '',
            scope: normalizeScope(block.scope),
            pattern: block.pattern || '',
            trackerState: block.trackerState || null,
        });
        if (block.trackerState) {
            trackerStateByFilename[filename] = resolveTrackerStateChannelInstruments(block.trackerState);
        }
    }

    const instrumentList = await getArrangementInstrumentList();
    const bpm = arrangementState.bpm || 120;
    return { arrangementState, blocks, trackerStateByFilename, instrumentList, bpm };
}

function getNextUntitledBlockName() {
    let maxSuffix = 0;
    blocksLibraryCache.forEach((block) => {
        const name = String(block?.name || '').trim();
        const match = /^Untitled-(\d+)$/i.exec(name);
        if (!match) return;
        const suffix = parseInt(match[1], 10);
        if (Number.isFinite(suffix)) {
            maxSuffix = Math.max(maxSuffix, suffix);
        }
    });
    return `Untitled-${maxSuffix + 1}`;
}

async function createUntitledBlock({ rowIndex = null } = {}) {
    if (DEMO_MODE) {
        setStatus('Demo mode: creating blocks is disabled', 'normal');
        return null;
    }

    await refreshBlocksLibrary();
    const name = getNextUntitledBlockName();
    const result = await saveBlock(name, 'Created from arrangement workspace', 'silence', null, 'user');
    if (!result?.ok || !result?.block?.filename) {
        setStatus('Failed to create block', 'error');
        return null;
    }

    const filename = result.block.filename;
    await refreshBlocksLibrary();
    activeArrangementBlockFilename = filename;
    trackerWorkspaceLoadedFilename = null;

    if (Number.isInteger(rowIndex) && arrangementDraftState?.rows?.[rowIndex]) {
        const row = arrangementDraftState.rows[rowIndex];
        if (!Array.isArray(row.blocks)) row.blocks = [];
        row.blocks.push(filename);
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: rowIndex, addedFilename: filename });
    }

    renderArrangementWorkspace();
    renderTrackerWorkspace();
    return filename;
}

function buildArrangementStatePayload() {
    return cloneArrangementState(arrangementDraftState || {
        name: getArrangementEntry(currentArrangementFilename)?.name || 'Arrangement',
        bpm: 120,
        rows: [{ repeats: 1, blocks: [], loop: false }],
    });
}

/** Same as buildArrangementStatePayload but with loop stripped from every row so loop is not persisted. */
function buildArrangementStatePayloadForSave() {
    const state = buildArrangementStatePayload();
    if (!state || !Array.isArray(state.rows)) return state;
    state.rows = state.rows.map((r) => ({ ...r, loop: false }));
    return state;
}

function emitArrangementStateChanged(extraDetail = {}) {
    const arrangementState = buildArrangementStatePayload();
    document.dispatchEvent(new CustomEvent('arrangements:stateChanged', {
        detail: {
            arrangementState,
            name: arrangementState.name,
            bpm: arrangementState.bpm,
            ...extraDetail,
        }
    }));
}

function applyArrangementPreviewAfterBlockRemoved(removedFilename) {
    if (!isArrangementPreviewPlaying()) return;
    if (arrangementPreviewPlayingFilename !== currentArrangementFilename) return;
    if (!arrangementPreviewContext?.trackerStateByFilename || !arrangementPreviewContext?.instrumentList) return;
    clearArrangementLiveOverride({ filename: removedFilename, scheduleUpdate: false });
    clearArrangementPendingLiveSwap();
    const arrangementState = buildArrangementStatePayload();
    arrangementPreviewContext = {
        ...arrangementPreviewContext,
        arrangementState,
        bpm: arrangementState.bpm || arrangementPreviewContext.bpm,
        mixSettings: getPlaybackMixSettings(),
    };
    updateArrangementPreview({
        arrangementState,
        trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
        instrumentList: arrangementPreviewContext.instrumentList,
        bpm: arrangementPreviewContext.bpm,
        mixSettings: arrangementPreviewContext.mixSettings,
        keepPosition: false,
    });
    updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
}

function scheduleArrangementAutoSave() {
    if (arrangementAutoSaveTimeout) {
        clearTimeout(arrangementAutoSaveTimeout);
    }
    arrangementAutoSaveTimeout = setTimeout(() => {
        saveCurrentArrangement();
    }, 180);
}

async function saveCurrentArrangement() {
    if (!currentArrangementFilename || !arrangementDraftState) return;
    if (getArrangementReadonly()) return;

    if (arrangementAutoSaveTimeout) {
        clearTimeout(arrangementAutoSaveTimeout);
        arrangementAutoSaveTimeout = null;
    }

    const arrangementState = buildArrangementStatePayloadForSave();
    const storageKey = `unsaved_arrangement_${currentArrangementFilename}`;
    try {
        localStorage.setItem(storageKey, JSON.stringify(arrangementState));
    } catch (_e) {
        // Ignore localStorage failures.
    }

    try {
        const res = await fetch(`/api/arrangements/${encodeURIComponent(currentArrangementFilename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify({
                name: arrangementState.name,
                arrangementState,
                scope: currentArrangementScope,
            }),
        });
        if (!res.ok) throw new Error('Failed to save arrangement');
        try {
            localStorage.removeItem(storageKey);
        } catch (_e) {
            // Ignore localStorage failures.
        }
        const entry = arrangementEntriesCache.find((e) => e.filename === currentArrangementFilename);
        if (entry) {
            entry.arrangementState = arrangementState;
        }
        setStatus('Saved arrangement', 'success');
    } catch (err) {
        console.error('[Arrangements] Autosave failed:', err);
        setStatus('Failed to save arrangement', 'error');
    }
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
                if (Array.isArray(arrangementDraftState?.rows)) {
                    arrangementDraftState.rows = arrangementDraftState.rows.map((row) => ({
                        ...row,
                        blocks: Array.isArray(row?.blocks)
                            ? row.blocks.map((b) => (b === previousFilename ? updatedFilename : b))
                            : [],
                    }));
                }
                if (activeArrangementBlockFilename === previousFilename) {
                    activeArrangementBlockFilename = updatedFilename;
                    if (currentArrangementFilename) {
                        arrangementSelectedBlockByArrangement[currentArrangementFilename] = updatedFilename;
                    }
                }
            }
            // Keep the blocks library cache in sync before re-rendering workspaces,
            // so getBlockByFilename(activeArrangementBlockFilename) can resolve the renamed block.
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
    const selectedBlock = activeArrangementBlockFilename ? getBlockByFilename(activeArrangementBlockFilename) : null;
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
                    const filename = activeArrangementBlockFilename;
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

function renderArrangementWorkspace() {
    if (!dom.arrangementWorkspacePane) return;
    if (!arrangementDraftState) {
        dom.arrangementWorkspacePane.innerHTML = `
            <div class="h-full p-4 text-sm text-muted-foreground" id="arrangementWorkspacePlaceholder">
                Select an arrangement from the Blocks list to open the arranger workspace.
            </div>
        `;
        renderTrackerWorkspace();
        return;
    }

    const readonly = getArrangementReadonly();
    const isPreviewPlaying = isArrangementPreviewPlaying();
    const blocksAvailableForPicker = readonly
        ? blocksLibraryCache
        : blocksLibraryCache.filter((block) => normalizeScope(block.scope) !== 'system');

    const sortBlocksForPicker = (blocks) => {
        const collator = typeof Intl !== 'undefined' && Intl.Collator
            ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            : null;
        const groupKey = (name) => {
            const s = String(name || '').trim().toLowerCase();
            const first = s[0] || '';
            if (first >= '0' && first <= '9') return `0${s}`;
            if (first >= 'a' && first <= 'z') return `1${s}`;
            return `2${s}`;
        };
        return (blocks || []).slice().sort((a, b) => {
            const aKey = groupKey(a?.name);
            const bKey = groupKey(b?.name);
            if (collator) {
                const byKey = collator.compare(aKey, bKey);
                if (byKey) return byKey;
            } else {
                if (aKey < bKey) return -1;
                if (aKey > bKey) return 1;
            }
            const aFile = String(a?.filename || '');
            const bFile = String(b?.filename || '');
            return collator ? collator.compare(aFile, bFile) : aFile.localeCompare(bFile);
        });
    };
    const blocksForPicker = sortBlocksForPicker(blocksAvailableForPicker);
    const blockByFilename = new Map(blocksLibraryCache.map((b) => [b.filename, b]));
    const compareRowBlockFilenames = (aFilename, bFilename) => {
        const aBlock = blockByFilename.get(aFilename);
        const bBlock = blockByFilename.get(bFilename);
        const aKey = aBlock ? aBlock.name : aFilename;
        const bKey = bBlock ? bBlock.name : bFilename;
        const collator = typeof Intl !== 'undefined' && Intl.Collator
            ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            : null;
        const groupKey = (name) => {
            const s = String(name || '').trim().toLowerCase();
            const first = s[0] || '';
            if (first >= '0' && first <= '9') return `0${s}`;
            if (first >= 'a' && first <= 'z') return `1${s}`;
            return `2${s}`;
        };
        const aGroup = groupKey(aKey);
        const bGroup = groupKey(bKey);
        if (collator) {
            const byGroup = collator.compare(aGroup, bGroup);
            if (byGroup) return byGroup;
            return collator.compare(String(aFilename || ''), String(bFilename || ''));
        }
        if (aGroup < bGroup) return -1;
        if (aGroup > bGroup) return 1;
        return String(aFilename || '').localeCompare(String(bFilename || ''));
    };
    const isMac = (() => {
        try {
            const platform = String(navigator?.platform || '');
            const ua = String(navigator?.userAgent || '');
            return /Mac/i.test(platform) || /Mac OS X/i.test(ua);
        } catch (_e) {
            return false;
        }
    })();
    const isCopyModifier = (event) => (isMac ? !!event.altKey : !!event.ctrlKey);
    const cssEscape = (value) => {
        try {
            return window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(String(value))
                : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        } catch (_e) {
            return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        }
    };
    const shakeChip = (rowEl, filename) => {
        if (!rowEl || !filename) return;
        const selector = `.arr-chip[data-filename="${cssEscape(filename)}"]`;
        const chip = rowEl.querySelector(selector);
        if (!chip) return;
        chip.classList.remove('shake');
        void chip.offsetWidth;
        chip.classList.add('shake');
        chip.addEventListener('animationend', () => chip.classList.remove('shake'), { once: true });
    };
    const handleBlockDrop = ({ filename, fromRowIndex, toRowIndex, copy }, targetRowEl, exitTransitionMs = 0) => {
        if (!filename || !Number.isInteger(toRowIndex)) return;
        const targetRow = arrangementDraftState.rows?.[toRowIndex];
        if (!targetRow) return;
        if (!Array.isArray(targetRow.blocks)) targetRow.blocks = [];

        const normalizedFrom = Number.isInteger(fromRowIndex) ? fromRowIndex : null;
        const normalizedTo = toRowIndex;
        const shouldCopy = Boolean(copy);

        if (normalizedFrom === normalizedTo) {
            if (targetRow.blocks.includes(filename)) {
                shakeChip(targetRowEl, filename);
            }
            return;
        }

        if (targetRow.blocks.includes(filename)) {
            shakeChip(targetRowEl, filename);
            return;
        }

        if (!shouldCopy && normalizedFrom != null) {
            const srcRow = arrangementDraftState.rows?.[normalizedFrom];
            if (srcRow && Array.isArray(srcRow.blocks)) {
                const idx = srcRow.blocks.indexOf(filename);
                if (idx >= 0) srcRow.blocks.splice(idx, 1);
            }
        }

        targetRow.blocks.push(filename);
        activeArrangementBlockFilename = filename;
        const doRender = () => {
            renderArrangementWorkspace();
            scheduleArrangementAutoSave();
            emitArrangementStateChanged({ addedRowIndex: normalizedTo, addedFilename: filename });
        };
        if (exitTransitionMs > 0) {
            setTimeout(doRender, exitTransitionMs);
        } else {
            doRender();
        }
    };

    dom.arrangementWorkspacePane.innerHTML = `
        <div class="h-full flex flex-col p-0">
            <div class="flex flex-col xl:flex-row xl:items-center gap-2 px-2 py-2">
                <div class="flex gap-2 items-center min-w-0 flex-1">
                    <button
                        id="arrangementWorkspacePreviewBtn"
                        type="button"
                        class="inline-flex items-center justify-center shrink-0 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border-0 bg-quaternary text-quaternary-foreground hover:bg-quaternary/80 w-10 h-10 p-0 shadow-sm"
                        title="${isPreviewPlaying ? 'Stop arrangement preview' : 'Preview arrangement'}"
                    >
                        <i data-lucide="${isPreviewPlaying ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>
                    </button>
                    <label for="arrangementWorkspaceName" class="hidden lg:inline text-xs font-bold text-muted-foreground uppercase shrink-0">Arrang.</label>
                    <input
                        type="text"
                        id="arrangementWorkspaceName"
                        value="${escapeHtml(arrangementDraftState.name)}"
                        placeholder="Arrangement Name"
                        class="min-w-0 flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        ${readonly ? 'readonly' : ''}
                    >
                </div>
                <div class="flex gap-2 items-center shrink-0">
                    <label for="arrangementWorkspaceBpm" class="text-xs font-bold text-muted-foreground uppercase">BPM</label>
                    <input
                        type="number"
                        id="arrangementWorkspaceBpm"
                        min="20"
                        max="300"
                        step="1"
                        value="${arrangementDraftState.bpm}"
                        class="bpm-input w-12 h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        ${readonly ? 'readonly' : ''}
                    >
                    <button
                        id="arrangementWorkspaceAdvancedSettingsBtn"
                        type="button"
                        class="dev-only-hidden inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                        title="Advanced settings"
                    >
                        <i data-lucide="settings" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <div class="flex-1 min-h-0 overflow-auto rounded-md p-0 bg-card/30">
                <div class="arr-rows-header">
                    <span class="arr-rows-header-spacer" aria-hidden="true"></span>
                    <span class="arr-rows-header-repeat" title="1 repeat = 16 steps" aria-hidden="true"></span>
                    <span class="arr-rows-header-blocks" aria-hidden="true"></span>
                </div>
                <div id="arrangementWorkspaceRows" class="flex flex-col"></div>
            </div>
            <footer class="flex items-center justify-between border-t border-border p-2 shrink-0 bg-card/30">
                <button
                    id="arrangementWorkspaceAddRowBtn"
                    type="button"
                    class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 ${readonly ? 'opacity-40 cursor-not-allowed' : ''}"
                    ${readonly ? 'disabled' : ''}
                >
                    <i data-lucide="plus" class="w-4 h-4 mr-2"></i> Add Row
                </button>
                <div class="arr-trash-dropzone-wrap relative inline-flex shrink-0">
                    <span id="arrangementWorkspaceTrashTooltip" class="arr-trash-tooltip" role="tooltip" aria-hidden="true">Drag blocks here to remove</span>
                    <div
                        id="arrangementWorkspaceTrashDropzone"
                        class="arr-trash-dropzone inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground hover:text-destructive h-9 w-9 ${readonly ? 'opacity-40 pointer-events-none' : ''}"
                        role="img"
                        aria-label="Drag blocks here to remove"
                        aria-describedby="arrangementWorkspaceTrashTooltip"
                    >
                        <i data-lucide="trash" class="w-4 h-4"></i>
                    </div>
                </div>
            </footer>
        </div>
    `;

    const nameInput = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspaceName');
    const bpmInput = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspaceBpm');
    const addRowBtn = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspaceAddRowBtn');
    const previewBtn = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspacePreviewBtn');
    const advancedSettingsBtn = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspaceAdvancedSettingsBtn');
    const rowsRoot = dom.arrangementWorkspacePane.querySelector('#arrangementWorkspaceRows');

    if (advancedSettingsBtn) {
        advancedSettingsBtn.addEventListener('click', () => {
            if (DEMO_MODE) return;
            const name = (nameInput?.value ?? arrangementDraftState?.name ?? '').trim();
            document.dispatchEvent(new CustomEvent('resource-scope:open', {
                detail: {
                    type: 'arrangement',
                    filename: currentArrangementFilename,
                    name,
                    scope: normalizeScope(currentArrangementScope),
                },
            }));
        });
    }

    if (nameInput) {
        nameInput.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; });
        nameInput.addEventListener('drop', (e) => { e.preventDefault(); });
    }
    nameInput?.addEventListener('input', () => {
        arrangementDraftState.name = String(nameInput.value || '').trim() || arrangementDraftState.name;
    });
    nameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (arrangementRenameDebounceTimeout) {
                clearTimeout(arrangementRenameDebounceTimeout);
                arrangementRenameDebounceTimeout = null;
            }
            nameInput.blur();
        }
    });
    nameInput?.addEventListener('blur', () => {
        const newName = String(nameInput?.value ?? '').trim() || arrangementDraftState.name;
        arrangementDraftState.name = newName;
        if (arrangementRenameDebounceTimeout) {
            clearTimeout(arrangementRenameDebounceTimeout);
            arrangementRenameDebounceTimeout = null;
        }
        if (currentArrangementFilename && !getArrangementReadonly()) {
            void saveCurrentArrangement();
            void renameArrangement({ quiet: true });
        } else if (currentArrangementFilename && currentArrangementScope === 'system') {
            setStatus('System arrangements cannot be renamed', 'normal');
            updateArrangementDisplayName(currentArrangementFilename, newName);
        } else if (currentArrangementFilename) {
            updateArrangementDisplayName(currentArrangementFilename, newName);
        }
    });
    bpmInput?.addEventListener('input', () => {
        const bpm = parseInt(bpmInput.value || '120', 10);
        arrangementDraftState.bpm = Number.isFinite(bpm) ? Math.max(20, Math.min(300, bpm)) : 120;
        scheduleArrangementAutoSave();
        emitArrangementStateChanged();
    });
    bpmInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            bpmInput.blur();
        }
    });
    bpmInput?.addEventListener('blur', () => {
        if (currentArrangementFilename && !getArrangementReadonly()) {
            void saveCurrentArrangement();
        }
    });
    if (bpmInput) setupScrubInteraction(bpmInput);
    addRowBtn?.addEventListener('click', () => {
        arrangementDraftState.rows.push({ repeats: 1, blocks: [], loop: false });
        renderArrangementWorkspace();
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: arrangementDraftState.rows.length - 1 });
    });

    const trashDropzone = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceTrashDropzone');
    const trashTooltip = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceTrashTooltip');
    if (trashDropzone && !readonly) {
        trashDropzone.addEventListener('click', (event) => {
            event.preventDefault();
            const wrap = trashDropzone.closest('.arr-trash-dropzone-wrap');
            let portal = document.getElementById('arrangementWorkspaceTrashTooltipPortal');
            const isShowing = portal && portal.isConnected;
            if (isShowing && portal) {
                portal.remove();
                if (trashTooltip?._arrTrashTooltipHide) {
                    document.removeEventListener('click', trashTooltip._arrTrashTooltipHide);
                    trashTooltip._arrTrashTooltipHide = null;
                }
                return;
            }
            const rect = trashDropzone.getBoundingClientRect();
            portal = document.createElement('div');
            portal.id = 'arrangementWorkspaceTrashTooltipPortal';
            portal.className = 'arr-trash-tooltip-portal';
            portal.setAttribute('role', 'tooltip');
            portal.textContent = 'Drag blocks here to remove';
            document.body.appendChild(portal);
            const tw = portal.offsetWidth;
            const th = portal.offsetHeight;
            const gap = 8;
            portal.style.left = `${rect.left + rect.width / 2 - tw / 2}px`;
            portal.style.top = `${rect.top - th - gap}px`;
            const hide = () => {
                const p = document.getElementById('arrangementWorkspaceTrashTooltipPortal');
                if (p) p.remove();
                if (trashTooltip?._arrTrashTooltipHide) {
                    document.removeEventListener('click', trashTooltip._arrTrashTooltipHide);
                    trashTooltip._arrTrashTooltipHide = null;
                }
            };
            const onDocClick = (e) => {
                if (wrap && wrap.contains(e.target)) return;
                hide();
            };
            if (trashTooltip) trashTooltip._arrTrashTooltipHide = onDocClick;
            requestAnimationFrame(() => document.addEventListener('click', onDocClick));
            setTimeout(hide, 4000);
        });
        trashDropzone.addEventListener('dragover', (event) => {
            const types = event.dataTransfer?.types;
            const isChip = types?.includes('application/x-zzfxm-arr-chip');
            const isRow = types?.includes('application/x-zzfxm-arr-row');
            if (!isChip && !isRow) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            trashDropzone.classList.add('arr-trash-dropzone-dragover');
        });
        trashDropzone.addEventListener('dragleave', (event) => {
            const related = event.relatedTarget;
            if (related && related instanceof Node && trashDropzone.contains(related)) return;
            trashDropzone.classList.remove('arr-trash-dropzone-dragover');
        });
        trashDropzone.addEventListener('drop', async (event) => {
            if (!event.dataTransfer || readonly) return;
            event.preventDefault();
            trashDropzone.classList.remove('arr-trash-dropzone-dragover');
            window.__arrRowDragFromIndex = undefined;

            let rowPayload = null;
            try {
                rowPayload = JSON.parse(event.dataTransfer.getData('application/x-zzfxm-arr-row') || 'null');
            } catch (_e) {
                rowPayload = null;
            }
            const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
            if (fromRowIndex != null) {
                if (arrangementDraftState.rows.length === 1) return;
                const confirmed = await confirmDialog({
                    title: 'Delete row?',
                    message: 'Delete this row? This cannot be undone.',
                    cancelLabel: 'No! Abort.',
                    confirmLabel: 'Delete',
                    confirmIcon: 'trash-2',
                    variant: 'danger',
                    overlayLight: true,
                });
                if (!confirmed) return;
                if (arrangementDraftState.rows.length === 1) {
                    arrangementDraftState.rows[0] = { repeats: 1, blocks: [], loop: false };
                } else {
                    arrangementDraftState.rows.splice(fromRowIndex, 1);
                }
                renderArrangementWorkspace();
                scheduleArrangementAutoSave();
                emitArrangementStateChanged();
                // Persist immediately so block usage on disk matches the UI.
                await saveCurrentArrangement();
                return;
            }

            let payload = null;
            try {
                payload = JSON.parse(event.dataTransfer.getData('application/x-zzfxm-arr-chip') || 'null');
            } catch (_e) {
                payload = null;
            }
            const filename = payload?.filename || event.dataTransfer.getData('text/plain') || '';
            const fromRowIndexChip = Number.isInteger(payload?.fromRowIndex) ? payload.fromRowIndex : null;
            if (filename && fromRowIndexChip != null) {
                const row = arrangementDraftState.rows?.[fromRowIndexChip];
                if (row?.blocks) {
                    const idx = row.blocks.indexOf(filename);
                    if (idx >= 0) row.blocks.splice(idx, 1);
                    if (activeArrangementBlockFilename === filename) {
                        activeArrangementBlockFilename = null;
                    }
                    renderArrangementWorkspace();
                    renderTrackerWorkspace();
                    scheduleArrangementAutoSave();
                    emitArrangementStateChanged({ removedFilename: filename });
                    applyArrangementPreviewAfterBlockRemoved(filename);
                    // Persist immediately so block usage on disk matches the UI (e.g. when row emptied, block can be deleted from library).
                    await saveCurrentArrangement();
                }
            }
        });
    }

    previewBtn?.addEventListener('click', () => {
        const selectedIsPlaying = isArrangementPreviewPlaying() && arrangementPreviewPlayingFilename === currentArrangementFilename;
        if (selectedIsPlaying) {
            stopArrangementPreview();
            document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: false } }));
            return;
        }
        // Stop any other playback (Strudel pattern, ZzFXMicro Player preview, tracker, or another arrangement) before starting this arrangement's preview.
        stopAllPlaybackForSelectionChange();
        document.dispatchEvent(new CustomEvent('arrangements:preview', {
            detail: { arrangement: { name: arrangementDraftState.name, arrangementState: buildArrangementStatePayload() }, filename: currentArrangementFilename }
        }));
    });

    if (rowsRoot) {
        arrangementDraftState.rows.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'arr-row';
            rowEl.dataset.rowIndex = String(rowIndex);
            const rowDragOver = (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = isCopyModifier(event) ? 'copy' : 'move';
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                const isRowDrag = event.dataTransfer.types.includes('application/x-zzfxm-arr-row');
                const fromIndex = isRowDrag ? window.__arrRowDragFromIndex : undefined;
                if (typeof fromIndex === 'number') {
                    if (fromIndex > rowIndex) rowEl.classList.add('arr-row-drop-target-above');
                    else if (fromIndex < rowIndex) rowEl.classList.add('arr-row-drop-target-below');
                } else {
                    rowEl.classList.add('arr-row-block-drop-target');
                }
            };
            rowEl.addEventListener('dragenter', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = isCopyModifier(event) ? 'copy' : 'move';
            });
            rowEl.addEventListener('dragover', rowDragOver);
            rowEl.addEventListener('dragleave', (event) => {
                const related = event.relatedTarget;
                if (related && related instanceof Node && rowEl.contains(related)) return;
                const hadBlock = rowEl.classList.contains('arr-row-block-drop-target');
                const hadAbove = rowEl.classList.contains('arr-row-drop-target-above');
                const hadBelow = rowEl.classList.contains('arr-row-drop-target-below');
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                if (hadBlock) rowEl.classList.add('arr-row-drop-target-exit-block');
                if (hadAbove) rowEl.classList.add('arr-row-drop-target-exit-above');
                if (hadBelow) rowEl.classList.add('arr-row-drop-target-exit-below');
                const exitDurationMs = 220;
                setTimeout(() => {
                    rowEl.classList.remove('arr-row-drop-target-exit-block', 'arr-row-drop-target-exit-above', 'arr-row-drop-target-exit-below');
                }, exitDurationMs);
            });
            const ARR_ROW_DROP_EXIT_MS = 200;
            const removeDropTargetAndAfter = (afterMs, run) => {
                const hadBlock = rowEl.classList.contains('arr-row-block-drop-target');
                const hadAbove = rowEl.classList.contains('arr-row-drop-target-above');
                const hadBelow = rowEl.classList.contains('arr-row-drop-target-below');
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                if (hadBlock) rowEl.classList.add('arr-row-drop-target-exit-block');
                if (hadAbove) rowEl.classList.add('arr-row-drop-target-exit-above');
                if (hadBelow) rowEl.classList.add('arr-row-drop-target-exit-below');
                const exitDurationMs = afterMs + 20;
                setTimeout(() => {
                    rowEl.classList.remove('arr-row-drop-target-exit-block', 'arr-row-drop-target-exit-above', 'arr-row-drop-target-exit-below');
                    run();
                }, exitDurationMs);
            };
            rowEl.addEventListener('drop', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                window.__arrRowDragFromIndex = undefined;
                let rowPayload = null;
                try {
                    rowPayload = JSON.parse(event.dataTransfer.getData('application/x-zzfxm-arr-row') || 'null');
                } catch (_e) {
                    rowPayload = null;
                }
                const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
                if (fromRowIndex != null && fromRowIndex !== rowIndex) {
                    removeDropTargetAndAfter(ARR_ROW_DROP_EXIT_MS, () => {
                        const moved = arrangementDraftState.rows.splice(fromRowIndex, 1)[0];
                        if (moved) {
                            arrangementDraftState.rows.splice(rowIndex, 0, moved);
                            renderArrangementWorkspace();
                            scheduleArrangementAutoSave();
                            emitArrangementStateChanged();
                        }
                    });
                    return;
                }
                let payload = null;
                try {
                    payload = JSON.parse(event.dataTransfer.getData('application/x-zzfxm-arr-chip') || 'null');
                } catch (_e) {
                    payload = null;
                }
                const filename = payload?.filename || event.dataTransfer.getData('text/plain') || '';
                const fromRowIndexChip = Number.isInteger(payload?.fromRowIndex) ? payload.fromRowIndex : null;
                removeDropTargetAndAfter(ARR_ROW_DROP_EXIT_MS, () => {
                    handleBlockDrop({
                        filename,
                        fromRowIndex: fromRowIndexChip,
                        toRowIndex: rowIndex,
                        copy: isCopyModifier(event),
                    }, rowEl, 0);
                });
            });

            const rowNumberEl = document.createElement('span');
            rowNumberEl.className = 'arr-row-number';
            rowNumberEl.setAttribute('aria-label', 'Row ' + (rowIndex + 1) + ' (click to play from here, drag to reorder)');
            rowNumberEl.title = 'Click to play from this row';
            if (!readonly) {
                rowNumberEl.draggable = arrangementDraftState.rows.length > 1;
                rowNumberEl.addEventListener('dragstart', (e) => {
                    if (arrangementDraftState.rows.length === 1) {
                        e.preventDefault();
                        return;
                    }
                    if (!e.dataTransfer) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-zzfxm-arr-row', JSON.stringify({ fromRowIndex: rowIndex }));
                    window.__arrRowDragFromIndex = rowIndex;
                });
                rowNumberEl.addEventListener('dragend', () => {
                    window.__arrRowDragFromIndex = undefined;
                    window.__arrRowDragJustEnded = true;
                    setTimeout(() => { window.__arrRowDragJustEnded = false; }, 100);
                    rowsRoot.querySelectorAll('.arr-row').forEach((el) => {
                        el.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                    });
                });
            }
            rowNumberEl.addEventListener('click', () => {
                if (window.__arrRowDragJustEnded) return;
                // When only changing start row on the same arrangement, defer stop until we're ready to start (reduces pause)
                const sameArrangementAlreadyPlaying = isArrangementPreviewPlaying() && arrangementPreviewPlayingFilename === currentArrangementFilename;
                if (!sameArrangementAlreadyPlaying) {
                    stopAllPlaybackForSelectionChange();
                } else {
                    stopTrackerPreviewPlayback();
                    try {
                        if (dom.repl.editor?.repl?.scheduler?.started) {
                            dom.repl.editor.stop();
                            updatePlayState(false);
                        }
                    } catch (_e) {}
                    if (isPreviewPlaying) {
                        stopZzfxmSong();
                        updatePreviewPlayButton(false);
                    }
                }
                const payload = buildArrangementStatePayload();
                console.log('[Arranger] dispatch arrangements:preview (from row click):', {
                    startRowIndex: rowIndex,
                    payloadRowLoops: (payload?.rows || []).map((r, i) => ({ i, loop: Boolean(r?.loop) })),
                    draftRowLoops: (arrangementDraftState?.rows || []).map((r, i) => ({ i, loop: Boolean(r?.loop) })),
                });
                document.dispatchEvent(new CustomEvent('arrangements:preview', {
                    detail: {
                        arrangement: { name: arrangementDraftState.name, arrangementState: payload },
                        startRowIndex: rowIndex,
                        filename: currentArrangementFilename,
                    },
                }));
            });
            rowNumberEl.innerHTML = `
                <span class="arr-row-number-value">${rowIndex + 1}</span>
                <i data-lucide="play" class="arr-row-play-icon hidden w-2.5 h-2.5 fill-current"></i>
            `;

            const rowNumberWrap = document.createElement('div');
            rowNumberWrap.className = 'arr-row-number-wrap';
            rowNumberWrap.appendChild(rowNumberEl);
            const loopRowBtn = document.createElement('button');
            loopRowBtn.type = 'button';
            loopRowBtn.className = 'arr-loop-row-btn';
            loopRowBtn.setAttribute('aria-label', row.loop ? 'Loop row (on)' : 'Loop row (off)');
            loopRowBtn.title = row.loop ? 'Loop row (on)' : 'Loop row (off)';
            loopRowBtn.dataset.loop = row.loop ? 'true' : 'false';
            loopRowBtn.innerHTML = '<i data-lucide="repeat-2" class="w-4 h-4"></i>';
            if (readonly) loopRowBtn.disabled = true;
            loopRowBtn.addEventListener('click', () => {
                if (readonly) return;
                if (row.loop) {
                    row.loop = false;
                } else {
                    arrangementDraftState.rows.forEach((r) => { r.loop = false; });
                    row.loop = true;
                }
                loopRowBtn.dataset.loop = row.loop ? 'true' : 'false';
                loopRowBtn.setAttribute('aria-label', row.loop ? 'Loop row (on)' : 'Loop row (off)');
                loopRowBtn.title = loopRowBtn.getAttribute('aria-label');
                rowsRoot.querySelectorAll('.arr-row').forEach((rowEl) => {
                    const i = parseInt(rowEl.dataset.rowIndex, 10);
                    const r = arrangementDraftState.rows?.[i];
                    const btn = rowEl.querySelector('.arr-loop-row-btn');
                    if (btn && r != null) {
                        btn.dataset.loop = r.loop ? 'true' : 'false';
                        btn.setAttribute('aria-label', r.loop ? 'Loop row (on)' : 'Loop row (off)');
                        btn.title = btn.getAttribute('aria-label');
                    }
                });
                if (window.lucide?.createIcons) window.lucide.createIcons();
                // Loop is runtime-only: notify tracker for loop-row switch at end of cycle, without triggering save
                document.dispatchEvent(new CustomEvent('arrangements:previewLoopChanged', {
                    detail: { arrangementState: buildArrangementStatePayload() },
                }));
            });
            rowNumberWrap.appendChild(loopRowBtn);

            const repeatsEl = document.createElement('input');
            repeatsEl.type = 'number';
            repeatsEl.min = '1';
            repeatsEl.max = '16';
            repeatsEl.step = '1';
            repeatsEl.value = String(row.repeats || 1);
            repeatsEl.className = 'arr-repeats';
            if (readonly) repeatsEl.readOnly = true;
            repeatsEl.addEventListener('input', () => {
                const val = parseInt(repeatsEl.value, 10);
                row.repeats = Number.isFinite(val) ? Math.min(Math.max(val, 1), 16) : 1;
                scheduleArrangementAutoSave();
                emitArrangementStateChanged();
            });
            const repeatsWrap = document.createElement('div');
            repeatsWrap.className = 'arr-repeats-wrap';
            repeatsWrap.appendChild(repeatsEl);
            const chipsEl = document.createElement('div');
            chipsEl.className = 'arr-chips';

            const updateSelectDisabled = (selectEl) => {
                if (!selectEl) return;
                const options = Array.from(selectEl.querySelectorAll('option'));
                for (const opt of options) {
                    if (!opt.value || opt.value === '__create__') continue;
                    opt.disabled = row.blocks.includes(opt.value);
                }
            };

            const selectEl = document.createElement('select');
            selectEl.className = 'arr-block-select';
            selectEl.setAttribute('aria-label', 'Add block');
            selectEl.title = 'Add block';
            if (readonly) selectEl.disabled = true;
            selectEl.innerHTML = `<option value="" selected></option><option value="__create__">+ New block</option>` + blocksForPicker
                .map((block) => {
                    const disabled = row.blocks.includes(block.filename) ? ' disabled' : '';
                    return `<option value="${escapeHtml(block.filename)}"${disabled}>${escapeHtml(block.name || block.filename.replace(/\.js$/i, ''))}</option>`;
                })
                .join('');
            selectEl.addEventListener('change', () => {
                if (readonly) return;
                const val = selectEl.value;
                if (!val) return;
                if (val === '__create__') {
                    selectEl.selectedIndex = 0;
                    void createUntitledBlock({ rowIndex });
                    return;
                }
                if (!row.blocks.includes(val)) {
                    row.blocks.push(val);
                }
                activeArrangementBlockFilename = val;
                if (currentArrangementFilename) arrangementSelectedBlockByArrangement[currentArrangementFilename] = val;
                selectEl.selectedIndex = 0;
                renderArrangementWorkspace();
                scheduleArrangementAutoSave();
                emitArrangementStateChanged({ addedRowIndex: rowIndex, addedFilename: val });
            });

            const selectWrap = document.createElement('div');
            selectWrap.className = 'arr-block-select-wrap';
            selectWrap.innerHTML = '<span class="arr-block-select-plus-label" aria-hidden="true">+</span>';
            selectWrap.appendChild(selectEl);

            const duplicateRowBtn = document.createElement('button');
            duplicateRowBtn.type = 'button';
            duplicateRowBtn.className = 'arr-row-del arr-row-dup';
            duplicateRowBtn.title = 'Duplicate row';
            duplicateRowBtn.innerHTML = '<i data-lucide="copy-plus" class="w-4 h-4"></i>';
            duplicateRowBtn.disabled = readonly;
            duplicateRowBtn.classList.toggle('opacity-40', readonly);
            duplicateRowBtn.classList.toggle('cursor-not-allowed', readonly);
            duplicateRowBtn.addEventListener('click', () => {
                if (readonly) return;
                const sourceRow = arrangementDraftState.rows?.[rowIndex];
                if (!sourceRow) return;
                const duplicatedRow = {
                    repeats: Number.isInteger(sourceRow.repeats) ? sourceRow.repeats : 1,
                    blocks: Array.isArray(sourceRow.blocks) ? sourceRow.blocks.slice() : [],
                    loop: Boolean(sourceRow.loop),
                };
                arrangementDraftState.rows.splice(rowIndex + 1, 0, duplicatedRow);
                renderArrangementWorkspace();
                scheduleArrangementAutoSave();
                emitArrangementStateChanged();
            });

            const removeRowBtn = document.createElement('button');
            removeRowBtn.type = 'button';
            removeRowBtn.className = 'arr-row-del';
            removeRowBtn.title = arrangementDraftState.rows.length === 1 ? 'Cannot remove the only row' : 'Remove row';
            removeRowBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
            const cannotRemoveRow = arrangementDraftState.rows.length === 1;
            removeRowBtn.disabled = readonly || cannotRemoveRow;
            removeRowBtn.classList.toggle('opacity-40', readonly || cannotRemoveRow);
            removeRowBtn.classList.toggle('cursor-not-allowed', readonly || cannotRemoveRow);
            removeRowBtn.addEventListener('click', async () => {
                if (readonly) return;
                const confirmed = await confirmDialog({
                    title: 'Delete row?',
                    message: 'Delete this row? This cannot be undone.',
                    cancelLabel: 'No! Abort.',
                    confirmLabel: 'Delete',
                    confirmIcon: 'trash-2',
                    variant: 'danger',
                    overlayLight: true,
                });
                if (!confirmed) return;
                if (arrangementDraftState.rows.length === 1) {
                    arrangementDraftState.rows[0] = { repeats: 1, blocks: [], loop: false };
                } else {
                    arrangementDraftState.rows.splice(rowIndex, 1);
                }
                renderArrangementWorkspace();
                scheduleArrangementAutoSave();
                emitArrangementStateChanged();
            });

            const renderChips = () => {
                chipsEl.innerHTML = '';
                row.blocks
                    .slice()
                    .sort(compareRowBlockFilenames)
                    .forEach((filename) => {
                        const block = getBlockByFilename(filename);
                        const chip = document.createElement('div');
                        chip.className = `arr-chip ${filename === activeArrangementBlockFilename ? 'ring-1 ring-primary' : ''}`;
                        chip.dataset.filename = filename;
                        chip.dataset.blockSteps = String(getBlockSteps(block));
                        chip.draggable = !readonly;
                        chip.addEventListener('dragstart', (event) => {
                            if (!event.dataTransfer || readonly) return;
                            const payload = { filename, fromRowIndex: rowIndex };
                            event.dataTransfer.effectAllowed = 'copyMove';
                            event.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify(payload));
                            event.dataTransfer.setData('text/plain', filename);
                        });
                        chip.innerHTML = `
                            <span class="arr-chip-label">${escapeHtml(block?.name || filename)}</span>
                            <button type="button" class="arr-chip-del" title="Remove"><i data-lucide="x" class="w-3 h-3"></i></button>
                        `;
                        chip.addEventListener('click', (event) => {
                            if (event.target?.closest('.arr-chip-del')) return;
                            activeArrangementBlockFilename = filename;
                            if (currentArrangementFilename) arrangementSelectedBlockByArrangement[currentArrangementFilename] = filename;
                            renderArrangementWorkspace();
                            renderTrackerWorkspace();
                        });
                        chip.querySelector('.arr-chip-del')?.addEventListener('click', async (event) => {
                            event.stopPropagation();
                            if (readonly) return;
                            const idx = row.blocks.indexOf(filename);
                            if (idx >= 0) row.blocks.splice(idx, 1);
                            if (activeArrangementBlockFilename === filename) {
                                activeArrangementBlockFilename = null;
                                if (currentArrangementFilename) arrangementSelectedBlockByArrangement[currentArrangementFilename] = null;
                            }
                            renderArrangementWorkspace();
                            renderTrackerWorkspace();
                            scheduleArrangementAutoSave();
                            emitArrangementStateChanged({ removedFilename: filename });
                            applyArrangementPreviewAfterBlockRemoved(filename);
                            // Persist immediately so block usage on disk matches the UI (e.g. when row emptied, block can be deleted from library).
                            await saveCurrentArrangement();
                        });
                        chipsEl.appendChild(chip);
                    });
            };

            const rowActionsGroup = document.createElement('div');
            rowActionsGroup.className = 'arr-row-btn-group';
            rowActionsGroup.appendChild(selectWrap);
            rowActionsGroup.appendChild(duplicateRowBtn);
            rowActionsGroup.appendChild(removeRowBtn);

            const rowMain = document.createElement('div');
            rowMain.className = 'arr-row-main';
            rowMain.appendChild(rowNumberWrap);
            rowMain.appendChild(repeatsWrap);
            rowMain.appendChild(chipsEl);

            const rowActions = document.createElement('div');
            rowActions.className = 'arr-row-actions';
            rowActions.appendChild(rowActionsGroup);

            rowEl.appendChild(rowMain);
            rowEl.appendChild(rowActions);
            rowsRoot.appendChild(rowEl);

            renderChips();
            updateSelectDisabled(selectEl);
        });
    }

    createIcons({ icons });
    updateAdvancedSettingsButtonsVisibility();
    if (isArrangementPreviewPlaying()) {
        applyArrangementWorkspacePlayhead(arrangementWorkspacePlayhead);
    } else {
        clearArrangementWorkspacePlayheadVisuals();
    }
    renderTrackerWorkspace();
    updateArrangementInstrumentUsage();
}

function updateArrangementWorkspacePreviewButtonState() {
    const previewBtn = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspacePreviewBtn');
    if (!previewBtn) return;
    const selectedIsPlaying = isArrangementPreviewPlaying() && arrangementPreviewPlayingFilename === currentArrangementFilename;
    previewBtn.title = selectedIsPlaying ? 'Stop arrangement preview' : 'Preview arrangement';
    previewBtn.innerHTML = `<i data-lucide="${selectedIsPlaying ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>`;
    createIcons({ icons });
}

function getBlockSteps(block) {
    const steps = Number.isInteger(block?.trackerState?.steps)
        ? block.trackerState.steps
        : (Array.isArray(block?.trackerState?.grid?.[0]) ? block.trackerState.grid[0].length : null);
    if (Number.isInteger(steps) && steps > 0) return steps;
    return 16;
}

function setArrangementWorkspaceRowPlayingVisual(rowEl, isPlaying) {
    if (!rowEl) return;
    const iconEl = rowEl.querySelector('.arr-row-play-icon');
    iconEl?.classList.add('hidden');
}

function clearArrangementWorkspacePlayheadVisuals() {
    const rowsRoot = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceRows');
    if (rowsRoot) {
        const rows = rowsRoot.querySelectorAll('.arr-row');
        rows.forEach((rowEl) => {
            rowEl.classList.remove('playing');
            setArrangementWorkspaceRowPlayingVisual(rowEl, false);
            rowEl.style.removeProperty('--arr-row-play-progress');
            rowEl.querySelectorAll('.arr-chip').forEach((chip) => {
                chip.style.removeProperty('--arr-chip-play-progress');
            });
        });
    }
    arrangementWorkspacePlayingRowIndex = null;
    arrangementWorkspacePlayhead = { rowIndex: null, progress: 0, blocks: [] };
}

function updateArrangementWorkspaceChipSteps(blocks = []) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    const blockByFilename = new Map(blocks.map((block) => [block.filename, block]));
    blocksLibraryCache = blocksLibraryCache.map((block) => {
        const update = blockByFilename.get(block.filename);
        return update?.trackerState ? { ...block, trackerState: update.trackerState } : block;
    });

    const chips = dom.arrangementWorkspacePane?.querySelectorAll('.arr-chip[data-filename]') || [];
    chips.forEach((chip) => {
        const filename = chip.dataset.filename;
        const update = blockByFilename.get(filename);
        if (!update?.trackerState) return;
        chip.dataset.blockSteps = String(getBlockSteps(update));
    });
}

function applyArrangementWorkspacePlayhead(detail = {}) {
    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const progress = typeof detail.progress === 'number' ? detail.progress : 0;
    arrangementWorkspacePlayhead = {
        rowIndex,
        progress,
        blocks: Array.isArray(detail.blocks) ? detail.blocks : [],
    };

    const rowsRoot = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspaceRows');
    if (!rowsRoot) {
        arrangementWorkspacePlayingRowIndex = rowIndex;
        return;
    }

    if (arrangementWorkspacePlayingRowIndex != null && arrangementWorkspacePlayingRowIndex !== rowIndex) {
        const prevEl = rowsRoot.querySelector(`.arr-row[data-row-index="${arrangementWorkspacePlayingRowIndex}"]`);
        if (prevEl) {
            prevEl.classList.remove('playing');
            setArrangementWorkspaceRowPlayingVisual(prevEl, false);
            prevEl.style.removeProperty('--arr-row-play-progress');
            prevEl.querySelectorAll('.arr-chip').forEach((chip) => {
                chip.style.removeProperty('--arr-chip-play-progress');
            });
        }
    }

    if (rowIndex == null) {
        arrangementWorkspacePlayingRowIndex = null;
        return;
    }

    const rowEl = rowsRoot.querySelector(`.arr-row[data-row-index="${rowIndex}"]`);
    if (!rowEl) {
        arrangementWorkspacePlayingRowIndex = rowIndex;
        return;
    }

    rowEl.classList.add('playing');
    setArrangementWorkspaceRowPlayingVisual(rowEl, true);
    const pct = Math.max(0, Math.min(progress, 1)) * 100;
    rowEl.style.setProperty('--arr-row-play-progress', `${pct.toFixed(2)}%`);

    const rowChanged = arrangementWorkspacePlayingRowIndex !== rowIndex;
    if (rowChanged && window.matchMedia('(max-width: 1023px)').matches) {
        rowEl.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
    }

    const row = arrangementDraftState?.rows?.[rowIndex];
    const rowSteps = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) * 16 : 16;
    const progressSteps = Math.max(0, Math.min(progress, 1)) * rowSteps;
    rowEl.querySelectorAll('.arr-chip').forEach((chip) => {
        const blockSteps = parseInt(chip.dataset.blockSteps || '16', 10);
        const steps = Number.isInteger(blockSteps) && blockSteps > 0 ? blockSteps : 16;
        const local = steps > 0 ? (progressSteps % steps) / steps : 0;
        const localPct = Math.max(0, Math.min(local, 1)) * 100;
        chip.style.setProperty('--arr-chip-play-progress', `${localPct.toFixed(2)}%`);
    });

    arrangementWorkspacePlayingRowIndex = rowIndex;
}

function renderBlocksLibraryFromCache() {
    if (!dom.blocksLibraryList) return;
    dom.blocksLibraryList.innerHTML = '';

    if (!blocksLibraryCache.length) {
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
                const isSelected = block.filename === activeArrangementBlockFilename;
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
                    activeArrangementBlockFilename = block.filename;
                    if (currentArrangementFilename) arrangementSelectedBlockByArrangement[currentArrangementFilename] = block.filename;
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

        const sorted = blocksLibraryCache
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
            (Array.isArray(blocksLibraryCache) ? blocksLibraryCache : [])
                .filter((block) => block?.filename)
                .map((block) => [block.filename, block])
        );
        const list = DEMO_MODE
            ? Array.from(demoBlockSourceByFile.keys()).map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'system', trackerState: null }))
            : await fetch('/api/blocks').then((r) => (r.ok ? r.json() : []));
        blocksLibraryCache = (Array.isArray(list) ? list : []).map((block) => {
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

function sanitizeArrangementBaseName(input) {
    return normalizePatternBaseName(input) || 'arrangement';
}

async function renameArrangement(options = {}) {
    const { quiet = false } = options;
    if (!currentArrangementFilename || !arrangementDraftState) return;
    if (getArrangementReadonly()) return;

    const rawName = document.getElementById('arrangementWorkspaceName')?.value?.trim() || arrangementDraftState.name || '';
    const baseName = sanitizeArrangementBaseName(rawName);
    const newFilename = `${baseName}.js`;

    if (newFilename === currentArrangementFilename) return;

    try {
        const res = await fetch('/api/arrangements');
        if (!res.ok) throw new Error('Failed to check arrangements');
        const list = await res.json();
        const existing = (list || []).map((a) => String(a?.filename || '').toLowerCase());
        if (existing.includes(newFilename.toLowerCase()) && newFilename.toLowerCase() !== currentArrangementFilename.toLowerCase()) {
            if (!quiet) setStatus('An arrangement with that name already exists', 'error');
            return;
        }
    } catch (e) {
        console.error(e);
        if (!quiet) setStatus('Error checking arrangement names', 'error');
        return;
    }

    if (!quiet) setStatus('Renaming...');

    try {
        await saveCurrentArrangement();
        const res = await fetch('/api/rename-arrangement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify({ oldName: currentArrangementFilename, newName: newFilename }),
        });
        if (!res.ok) throw new Error('Rename failed');

        const wasPlaying = arrangementPreviewPlayingFilename === currentArrangementFilename;
        const oldFilename = currentArrangementFilename;
        currentArrangementFilename = newFilename;
        arrangementDraftState.name = baseName;
        if (wasPlaying) arrangementPreviewPlayingFilename = newFilename;
        if (oldFilename && arrangementSelectedBlockByArrangement[oldFilename] != null) {
            arrangementSelectedBlockByArrangement[newFilename] = arrangementSelectedBlockByArrangement[oldFilename];
            delete arrangementSelectedBlockByArrangement[oldFilename];
        }
        arrangementRenameDebounceTimeout = null;

        await refreshArrangementList();
        const nameInput = document.getElementById('arrangementWorkspaceName');
        if (nameInput) nameInput.value = baseName;
        setStatus('Arrangement renamed', 'success');
        if (!quiet) setStatus('Renamed successfully', 'success');
    } catch (e) {
        console.error(e);
        if (!quiet) setStatus('Error renaming arrangement', 'error');
    }
}

/**
 * Update arrangement display name in cache and sidebar list (no save). Only updates if name changed.
 */
function updateArrangementDisplayName(filename, newName) {
    if (!filename || !dom.arrangementList) return;
    const entry = arrangementEntriesCache.find((e) => e.filename === filename);
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
    const block = blocksLibraryCache.find((b) => b.filename === filename);
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
    arrangementEntriesCache.forEach((entry) => {
        if (entry?.arrangementState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
            refs.push(entry);
        }
    });
    if (currentArrangementFilename && arrangementDraftState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
        const already = refs.some((entry) => entry.filename === currentArrangementFilename);
        if (!already) {
            refs.push({
                filename: currentArrangementFilename,
                name: arrangementDraftState.name,
                scope: currentArrangementScope,
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
        const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: getDeveloperModeHeaders(),
        });
        if (!res.ok) {
            if (res.status === 409) {
                let usedBy = [];
                try {
                    const payload = await res.json();
                    usedBy = Array.isArray(payload?.usedBy) ? payload.usedBy : [];
                } catch (_e) {
                    usedBy = [];
                }
                const list = usedBy.length
                    ? usedBy.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ')
                    : 'one or more arrangements';
                await alertDialog({
                    title: 'Cannot Delete Block',
                    message: `This block is used in arrangements:\n${list}`,
                });
                return;
            }
            throw new Error('Failed to delete block');
        }
        if (activeArrangementBlockFilename === filename) {
            activeArrangementBlockFilename = null;
            renderTrackerWorkspace();
        }
        await refreshBlocksLibrary();
        setStatus('Block deleted', 'success');
    } catch (err) {
        console.error('[Blocks] Delete failed:', err);
        setStatus('Failed to delete block', 'error');
    }
}

async function runArrangementPreviewPrime(filename) {
  if (currentArrangementFilename !== filename) return;
  const state = buildArrangementStatePayload();
  if (!state?.rows?.length) return;
  const wantedBlockFiles = Array.from(new Set((state.rows || []).flatMap((r) => Array.isArray(r?.blocks) ? r.blocks : [])));
  if (!wantedBlockFiles.length) return;
  const trackerStateByFilename = {};
  const cachedBlocks = Array.isArray(blocksLibraryCache) ? blocksLibraryCache : [];
  for (const f of wantedBlockFiles) {
    const block = cachedBlocks.find((b) => b?.filename === f);
    if (block?.trackerState) trackerStateByFilename[f] = resolveTrackerStateChannelInstruments(block.trackerState);
  }
  if (Object.keys(trackerStateByFilename).length === 0) return;
  const instrumentList = await getArrangementInstrumentList();
  if (!instrumentList?.length) return;
  primeArrangementPreviewBuffer(state, trackerStateByFilename, instrumentList, state.bpm || 120, getPlaybackMixSettings());
  const hasLoopRow = (state.rows || []).some((r) => Boolean(r?.loop));
  if (hasLoopRow) {
    primeArrangementPreviewBuffer(state, trackerStateByFilename, instrumentList, state.bpm || 120, getPlaybackMixSettings(), true);
  }
}

function scheduleArrangementPreviewPrime(filename) {
  if (arrangementPreviewPrimeTimeoutId) {
    clearTimeout(arrangementPreviewPrimeTimeoutId);
    arrangementPreviewPrimeTimeoutId = null;
  }
  if (!filename) return;
  arrangementPreviewPrimeTimeoutId = setTimeout(() => {
    arrangementPreviewPrimeTimeoutId = null;
    runArrangementPreviewPrime(filename).catch(() => {});
  }, 350);
}

async function loadArrangement(filename) {
    if (!filename) return;
    if (arrangementAutoSaveTimeout) {
        clearTimeout(arrangementAutoSaveTimeout);
        arrangementAutoSaveTimeout = null;
    }

    const isSwitching = currentArrangementFilename !== null && currentArrangementFilename !== filename;
    if (isSwitching) {
        clearArrangementWorkspacePlayheadVisuals();
    }

    try {
        // Do not stop playback when switching: like patterns, only the Play button stops current and starts the selected resource.
        const loadedScope = DEMO_MODE ? 'system' : normalizeScope(getArrangementEntry(filename)?.scope);
        const detail = DEMO_MODE
            ? null
            : await fetch(`/api/arrangements/${encodeURIComponent(filename)}`).then((r) => (r.ok ? r.json() : null));
        let arrangementState = cloneArrangementState(detail?.arrangementState || {
            name: decodeURIComponent(filename.replace(/\.js$/i, '')),
            bpm: 120,
            rows: [{ repeats: 1, blocks: [], loop: false }],
        });
        const recoveredArrangementState = readUnsavedArrangementState(filename, loadedScope);
        const recoveredFromCache = Boolean(recoveredArrangementState);
        if (recoveredArrangementState) {
            arrangementState = recoveredArrangementState;
            setStatus('⚠️ Recovered unsaved arrangement from cache', 'error');
        }

        currentArrangementFilename = filename;
        currentArrangementScope = loadedScope;
        arrangementDraftState = arrangementState;
        arrangementDraftState.name = (filename || '').replace(/\.js$/i, '');
        if (Array.isArray(arrangementDraftState.rows)) {
            arrangementDraftState.rows.forEach((r) => { if (r && typeof r === 'object') r.loop = false; });
        }
        const savedBlock = arrangementSelectedBlockByArrangement[filename];
        const blockInArrangement = savedBlock && (arrangementState.rows || []).some((row) => Array.isArray(row?.blocks) && row.blocks.includes(savedBlock));
        activeArrangementBlockFilename = blockInArrangement ? savedBlock : null;
        // Keep currentPatternFilename so pattern selection is remembered when switching back to Strudel tab.

        refreshArrangementListActiveState();
        await refreshBlocksLibrary();
        renderArrangementWorkspace();
        updateArrangementWorkspacePreviewButtonState();
        showArrangementWorkspace();
        scheduleArrangementPreviewPrime(filename);
        if (recoveredFromCache) {
            setTimeout(() => {
                if (currentArrangementFilename !== filename) return;
                saveCurrentArrangement();
            }, 500);
        }
    } catch (err) {
        console.error('[Arrangements] Failed to load arrangement:', err);
        setStatus('Failed to load arrangement', 'error');
    }
}

// --- Code Transformation Helpers ---

function fileToEditor(code) {
    let text = code;
    
    // 1. Remove imports (multiline safeish)
    text = text.replace(/^import .*?;\s*$/gm, '');
    
    // 2. Transform "export const bpm = ..." -> "const bpm = ..." AND Add setcps
    // We assume bfs is on a single line
    // Dividing by 240 because Strudel cycles are usually 4 beats. 
    // BPM / 60 = BeatsPerSec. / 4 = CyclesPerSec.
    text = text.replace(/export const bpm\s*=\s*(\d+);?/g, (match, val) => {
        return `const bpm = ${val};\nsetcps(bpm/240);`;
    });
    
    // 3. Transform "export const pattern =" -> remove, leaving expression
    text = text.replace(/export const pattern =\s*/, '');
    
    // 4. Remove trailing semicolon/whitespace at the very end
    text = text.replace(/;\s*$/, '');
    
    return text.trim();
}

function editorToFile(code) {
    const lines = code.split('\n');
    // Find bpm decl (could be 'bpm =' or 'const bpm =')
    let bpmLine = lines.find(l => l.trim().match(/^(const\s+)?bpm\s*=/));
    let bpmVal = 120;
    
    if (bpmLine) {
        // Extract val
        const match = bpmLine.match(/bpm\s*=\s*(\d+)/);
        if (match) bpmVal = match[1];
    }
    
    // Remove bpm line AND setcps line from pattern logic
    let cleanCode = lines
        .filter(l => !l.trim().match(/^(const\s+)?bpm\s*=/))
        .filter(l => !l.trim().startsWith('setcps('))
        .join('\n').trim();

    const extractBlocksAndArrangementsSetup = (codeText) => {
        const blocksStart = '// BLOCKS START';
        const blocksEnd = '// BLOCKS END';
        const arrStart = '// ARRANGEMENTS START';
        const arrEnd = '// ARRANGEMENTS END';

        const blocksStartIdx = codeText.indexOf(blocksStart);
        const blocksEndIdx = codeText.indexOf(blocksEnd);
        const arrStartIdx = codeText.indexOf(arrStart);
        const arrEndIdx = codeText.indexOf(arrEnd);

        // Nothing to extract.
        if (blocksStartIdx === -1 || blocksEndIdx === -1 || blocksEndIdx <= blocksStartIdx) return null;

        let setupEndIdx = blocksEndIdx + blocksEnd.length;
        if (arrStartIdx !== -1 && arrEndIdx !== -1 && arrEndIdx > arrStartIdx) {
            // If arrangements section exists, include it in setup so const declarations don't end up in pattern expr.
            setupEndIdx = arrEndIdx + arrEnd.length;
        }

        const setup = codeText.slice(0, setupEndIdx).trim();
        const expr = codeText.slice(setupEndIdx).trim();
        return { setup, expr };
    };

    const splitSetupAndExpr = (codeText) => {
        const rawLines = codeText.split('\n');
        // Find the smallest suffix that parses as an expression (supporting multiline expressions).
        for (let split = rawLines.length - 1; split >= 0; split--) {
            const setup = rawLines.slice(0, split).join('\n').trim();
            const expr = rawLines.slice(split).join('\n').trim();
            if (!expr) continue;
            const wrapped = `${setup}\nreturn (\n${expr}\n);`;
            try {
                // Parse-only; never executed.
                // eslint-disable-next-line no-new-func
                new Function(wrapped);
                return { setup, expr };
            } catch (_) {
                // keep searching
            }
        }
        return { setup: '', expr: codeText.trim() };
    };

    const extracted = extractBlocksAndArrangementsSetup(cleanCode);
    const { setup, expr } = extracted && extracted.expr ? extracted : splitSetupAndExpr(cleanCode);
    const finalExpr = expr && expr.trim() ? expr.trim() : 'stack()';
    
    // Identify used strudel functions for import
    const commonFuncs = ['stack', 'arrange', 'silence', 'note', 's', 'slow', 'fast', 'rev', 'jux', 'every', 'chunk', 'scale', 'gain', 'lpf', 'room', 'clip', 'sine', 'add', 'sub', 'mul', 'div', 'choose', 'rand', 'saw', 'square', 'tri', 'cat', 'seq', 'mini', 'tidal', 'pure', 'orbit', 'delay', 'shifto', 'shape', 'cps'];
    const usedImports = commonFuncs.filter(f => cleanCode.includes(f + '(') || cleanCode.includes(f + '.'));
    // Always include basics
    if (!usedImports.includes('note')) usedImports.push('note');
    if (!usedImports.includes('s')) usedImports.push('s');
    // We may insert blocks that rely on these even if the user's editor code doesn't.
    if (!usedImports.includes('stack')) usedImports.push('stack');
    if (!usedImports.includes('arrange')) usedImports.push('arrange');
    if (!usedImports.includes('silence')) usedImports.push('silence');
    if (!usedImports.includes('slow')) usedImports.push('slow');
    if (!usedImports.includes('gain')) usedImports.push('gain');
    
    const importStmt = `import { ${usedImports.join(', ')} } from "@strudel/core";`;
    
    const setupBlock = setup ? `\n${setup}\n` : '';

    return `${importStmt}

export const bpm = ${bpmVal};
${setupBlock}

export const pattern = ${finalExpr};
`;
}

async function loadPattern(filename) {
    // IMPORTANT: Clear any pending auto-save from the previous pattern
    // This prevents saving the new pattern's content to the old pattern's file
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    if (renameDebounceTimeout) {
        clearTimeout(renameDebounceTimeout);
        renameDebounceTimeout = null;
    }
    
    try {
        // Do not stop playback here: let the Strudel play button stop arrangement (etc.) and start pattern when user presses play.
        let fileCode = '';
        const loadedPatternScope = DEMO_MODE
            ? 'system'
            : normalizeScope(getPatternEntry(filename)?.scope);
        if (DEMO_MODE) {
            fileCode = demoPatternSourceByFile.get(filename);
            if (typeof fileCode !== 'string') throw new Error('Pattern not available in demo bundle');
        } else {
            const res = await fetch(`/api/pattern/${filename}`);
            if (!res.ok) throw new Error('Failed to load pattern');
            fileCode = await res.text();
        }
        
        // Transform for Editor
        let editorCode = fileToEditor(fileCode);
        
        // Check if there's an unsaved version in localStorage
        if (loadedPatternScope !== 'system' || isDeveloperModeEnabled()) {
            const unsavedCode = localStorage.getItem(`unsaved_${filename}`);
            if (unsavedCode) {
                // Recover from localStorage
                editorCode = unsavedCode;
                setStatus('⚠️ Recovered unsaved changes from cache', 'error');
                setTimeout(() => {
                    // Auto-save the recovered content
                    saveCurrentPattern();
                    localStorage.removeItem(`unsaved_${filename}`);
                }, 500);
            }
        }
        
        // Keep currentArrangementFilename and arrangementDraftState so arrangement selection is remembered when switching back to Blocks tab.

        currentPatternFilename = filename;
        currentPatternScope = loadedPatternScope;

        showEditor();
        refreshArrangementListActiveState();
        renderArrangementWorkspace();
        currentPatternDisplayName = decodeURIComponent(filename.replace('.js', '')); // Store without extension
        originalPatternName = currentPatternDisplayName; // Track for rename detection
        dom.patternNameInput.value = currentPatternDisplayName;
        dom.patternNameInput.readOnly = DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled());
        dom.patternNameInput.placeholder = '';
        if (dom.openPatternAdvancedSettingsBtn) {
            updateAdvancedSettingsButtonsVisibility();
        }
        
        Array.from(dom.patternList.querySelectorAll('.list-item')).forEach(li => {
            const isActive = li.dataset.filename === filename;
            li.classList.toggle('active', Boolean(isActive));
        });
        
        updatePatternListVisualizer();
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
            const view = dom.repl.editor.editor;
            if (view) {
                // Force CodeMirror to refresh syntax highlighting after document replace
                // (fixes highlighting breaking when switching away and back to the playing pattern)
                view.dispatch({});
                // Restore playback highlights when returning to the pattern that is playing;
                // clear them when loading a different pattern so we don't show stale/wrong ranges
                const locations = (filename === playingPatternFilename && dom.repl.editor.miniLocations)
                    ? dom.repl.editor.miniLocations
                    : [];
                updateMiniLocations(view, locations);
            }
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.exportBtn.disabled = false;
        
        // Clear ZzFXMicro Player export preview until this pattern/arrangement is exported again.
        clearZzfxmPreviewData();
        setStatus('');
        
        renderPlayButton(); // Update play button context (Stop vs Play)

        await loadPatternMeta(filename);
        
        // Update indicators in sidebar
        updateInstrumentUsage(editorCode);
        updatePatternSelectionState(true);

        setStatus('');
    } catch (e) {
        console.error(e);
        setStatus(`Error loading ${filename}`, 'error');
    }
}

async function loadPatternMeta(filename) {
    if (DEMO_MODE) return;
    try {
        const res = await fetch(`/api/pattern-meta/${filename}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.scope === 'string') {
            currentPatternScope = normalizeScope(data.scope);
            dom.patternNameInput.readOnly = DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled());
        }
        const mixSettings = sanitizePlaybackMixSettings({
            targetPeak: data?.playbackTargetPeak,
            masterGainDb: data?.playbackMasterGainDb,
            softClipDrive: data?.playbackSoftClipDrive,
        });
        applyPlaybackMixSettingsToInputs(mixSettings);
        const savedPreset = typeof data?.playbackLoudnessPreset === 'string' ? data.playbackLoudnessPreset : null;
        const resolvedPreset = normalizePlaybackPresetId(savedPreset) || inferPlaybackPresetId(mixSettings) || 'custom';
        setPlaybackPresetControl(resolvedPreset);
        const wavSampleRate = parseInt(data?.wavSampleRate, 10);
        if (dom.wavSampleRate && [8000, 11025, 16000, 22050, 32000, 44100, 48000].includes(wavSampleRate)) {
            dom.wavSampleRate.value = String(wavSampleRate);
        }
        const wavBitDepth = parseInt(data?.wavBitDepth, 10);
        if (dom.wavBitDepth && [8, 16, 24].includes(wavBitDepth)) {
            dom.wavBitDepth.value = String(wavBitDepth);
        }

        const rowsPerCycle = parseInt(data?.rowsPerCycle, 10);
        if (!rowsPerCycle || Number.isNaN(rowsPerCycle)) return;

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
    } catch (e) {
        console.warn('Failed to load pattern meta', e);
    }
}

async function savePatternMeta() {
    if (DEMO_MODE) return;
    if (!currentPatternFilename) return;
    const resolutionInput = document.querySelector('input[name="exportResolution"]:checked');
    let rowsPerCycle = 96;
    if (resolutionInput?.value === '48') {
        rowsPerCycle = 48;
    } else if (resolutionInput?.value === 'custom') {
        const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
        if (parsed && !Number.isNaN(parsed)) rowsPerCycle = parsed;
    }

    const mixSettings = sanitizePlaybackMixSettings({
        targetPeak: dom.playbackTargetPeak?.value,
        masterGainDb: dom.playbackMasterGainDb?.value,
        softClipDrive: dom.playbackSoftClipDrive?.value,
    });
    const presetId = normalizePlaybackPresetId(dom.playbackLoudnessPreset?.value)
        || inferPlaybackPresetId(mixSettings)
        || 'custom';
    const wavSettings = getWavExportSettings();

    try {
        let existing = {};
        try {
            const res = await fetch(`/api/pattern-meta/${currentPatternFilename}`);
            if (res.ok) {
                existing = await res.json();
            }
        } catch (_e) {
            existing = {};
        }
        await fetch(`/api/pattern-meta/${currentPatternFilename}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...(existing || {}),
                rowsPerCycle,
                playbackTargetPeak: mixSettings.targetPeak,
                playbackMasterGainDb: mixSettings.masterGainDb,
                playbackSoftClipDrive: mixSettings.softClipDrive,
                playbackLoudnessPreset: presetId,
                wavSampleRate: wavSettings.sampleRate,
                wavBitDepth: wavSettings.bitDepth,
            })
        });
    } catch (e) {
        console.warn('Failed to save pattern meta', e);
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
}

function setPlaybackPresetControl(presetId) {
    if (!dom.playbackLoudnessPreset) return;
    const normalized = normalizePlaybackPresetId(presetId) || 'custom';
    dom.playbackLoudnessPreset.value = normalized;
}

async function saveCurrentPattern() {
    if (DEMO_MODE) return;
    if (!currentPatternFilename) return;
    if (currentPatternScope === 'system' && !isDeveloperModeEnabled()) return;
    
    try {
        const editorCode = dom.repl.editor.code;
        const fileCode = editorToFile(editorCode);
        
        const res = await fetch(`/api/pattern/${currentPatternFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode
        });
        
        if (!res.ok) throw new Error('Save failed');
    } catch (e) {
        console.error(e);
    }
}

async function createNewPattern(name) {
    if (DEMO_MODE) {
        setStatus('Demo mode: creating patterns is disabled', 'normal');
        return;
    }
    const normalizedBase = normalizePatternBaseName(name);
    if (!normalizedBase) {
        setStatus('Invalid name. Use letters, numbers, spaces, hyphens, or underscores.', 'error');
        return;
    }
    if (normalizedBase !== String(name).trim()) {
        setStatus(`Using normalized name: ${normalizedBase}`, 'normal');
    }
    name = `${normalizedBase}.js`;
    
    setStatus('Creating...');
    // Initial file content
    const template = `import { stack, note } from "@strudel/core";

export const bpm = 120;

export const pattern = note("c3 e3 g3").s("demo-kickdrum");
`;

    try {
        const res = await fetch(`/api/pattern/${name}`, {
            method: 'POST',
            body: template
        });
        
        if (!res.ok) throw new Error('Create failed');
        
        closeModal();
        await refreshPatternList();
        await loadPattern(name); // loadPattern will handle the transform
        
    } catch (e) {
        console.error(e);
        setStatus('Error creating pattern', 'error');
    }
}

// async function deleteCurrentPattern() removed for new custom modal implementation below

// --- BAKING LOGIC ---

function stripQuotedStrings(source) {
    let out = '';
    let quote = null;
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            out += ' ';
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            out += ' ';
            continue;
        }
        out += ch;
    }
    return out;
}

function inferArrangeCyclesFromCode(code) {
    if (typeof code !== 'string' || !code.includes('arrange')) return null;
    const arrangeCallRegex = /\barrange\s*\(/g;
    let maxCycles = 0;
    let callMatch;

    while ((callMatch = arrangeCallRegex.exec(code)) !== null) {
        let i = arrangeCallRegex.lastIndex;
        let depth = 1;
        let quote = null;
        let escaped = false;

        while (i < code.length && depth > 0) {
            const ch = code[i];
            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === quote) {
                    quote = null;
                }
                i++;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                quote = ch;
                i++;
                continue;
            }
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            i++;
        }
        if (depth !== 0) continue;

        const argsSource = code.slice(arrangeCallRegex.lastIndex, i - 1);
        const argsSansStrings = stripQuotedStrings(argsSource);
        let sum = 0;
        let tupleMatch;
        const tupleRegex = /\[\s*(\d+)\s*,/g;
        while ((tupleMatch = tupleRegex.exec(argsSansStrings)) !== null) {
            sum += Number(tupleMatch[1]);
        }
        if (sum > maxCycles) maxCycles = sum;
    }

    return maxCycles > 0 ? maxCycles : null;
}

/** Duration (seconds) above which we show the export length warning (5 min). */
const EXPORT_LENGTH_WARNING_DURATION_SEC = 300;
/** Max cycles above which we show the export length warning. */
const EXPORT_LENGTH_WARNING_CYCLES = 512;
/** Cycles above which we show "large structure" message; below = "simple structure". */
const EXPORT_LENGTH_LARGE_STRUCTURE_CYCLES = 256;

function getExportDurationSeconds(cycles, bpm) {
    if (!Number.isFinite(cycles) || !Number.isFinite(bpm) || bpm <= 0) return 0;
    return (cycles * 240) / bpm;
}

function formatExportDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0 sec';
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    if (sec === 0) return `${min} min`;
    return `${min} min ${sec} sec`;
}

function shouldWarnExportLength(cycles, bpm) {
    if (!Number.isFinite(cycles) || cycles <= 0) return false;
    const durationSec = getExportDurationSeconds(cycles, bpm);
    return durationSec > EXPORT_LENGTH_WARNING_DURATION_SEC || cycles > EXPORT_LENGTH_WARNING_CYCLES;
}

/** Rough estimate of ZzFXMicro Player JSON size in bytes (instruments + pattern data). */
function estimateExportSizeBytes(cycles, rowsPerCycle, instrumentCount, channelCount) {
    const totalRows = cycles * rowsPerCycle;
    const instrumentBytes = Math.max(0, instrumentCount) * 280;
    const patternBytes = Math.max(0, channelCount) * totalRows * 14;
    return Math.ceil(instrumentBytes + patternBytes + 400);
}

function formatExportSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildExportLengthWarningMessage({ durationSec, cycles, bpm, estimatedSizeText }) {
    const durationStr = formatExportDuration(durationSec);
    const structureLine = cycles >= EXPORT_LENGTH_LARGE_STRUCTURE_CYCLES
        ? 'The song structure is large and uses lots of cycles. This can attribute to increased file size.'
        : 'The song structure is simple with a lower set of cycles. This will affect file size positively.';
    return `Your exported song duration exceeds 5 minutes. It will contribute to file size and can be unoptimal for small games or demos.\n\nTotal play time: about ${durationStr} (at ${bpm} BPM).\nEstimated export file size: ${estimatedSizeText}.\n\n${structureLine}`;
}

async function exportCurrentPattern(options = {}) {
    const { revealZzfxmPreview = true } = options;
    if (!currentPatternFilename) return;
    
    validateCode(dom.repl.editor.code);
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        const confirmed = await confirmDialog({
            title: 'Export With Warnings?',
            message: 'This code uses functions that ZzFXMicro Player format ignores (e.g. reverb/delay). Export anyway?',
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
        const songData = result.song;
        const {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases = []
        } = result.stats;
        
        // Store for preview
        setZzfxmPreviewData(songData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'pattern',
            filename: currentPatternFilename,
            reveal: revealZzfxmPreview,
        });
        
        // 4. Send JSON to server (local mode only)
        const jsonFilename = currentPatternFilename.replace('.js', '.json');
        await saveExportedSongFiles(jsonFilename, songData);
        
        // Show and enable ZzFXMicro Player preview buttons only for explicit ZzFXMicro Player export flow.
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
            if (statusAutoCollapseTimeout) clearTimeout(statusAutoCollapseTimeout);
            statusAutoCollapseTimeout = setTimeout(() => setStatus(''), STATUS_ROW_COLLAPSE_MS);
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


// --- Validation Logic ---

const UNSAFE_FUNCS = [
    'delay', 'room', 'reverb', 'lpf', 'hpf', 'bp', 'vowel', 
    'phaser', 'leslie', 'crush', 'cutoff', 'resonance',
    'distort', 'saturate', 'chorus', 'flanger', 'tremolo',
    'fit', 'legato', 'chop' // Timing effects that might not export well?
];

function validateCode(code) {
    const findings = [];
    UNSAFE_FUNCS.forEach(func => {
        // Simple regex check for function usage .func( or just func(
        // We use word boundary to avoid false positives
        const regex = new RegExp(`\\b${func}\\(`, 'g');
        if (regex.test(code)) {
            findings.push(func);
        }
    });

    if (findings.length > 0) {
        setStatus(`⚠️ Unsafe for Export: ${findings.join(', ')}`, 'error');
    } else {
        if (dom.statusMsg.innerText.startsWith('⚠️')) {
            setStatus('Ready', 'normal');
        }
    }
}


function setStatus(msg, type = 'normal') {
    if (statusFadeClearTimeout) {
        clearTimeout(statusFadeClearTimeout);
        statusFadeClearTimeout = null;
    }
    if (statusAutoCollapseTimeout) {
        clearTimeout(statusAutoCollapseTimeout);
        statusAutoCollapseTimeout = null;
    }

    const row = dom.footerStatusRow;

    if (!msg) {
        dom.statusMsg.style.opacity = '0';
        dom.statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
        if (row) {
            row.classList.remove('is-expanded');
        }
        statusFadeClearTimeout = setTimeout(() => {
            dom.statusMsg.textContent = '';
            statusFadeClearTimeout = null;
        }, STATUS_ROW_TRANSITION_MS);
        return;
    }

    if (row) {
        row.classList.remove('is-expanded');
        void row.offsetHeight;
        row.classList.add('is-expanded');
    }
    requestAnimationFrame(() => {
        dom.statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
        dom.statusMsg.classList.add(type === 'error' ? 'status-error' : (type === 'success' ? 'status-success' : 'status-normal'));
        if (type === 'success') {
            dom.statusMsg.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 inline-block align-middle shrink-0 mr-1"></i>${escapeHtml(msg.replace(/^✅\s*/, ''))}`;
            createIcons({ icons });
        } else {
            dom.statusMsg.innerText = msg;
        }
        dom.statusMsg.style.opacity = '1';
    });

    statusAutoCollapseTimeout = setTimeout(() => {
        setStatus('');
        statusAutoCollapseTimeout = null;
    }, STATUS_ROW_COLLAPSE_MS);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('app:status', (e) => {
    const { message, type } = e.detail || {};
    if (typeof message !== 'string') return;
    setStatus(message, type || 'normal');
});

function normalizePatternBaseName(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

async function updatePatternScope(filename, scope) {
    const res = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`);
    const existing = res.ok ? await res.json() : {};
    const updated = { ...(existing || {}), scope: normalizeScope(scope) };
    const writeRes = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
    });
    if (!writeRes.ok) throw new Error('Failed to update pattern scope');
}

async function updateBlockScope(filename, scope) {
    const detailRes = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
    if (!detailRes.ok) throw new Error('Failed to load block details');
    const detail = await detailRes.json();
    const writeRes = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: detail?.name || filename.replace(/\.js$/, ''),
            description: detail?.description || '',
            pattern: detail?.pattern || '',
            trackerState: detail?.trackerState ?? null,
            scope: normalizeScope(scope),
        }),
    });
    if (!writeRes.ok) throw new Error('Failed to update block scope');
}

async function updateArrangementScope(filename, scope) {
    const detailRes = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`);
    if (!detailRes.ok) throw new Error('Failed to load arrangement details');
    const detail = await detailRes.json();
    const writeRes = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: detail?.name || filename.replace(/\.js$/, ''),
            arrangementState: detail?.arrangementState ?? null,
            scope: normalizeScope(scope),
        }),
    });
    if (!writeRes.ok) throw new Error('Failed to update arrangement scope');
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
                if (context.filename === currentPatternFilename) {
                    currentPatternScope = nextScope;
                    dom.patternNameInput.readOnly = DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled());
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
                if (context.filename === currentArrangementFilename) {
                    currentArrangementScope = nextScope;
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

function openNewArrangementModal() {
    if (DEMO_MODE) {
        setStatus('Demo mode: creating arrangements is disabled', 'normal');
        return;
    }
    const suggested = `arrangement-${arrangementEntriesCache.filter((entry) => normalizeScope(entry.scope) === 'user').length + 1}`;
    if (dom.newArrangementName) dom.newArrangementName.value = suggested;
    dom.newArrangementModal?.classList.add('open');
    dom.newArrangementName?.focus();
}

function closeNewArrangementModal() {
    dom.newArrangementModal?.classList.remove('open');
    if (dom.newArrangementName) dom.newArrangementName.value = '';
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
    if (!currentPatternFilename) return;

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
        const wavName = currentPatternFilename.replace(/\.js$/i, '.wav');
        triggerFileDownload(wavName, new Blob([wavBuffer], { type: 'audio/wav' }), 'audio/wav');
        setStatus(`Downloaded WAV: ${wavName} (${wavSettings.sampleRate} Hz, ${wavSettings.bitDepth}-bit)`, 'success');
    } catch (e) {
        console.error(e);
        setStatus(`WAV export failed: ${e.message}`, 'error');
    }
}

async function exportCurrentArrangement() {
    if (!currentArrangementFilename || !arrangementDraftState) return;

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

        const slugify = (str) => (str || 'x')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || 'x';

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
            const baseVar = `block_${slugify(filename.replace(/\.js$/i, ''))}`;
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

        const editor = dom.repl.editor;
        await editor.repl.evaluate(arrangementCode, false);
        const pattern = editor.repl.scheduler.pattern;
        if (!pattern) throw new Error('No arrangement pattern found');

        const {
            array: instrumentArray,
            mapping: instrumentMapping,
            monophonicByIndex,
        } = await getInstrumentsForExporter();
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
        });
        const songData = result.song;
        const {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases = [],
        } = result.stats;

        setZzfxmPreviewData(songData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'arrangement',
            filename: currentArrangementFilename,
            reveal: true,
        });

        const jsonFilename = currentArrangementFilename.replace(/\.js$/i, '.json');
        await saveExportedSongFiles(jsonFilename, songData);

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
    if (!currentArrangementFilename || !arrangementDraftState) return;

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
        const wavName = currentArrangementFilename.replace(/\.js$/i, '.wav');
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
            : await (async () => {
                const res = await fetch('/api/patterns');
                if (!res.ok) throw new Error('Failed to list patterns');
                const payload = await res.json();
                return normalizePatternEntries(payload).map((entry) => entry.filename);
            })();

        let downloadedPatterns = 0;
        for (const filename of files) {
            let fileCode = '';
            if (filename === currentPatternFilename && dom.repl.editor?.code) {
                fileCode = editorToFile(dom.repl.editor.code);
            } else if (DEMO_MODE) {
                fileCode = demoPatternSourceByFile.get(filename) || '';
            } else {
                const res = await fetch(`/api/pattern/${filename}`);
                if (!res.ok) continue;
                fileCode = await res.text();
            }

            if (!fileCode.trim()) continue;
            zip.file(`patterns/${decodeURIComponent(filename)}`, fileCode);
            downloadedPatterns++;

            if (DEMO_MODE) {
                const metaFilename = filename.replace(/\.js$/i, '.meta.json');
                zip.file(`patterns/${decodeURIComponent(metaFilename)}`, JSON.stringify({ scope: 'system' }, null, 2));
            } else {
                const metaRes = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`);
                if (metaRes.ok) {
                    const metaText = await metaRes.text();
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
            const listRes = await fetch('/api/blocks');
            if (listRes.ok) {
                const blockItems = await listRes.json();
                for (const item of blockItems || []) {
                    const filename = item?.filename;
                    if (!filename) continue;
                    let code = '';
                    const rawRes = await fetch(`/blocks/${filename}`);
                    if (rawRes.ok) {
                        code = await rawRes.text();
                    } else {
                        const detailRes = await fetch(`/api/blocks/${filename}`);
                        if (detailRes.ok) {
                            const detail = await detailRes.json();
                            code = buildBlockSourceFromApi(detail);
                        }
                    }
                    if (!code.trim()) continue;
                    zip.file(`blocks/${decodeURIComponent(filename)}`, code);
                    downloadedBlocks++;
                }
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
            const listRes = await fetch('/api/arrangements');
            if (listRes.ok) {
                const arrangementItems = await listRes.json();
                for (const item of arrangementItems || []) {
                    const filename = item?.filename;
                    if (!filename) continue;
                    let code = '';
                    const rawRes = await fetch(`/arrangements/${filename}`);
                    if (rawRes.ok) {
                        code = await rawRes.text();
                    } else {
                        const detailRes = await fetch(`/api/arrangements/${filename}`);
                        if (detailRes.ok) {
                            const detail = await detailRes.json();
                            code = buildArrangementSourceFromApi(detail);
                        }
                    }
                    if (!code.trim()) continue;
                    zip.file(`arrangements/${decodeURIComponent(filename)}`, code);
                    downloadedArrangements++;
                }
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
        fetch('/api/patterns').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/blocks').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/arrangements').then((r) => (r.ok ? r.json() : [])).catch(() => []),
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
        const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`);
        return res.ok ? res.text() : '';
    }
    if (section === 'blocks') {
        const res = await fetch(`/blocks/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detailRes = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
        if (detailRes.ok) {
            const detail = await detailRes.json();
            return buildBlockSourceFromApi(detail);
        }
    }
    if (section === 'arrangements') {
        const res = await fetch(`/arrangements/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detailRes = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`);
        if (detailRes.ok) {
            const detail = await detailRes.json();
            return buildArrangementSourceFromApi(detail);
        }
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
        const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: content
        });
        return res.ok;
    }
    if (section === 'blocks') {
        const parsed = parseBlockSource(content);
        const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify(parsed),
        });
        return res.ok;
    }
    if (section === 'arrangements') {
        const parsed = parseArrangementSource(content);
        const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify(parsed),
        });
        return res.ok;
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
                const res = await fetch('/api/update-instruments', {
                    method: 'POST',
                    body: pendingUploadBundle.instrumentsContent,
                });
                if (res.ok) instrumentsImported = 1;
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

dom.exportBtn.addEventListener('click', () => {
    if (isArrangementWorkspaceActive()) {
        exportCurrentArrangement();
        return;
    }
    exportCurrentPattern();
});
if (dom.exportWavBtn) {
    dom.exportWavBtn.addEventListener('click', () => {
        if (isArrangementWorkspaceActive()) {
            exportCurrentArrangementWav();
            return;
        }
        exportCurrentPatternWav();
    });
}
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
        const filename = activeArrangementBlockFilename;
        if (!filename || !e.dataTransfer) return;
        const fromRowIndex = (arrangementDraftState?.rows && typeof arrangementDraftState.rows.findIndex === 'function')
            ? arrangementDraftState.rows.findIndex((r) => Array.isArray(r?.blocks) && r.blocks.includes(filename))
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
        if (!currentPatternFilename) return;
        openAdvancedSettingsModal({
            type: 'pattern',
            filename: currentPatternFilename,
            name: currentPatternDisplayName || currentPatternFilename.replace(/\.js$/, ''),
            scope: currentPatternScope,
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
        if (currentPatternFilename) {
            showEditor();
        }
        refreshPatternListActiveState();
    } else if (view === 'blocks') {
        await refreshArrangementList();
        await refreshBlocksLibrary();
        if (currentArrangementFilename) {
            showArrangementWorkspace();
        } else if (!currentPatternFilename) {
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
    if (!currentPatternFilename) return;
    if (DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled())) return;
    // No-op: name is saved on blur only.
});

// Save/rename when leaving the input (only renames if name actually changed).
dom.patternNameInput.addEventListener('blur', () => {
    if (!currentPatternFilename) return;
    if (DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled())) return;
    renamePattern({ quiet: true });
});

// Enter blurs the field; blur handler runs rename when name has changed.
dom.patternNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        dom.patternNameInput.blur();
    }
});

async function renamePattern(options = {}) {
    if (DEMO_MODE) return;
    const { quiet = false } = options;
    if (!currentPatternFilename) return;
    if (currentPatternScope === 'system' && !isDeveloperModeEnabled()) {
        if (!quiet) setStatus('System patterns are immutable', 'normal');
        return;
    }
    
    const rawName = dom.patternNameInput.value.trim();
    const newName = normalizePatternBaseName(rawName);
    if (!newName) {
        if (!quiet) {
            setStatus('Invalid name. Use letters, numbers, spaces, hyphens, or underscores.', 'error');
        }
        return;
    }
    if (dom.patternNameInput.value !== newName) {
        dom.patternNameInput.value = newName;
        if (!quiet && rawName !== newName) {
            setStatus(`Using normalized name: ${newName}`, 'normal');
        }
    }
    if (newName === originalPatternName) {
        return;
    }
    
    const newFilename = newName + '.js';
    
    // Check if name already exists
    try {
        const res = await fetch('/api/patterns');
        if (!res.ok) throw new Error('Failed to check existing patterns');
        const payload = await res.json();
        const files = normalizePatternEntries(payload).map((entry) => entry.filename);
        
        if (files.includes(newFilename) && newFilename !== currentPatternFilename) {
            if (!quiet) {
                setStatus('A pattern with that name already exists', 'error');
            }
            return;
        }
    } catch (e) {
        console.error(e);
        if (!quiet) {
            setStatus('Error checking pattern names', 'error');
        }
        return;
    }
    
    if (!quiet) {
        setStatus('Renaming...');
    }
    
    try {
        // Rename via API
        const res = await fetch('/api/rename-pattern', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify({
                oldName: currentPatternFilename,
                newName: newFilename
            })
        });
        
        if (!res.ok) throw new Error('Rename failed');
        
        // Update local state
        const wasPlaying = playingPatternFilename === currentPatternFilename;
        currentPatternFilename = newFilename;
        currentPatternDisplayName = newName;
        originalPatternName = newName;
        if (wasPlaying) playingPatternFilename = newFilename;
        renameDebounceTimeout = null;
        
        // Refresh pattern list
        await refreshPatternList();
        
        // Defer so footer isn't cleared by any same-tick updates from list refresh
        setTimeout(() => setStatus('Pattern renamed', 'success'), 0);
        
    } catch (e) {
        console.error(e);
        setStatus('Error renaming pattern', 'error');
        // Restore original name on error
        dom.patternNameInput.value = originalPatternName;
    }
}

dom.confirmDeleteBtn.addEventListener('click', async () => {
    if (patternToDelete) {
        await deletePattern(patternToDelete);
        closeDeleteModal();
    }
});

async function deletePattern(filename) {
    if (DEMO_MODE) {
        setStatus('Demo mode: deleting patterns is disabled', 'normal');
        return;
    }
    if (normalizeScope(getPatternEntry(filename)?.scope) === 'system' && !isDeveloperModeEnabled()) {
        setStatus('System patterns cannot be deleted', 'normal');
        return;
    }
    setStatus('Deleting...');
    try {
        const res = await fetch(`/api/pattern/${filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
        if (!res.ok) throw new Error('Delete failed');
        
        if (filename === playingPatternFilename) {
             if (dom.repl.editor) dom.repl.editor.stop();
             updatePlayState(false);
        }

        const wasCurrentPattern = (filename === currentPatternFilename);
        
        if (wasCurrentPattern) {
            showWelcome();
        }
        
        await refreshPatternList();
        
        // Clear status after a moment if we deleted the current pattern
        if (wasCurrentPattern) {
            setTimeout(() => setStatus(''), 1500);
        } else {
            setStatus('Deleted', 'success');
            setTimeout(() => setStatus(''), 2000);
        }
    } catch (e) {
        console.error(e);
        setStatus('Error deleting pattern', 'error');
    }
}

// Preview Panel Listeners
dom.previewPlayBtn.addEventListener('click', () => {
    if (isPreviewPlaying) {
        stopZzfxmSong();
        updatePreviewPlayButton(false);
        return;
    }

    if (!lastExportedData) {
        setStatus('Nothing to play. Export ZzFXMicro first.', 'error');
        return;
    }

    // Stop Strudel, arrangement preview, and tracker preview so only ZzFXMicro Player preview plays.
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

    validateCode(editor.code);

    const scheduler = editor.repl.scheduler;
    const isRunning = scheduler.started;
    const isPlayingCurrent = isRunning && playingPatternFilename === currentPatternFilename;
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

    // Stop any other playback (arrangement preview, ZzFXMicro Player, tracker) before starting Strudel.
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
        if (isStrudelPaused && playingPatternFilename === currentPatternFilename) {
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
        playingPatternFilename = currentPatternFilename;
    } else {
        playingPatternFilename = null;
    }
    updatePatternListVisualizer();
    renderPlayButton();
}

export function isStrudelPlaybackActive() {
    const editor = dom.repl.editor;
    return Boolean(editor && editor.repl && editor.repl.scheduler && editor.repl.scheduler.started);
}

function renderPlayButton() {
    const editor = dom.repl.editor;
    const isRunning = editor && editor.repl.scheduler.started;
    const showStop = isRunning && playingPatternFilename === currentPatternFilename;
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
        '//! Generated by ZzFXMicro Music',
        '// ZzFXMicro Player song data: [instruments, patterns, sequence, BPM]',
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
    const encodedJson = encodeURIComponent(jsonFilename);
    const jsonRes = await fetch(`/api/save-exported/${encodedJson}`, {
        method: 'POST',
        body: JSON.stringify(songData)
    });
    if (!jsonRes.ok) throw new Error('Server failed to save JSON');

    const baseName = jsonFilename.replace(/\.json$/i, '');
    const jsFilename = `${baseName}.js`;
    try {
        const moduleText = buildZzfxmSongJsModule(songData);
        const jsRes = await fetch(`/api/save-exported-js/${encodeURIComponent(jsFilename)}`, {
            method: 'POST',
            body: moduleText
        });
        if (!jsRes.ok) {
            console.warn('Server failed to save JS song module');
        }
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
    const contextFilename = lastExportedContext?.filename || currentPatternFilename || currentArrangementFilename || null;
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
        dom.patternNameInput.readOnly = DEMO_MODE || (currentPatternScope === 'system' && !isDeveloperModeEnabled());
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

function setupExportSettingsModal() {
    if (dom.playbackLoudnessPreset && !normalizePlaybackPresetId(dom.playbackLoudnessPreset.value)) {
        dom.playbackLoudnessPreset.value = DEFAULT_PLAYBACK_PRESET_ID;
    }

    // Open modal
    dom.exportSettingsBtn.addEventListener('click', () => {
        dom.exportSettingsModal.classList.add('open');
    });
    
    // Close modal
    dom.closeExportSettings.addEventListener('click', () => {
        dom.exportSettingsModal.classList.remove('open');
    });
    
    // Close on overlay click
    dom.exportSettingsModal.addEventListener('click', (e) => {
        if (e.target === dom.exportSettingsModal) {
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
            savePatternMeta();
        });
    });
    dom.exportResolutionCustom?.addEventListener('input', () => {
        updateResolutionUi();
        savePatternMeta();
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
        savePatternMeta();
    });

    dom.maxChannelsInput?.addEventListener('input', savePatternMeta);
    dom.normalizeLayers?.addEventListener('change', savePatternMeta);
    const handlePlaybackMixChange = () => {
        const inferred = inferPlaybackPresetId(getPlaybackMixSettings());
        setPlaybackPresetControl(inferred);
        savePatternMeta();
        if (!isArrangementPreviewPlaying()) return;
        updateArrangementPreview({
            mixSettings: getPlaybackMixSettings(),
            keepPosition: true,
        });
    };
    dom.playbackLoudnessPreset?.addEventListener('change', () => {
        const presetId = normalizePlaybackPresetId(dom.playbackLoudnessPreset?.value);
        if (!presetId || presetId === 'custom') {
            setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
            return;
        }
        const presetSettings = PLAYBACK_LOUDNESS_PRESETS[presetId];
        applyPlaybackMixSettingsToInputs(presetSettings);
        handlePlaybackMixChange();
    });
    dom.playbackTargetPeak?.addEventListener('input', handlePlaybackMixChange);
    dom.playbackMasterGainDb?.addEventListener('input', handlePlaybackMixChange);
    dom.playbackSoftClipDrive?.addEventListener('input', handlePlaybackMixChange);
    dom.wavSampleRate?.addEventListener('change', savePatternMeta);
    dom.wavBitDepth?.addEventListener('change', savePatternMeta);

    if (!dom.playbackTargetPeak?.value || !dom.playbackMasterGainDb?.value || !dom.playbackSoftClipDrive?.value) {
        applyPlaybackMixSettingsToInputs(PLAYBACK_LOUDNESS_PRESETS[DEFAULT_PLAYBACK_PRESET_ID]);
    }
    setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
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
        if (!activeArrangementBlockFilename) return;
        trackerWorkspaceLoadedFilename = null;
        renderTrackerWorkspace();
    });

    document.addEventListener('tracker:previewInstruments', (e) => {
        const detail = e?.detail || {};
        const aliases = Array.isArray(detail.aliases) ? detail.aliases : [];
        if (detail.playing) {
            // Stop Strudel pattern and ZzFXMicro Player export preview so only tracker preview is heard
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
            if (isTrackerPreviewPlaying()) {
                refreshTrackerPreview();
            }
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
            updateArrangementPreview({
                trackerStateByFilename: resolvedTrackerStateByFilename,
                instrumentList,
                keepPosition: true,
            });
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
async function openTrackerModal(options = {}) {
    if (options?.returnToArrangementsOnClose) {
        arrangementLiveEditSession = { active: true, committed: false };
    } else {
        arrangementLiveEditSession = { active: false, committed: false };
    }
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
            const response = await fetch(`/api/blocks/${block.filename}`);
            if (response.ok) {
                const fullBlock = await response.json();
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
            if (!currentPatternFilename) return;
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
            detail: { scope: currentPatternScope }
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
        openTrackerModal({
            returnToArrangementsOnClose: !!detail.returnToArrangementsOnClose,
            returnToBlocksOnClose: typeof detail.returnToBlocksOnClose === 'boolean' ? detail.returnToBlocksOnClose : undefined,
            arrangementInsertRowIndex: detail.arrangementInsertRowIndex,
        });

    });
    
    // Listen for blocks:edit event (from Blocks modal)
    document.addEventListener('blocks:edit', async (e) => {
        const { block, trackerState, returnToArrangementsOnClose, returnToBlocksOnClose } = e.detail;
        await openTrackerModalForEdit(block, trackerState, { returnToArrangementsOnClose, returnToBlocksOnClose });
    });
    
    // Listen for blocks:insert event
    document.addEventListener('blocks:insert', (e) => {
        const { pattern, name, preserveBlockBpm, blockBpm, blockSteps } = e.detail;
        if (pattern && dom.repl.editor) {
            // Get the current code and convert it to file format (with exports)
            let fileCode = editorToFile(dom.repl.editor.code || '');

            const slugify = (str) => (str || 'block')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 32) || 'block';

            const ensureBlocksSection = (code) => {
                if (code.includes('// BLOCKS START') && code.includes('// BLOCKS END')) return code;
                return code.replace(
                    /(export const bpm\s*=\s*\d+;\s*)/m,
                    `$1\n\n// BLOCKS START\n// BLOCKS END\n`
                );
            };

            const nextAvailableVarName = (code, base) => {
                let candidate = base;
                let n = 2;
                while (new RegExp(`\\bconst\\s+${candidate}\\b`).test(code) || new RegExp(`\\b${candidate}\\b`).test(code)) {
                    candidate = `${base}_${n}`;
                    n++;
                }
                return candidate;
            };

            const upsertPatternLayer = (code, layerVar) => {
                const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
                if (!match) {
                    return `${code.trim()}\n\nexport const pattern = ${layerVar};\n`;
                }
                const existing = match[1].trim();
                if (!existing) {
                    return code.replace(match[0], `export const pattern = ${layerVar};\n`);
                }

                try {
                    // Parse-only guard so we don't persist a broken pattern.
                    // eslint-disable-next-line no-new-func
                    new Function(`return (\n${existing}\n);`);
                } catch (_) {
                    return code.replace(match[0], `export const pattern = ${layerVar};\n`);
                }

                const findMatchingParen = (text, openIdx) => {
                    let depth = 0;
                    let inSingle = false;
                    let inDouble = false;
                    let inTemplate = false;
                    let inLineComment = false;
                    let inBlockComment = false;
                    for (let i = openIdx; i < text.length; i++) {
                        const ch = text[i];
                        const next = text[i + 1];

                        if (inLineComment) {
                            if (ch === '\n') inLineComment = false;
                            continue;
                        }
                        if (inBlockComment) {
                            if (ch === '*' && next === '/') {
                                inBlockComment = false;
                                i++;
                            }
                            continue;
                        }

                        if (inSingle) {
                            if (ch === '\\') {
                                i++;
                                continue;
                            }
                            if (ch === '\'') inSingle = false;
                            continue;
                        }
                        if (inDouble) {
                            if (ch === '\\') {
                                i++;
                                continue;
                            }
                            if (ch === '"') inDouble = false;
                            continue;
                        }
                        if (inTemplate) {
                            if (ch === '\\') {
                                i++;
                                continue;
                            }
                            if (ch === '`') inTemplate = false;
                            continue;
                        }

                        if (ch === '/' && next === '/') {
                            inLineComment = true;
                            i++;
                            continue;
                        }
                        if (ch === '/' && next === '*') {
                            inBlockComment = true;
                            i++;
                            continue;
                        }

                        if (ch === '\'') {
                            inSingle = true;
                            continue;
                        }
                        if (ch === '"') {
                            inDouble = true;
                            continue;
                        }
                        if (ch === '`') {
                            inTemplate = true;
                            continue;
                        }

                        if (ch === '(') depth++;
                        if (ch === ')') {
                            depth--;
                            if (depth === 0) return i;
                        }
                    }
                    return -1;
                };

                const tryAppendToTopLevelStack = (expr, arg) => {
                    const trimmed = expr.trimStart();
                    if (!trimmed.startsWith('stack')) return null;
                    const stackIdx = expr.indexOf('stack');
                    let i = stackIdx + 5;
                    while (i < expr.length && /\s/.test(expr[i])) i++;
                    if (expr[i] !== '(') return null;
                    const openIdx = i;
                    const closeIdx = findMatchingParen(expr, openIdx);
                    if (closeIdx === -1) return null;

                    const argsText = expr.slice(openIdx + 1, closeIdx);
                    const hasArgs = argsText.trim().length > 0;
                    const multiline = expr.includes('\n');

                    let insert;
                    if (hasArgs) {
                        insert = multiline ? `,\n  ${arg}` : `, ${arg}`;
                    } else {
                        insert = multiline ? `\n  ${arg}\n` : `${arg}`;
                    }

                    let insertPos = closeIdx;
                    if (hasArgs) {
                        while (insertPos > openIdx + 1 && /\s/.test(expr[insertPos - 1])) insertPos--;
                    }
                    return expr.slice(0, insertPos) + insert + expr.slice(insertPos);
                };

                const flattened = tryAppendToTopLevelStack(existing, layerVar);
                if (flattened) {
                    return code.replace(match[0], `export const pattern = ${flattened};\n`);
                }

                const next = `stack(\n  ${existing},\n  ${layerVar}\n)`;
                return code.replace(match[0], `export const pattern = ${next};\n`);
            };

            const normalizePatternStack = (code) => {
                const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
                if (!match) return code;
                const expr = match[1].trim();
                const trimmed = expr.trimStart();
                if (!trimmed.startsWith('stack')) return code;

                const findMatchingParen = (text, openIdx) => {
                    let depth = 0;
                    let inSingle = false;
                    let inDouble = false;
                    let inTemplate = false;
                    let inLineComment = false;
                    let inBlockComment = false;
                    for (let i = openIdx; i < text.length; i++) {
                        const ch = text[i];
                        const next = text[i + 1];

                        if (inLineComment) {
                            if (ch === '\n') inLineComment = false;
                            continue;
                        }
                        if (inBlockComment) {
                            if (ch === '*' && next === '/') {
                                inBlockComment = false;
                                i++;
                            }
                            continue;
                        }

                        if (inSingle) {
                            if (ch === '\\') { i++; continue; }
                            if (ch === '\'') inSingle = false;
                            continue;
                        }
                        if (inDouble) {
                            if (ch === '\\') { i++; continue; }
                            if (ch === '"') inDouble = false;
                            continue;
                        }
                        if (inTemplate) {
                            if (ch === '\\') { i++; continue; }
                            if (ch === '`') inTemplate = false;
                            continue;
                        }

                        if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
                        if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
                        if (ch === '\'') { inSingle = true; continue; }
                        if (ch === '"') { inDouble = true; continue; }
                        if (ch === '`') { inTemplate = true; continue; }

                        if (ch === '(') depth++;
                        if (ch === ')') {
                            depth--;
                            if (depth === 0) return i;
                        }
                    }
                    return -1;
                };

                const parseTopLevelArgs = (text) => {
                    const args = [];
                    let current = '';
                    let depth = 0;
                    let inSingle = false;
                    let inDouble = false;
                    let inTemplate = false;
                    let inLineComment = false;
                    let inBlockComment = false;
                    for (let i = 0; i < text.length; i++) {
                        const ch = text[i];
                        const next = text[i + 1];

                        if (inLineComment) {
                            current += ch;
                            if (ch === '\n') inLineComment = false;
                            continue;
                        }
                        if (inBlockComment) {
                            current += ch;
                            if (ch === '*' && next === '/') {
                                current += next;
                                inBlockComment = false;
                                i++;
                            }
                            continue;
                        }

                        if (inSingle) {
                            current += ch;
                            if (ch === '\\') { current += next; i++; continue; }
                            if (ch === '\'') inSingle = false;
                            continue;
                        }
                        if (inDouble) {
                            current += ch;
                            if (ch === '\\') { current += next; i++; continue; }
                            if (ch === '"') inDouble = false;
                            continue;
                        }
                        if (inTemplate) {
                            current += ch;
                            if (ch === '\\') { current += next; i++; continue; }
                            if (ch === '`') inTemplate = false;
                            continue;
                        }

                        if (ch === '/' && next === '/') { inLineComment = true; current += ch; continue; }
                        if (ch === '/' && next === '*') { inBlockComment = true; current += ch; continue; }
                        if (ch === '\'') { inSingle = true; current += ch; continue; }
                        if (ch === '"') { inDouble = true; current += ch; continue; }
                        if (ch === '`') { inTemplate = true; current += ch; continue; }

                        if (ch === '(') depth++;
                        if (ch === ')') depth--;

                        if (ch === ',' && depth === 0) {
                            args.push(current.trim());
                            current = '';
                            continue;
                        }

                        current += ch;
                    }
                    if (current.trim()) args.push(current.trim());
                    return args;
                };

                const stackIdx = expr.indexOf('stack');
                let i = stackIdx + 5;
                while (i < expr.length && /\s/.test(expr[i])) i++;
                if (expr[i] !== '(') return code;
                const openIdx = i;
                const closeIdx = findMatchingParen(expr, openIdx);
                if (closeIdx === -1) return code;

                const inner = expr.slice(openIdx + 1, closeIdx);
                const args = parseTopLevelArgs(inner);
                if (!args.length) return code;

                let flattened = [];
                let didFlatten = false;
                for (const arg of args) {
                    const argTrim = arg.trimStart();
                    if (argTrim.startsWith('stack')) {
                        const localIdx = arg.indexOf('stack');
                        let j = localIdx + 5;
                        while (j < arg.length && /\s/.test(arg[j])) j++;
                        if (arg[j] === '(') {
                            const close = findMatchingParen(arg, j);
                            if (close !== -1) {
                                const innerArg = arg.slice(j + 1, close);
                                const innerArgs = parseTopLevelArgs(innerArg);
                                if (innerArgs.length) {
                                    flattened = flattened.concat(innerArgs);
                                    didFlatten = true;
                                    continue;
                                }
                            }
                        }
                    }
                    flattened.push(arg);
                }

                if (!didFlatten) return code;

                const multiline = expr.includes('\n');
                const joiner = multiline ? ',\n  ' : ', ';
                const rebuilt = multiline
                    ? `stack(\n  ${flattened.join(joiner)}\n)`
                    : `stack(${flattened.join(joiner)})`;

                return code.replace(match[0], `export const pattern = ${rebuilt};\n`);
            };

            fileCode = ensureBlocksSection(fileCode);

            const baseVar = `block_${slugify(name)}`;
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

            fileCode = upsertPatternLayer(fileCode, varName);
            fileCode = normalizePatternStack(fileCode);
            
            // Convert back to editor format and set
            const editorCode = fileToEditor(fileCode);
            dom.repl.editor.setCode(editorCode);
            
            // Also save to server
            fetch(`/api/pattern/${currentPatternFilename}`, {
                method: 'POST',
                headers: getDeveloperModeHeaders(),
                body: fileCode
            });
            
            setStatus(`Block "${name}" inserted into pattern`, 'success');
        }
    });

	    // Listen for arrangements:insert event
	    document.addEventListener('arrangements:insert', async (e) => {
	        const { arrangement } = e.detail || {};
	        if (!arrangement || !dom.repl.editor) return;

        let fileCode = editorToFile(dom.repl.editor.code || '');

        const slugify = (str) => (str || 'x')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32) || 'x';

        const ensureBlocksSection = (code) => {
            if (code.includes('// BLOCKS START') && code.includes('// BLOCKS END')) return code;
            return code.replace(
                /(export const bpm\s*=\s*\d+;\s*)/m,
                `$1\n\n// BLOCKS START\n// BLOCKS END\n`
            );
        };

	        const ensureArrangementsSection = (code) => {
	            if (code.includes('// ARRANGEMENTS START') && code.includes('// ARRANGEMENTS END')) return code;
	            if (code.includes('// BLOCKS END')) {
	                return code.replace(
	                    /\/\/ BLOCKS END\s*\n/,
	                    `// BLOCKS END\n\n// ARRANGEMENTS START\n// ARRANGEMENTS END\n`
	                );
	            }
	            return code.replace(
	                /(export const bpm\s*=\s*\d+;\s*)/m,
	                `$1\n\n// ARRANGEMENTS START\n// ARRANGEMENTS END\n`
	            );
	        };

	        const nextAvailableVarName = (code, base) => {
	            let candidate = base;
	            let n = 2;
	            while (new RegExp(`\\bconst\\s+${candidate}\\b`).test(code) || new RegExp(`\\b${candidate}\\b`).test(code)) {
	                candidate = `${base}_${n}`;
	                n++;
	            }
	            return candidate;
	        };

	        const findMatchingParen = (text, openIdx) => {
	            let depth = 0;
	            let inSingle = false;
	            let inDouble = false;
	            let inTemplate = false;
            let inLineComment = false;
            let inBlockComment = false;
            for (let i = openIdx; i < text.length; i++) {
                const ch = text[i];
                const next = text[i + 1];

                if (inLineComment) {
                    if (ch === '\n') inLineComment = false;
                    continue;
                }
                if (inBlockComment) {
                    if (ch === '*' && next === '/') {
                        inBlockComment = false;
                        i++;
                    }
                    continue;
                }

                if (inSingle) {
                    if (ch === '\\\\') { i++; continue; }
                    if (ch === '\'') inSingle = false;
                    continue;
                }
                if (inDouble) {
                    if (ch === '\\\\') { i++; continue; }
                    if (ch === '"') inDouble = false;
                    continue;
                }
                if (inTemplate) {
                    if (ch === '\\\\') { i++; continue; }
                    if (ch === '`') inTemplate = false;
                    continue;
                }

                if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
                if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
                if (ch === '\'') { inSingle = true; continue; }
                if (ch === '"') { inDouble = true; continue; }
                if (ch === '`') { inTemplate = true; continue; }

                if (ch === '(') depth++;
                if (ch === ')') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
            return -1;
        };

        const appendToTopLevelStackExpr = (expr, arg) => {
            const trimmed = expr.trimStart();
            if (!trimmed.startsWith('stack')) return null;
            const stackIdx = expr.indexOf('stack');
            let i = stackIdx + 5;
            while (i < expr.length && /\s/.test(expr[i])) i++;
            if (expr[i] !== '(') return null;
            const openIdx = i;
            const closeIdx = findMatchingParen(expr, openIdx);
            if (closeIdx === -1) return null;

            const argsText = expr.slice(openIdx + 1, closeIdx);
            const hasArgs = argsText.trim().length > 0;
            const multiline = expr.includes('\n');
            const insert = hasArgs ? (multiline ? `,\n  ${arg}` : `, ${arg}`) : (multiline ? `\n  ${arg}\n` : `${arg}`);

            let insertPos = closeIdx;
            if (hasArgs) {
                while (insertPos > openIdx + 1 && /\s/.test(expr[insertPos - 1])) insertPos--;
            }
            return expr.slice(0, insertPos) + insert + expr.slice(insertPos);
        };

	        const upsertPatternLayer = (code, layerVar) => {
	            const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
	            if (!match) return `${code.trim()}\n\nexport const pattern = ${layerVar};\n`;
	            const existing = match[1].trim();
	            if (!existing) return code.replace(match[0], `export const pattern = ${layerVar};\n`);
	            const appended = appendToTopLevelStackExpr(existing, layerVar);
	            if (appended) return code.replace(match[0], `export const pattern = ${appended};\n`);
	            return code.replace(match[0], `export const pattern = stack(\n  ${existing},\n  ${layerVar}\n);\n`);
	        };

	        const normalizePatternStack = (code) => {
	            const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
	            if (!match) return code;
	            const expr = match[1].trim();
	            const trimmed = expr.trimStart();
	            if (!trimmed.startsWith('stack')) return code;

	            const parseTopLevelArgs = (text) => {
	                const args = [];
	                let current = '';
	                let depth = 0;
	                let inSingle = false;
	                let inDouble = false;
	                let inTemplate = false;
	                let inLineComment = false;
	                let inBlockComment = false;
	                for (let i = 0; i < text.length; i++) {
	                    const ch = text[i];
	                    const next = text[i + 1];

	                    if (inLineComment) {
	                        current += ch;
	                        if (ch === '\n') inLineComment = false;
	                        continue;
	                    }
	                    if (inBlockComment) {
	                        current += ch;
	                        if (ch === '*' && next === '/') {
	                            inBlockComment = false;
	                            current += next;
	                            i++;
	                        }
	                        continue;
	                    }

	                    if (inSingle) {
	                        current += ch;
	                        if (ch === '\\\\') { current += next; i++; continue; }
	                        if (ch === '\'') inSingle = false;
	                        continue;
	                    }
	                    if (inDouble) {
	                        current += ch;
	                        if (ch === '\\\\') { current += next; i++; continue; }
	                        if (ch === '"') inDouble = false;
	                        continue;
	                    }
	                    if (inTemplate) {
	                        current += ch;
	                        if (ch === '\\\\') { current += next; i++; continue; }
	                        if (ch === '`') inTemplate = false;
	                        continue;
	                    }

	                    if (ch === '/' && next === '/') { inLineComment = true; current += ch; continue; }
	                    if (ch === '/' && next === '*') { inBlockComment = true; current += ch; continue; }
	                    if (ch === '\'') { inSingle = true; current += ch; continue; }
	                    if (ch === '"') { inDouble = true; current += ch; continue; }
	                    if (ch === '`') { inTemplate = true; current += ch; continue; }

	                    if (ch === '(') depth++;
	                    if (ch === ')') depth--;

	                    if (ch === ',' && depth === 0) {
	                        args.push(current.trim());
	                        current = '';
	                        continue;
	                    }

	                    current += ch;
	                }
	                if (current.trim()) args.push(current.trim());
	                return args;
	            };

	            const stackIdx = expr.indexOf('stack');
	            let i = stackIdx + 5;
	            while (i < expr.length && /\\s/.test(expr[i])) i++;
	            if (expr[i] !== '(') return code;
	            const openIdx = i;
	            const closeIdx = findMatchingParen(expr, openIdx);
	            if (closeIdx === -1) return code;

	            const inner = expr.slice(openIdx + 1, closeIdx);
	            const args = parseTopLevelArgs(inner);
	            if (!args.length) return code;

	            let flattened = [];
	            let didFlatten = false;
	            for (const arg of args) {
	                const argTrim = arg.trimStart();
	                if (argTrim.startsWith('stack')) {
	                    const localIdx = arg.indexOf('stack');
	                    let j = localIdx + 5;
	                    while (j < arg.length && /\\s/.test(arg[j])) j++;
	                    if (arg[j] === '(') {
	                        const close = findMatchingParen(arg, j);
	                        if (close !== -1) {
	                            const innerArg = arg.slice(j + 1, close);
	                            const innerArgs = parseTopLevelArgs(innerArg);
	                            if (innerArgs.length) {
	                                flattened = flattened.concat(innerArgs);
	                                didFlatten = true;
	                                continue;
	                            }
	                        }
	                    }
	                }
	                flattened.push(arg);
	            }

	            if (!didFlatten) return code;

	            const multiline = expr.includes('\\n');
	            const joiner = multiline ? ',\\n  ' : ', ';
	            const rebuilt = multiline
	                ? `stack(\\n  ${flattened.join(joiner)}\\n)`
	                : `stack(${flattened.join(joiner)})`;

	            return code.replace(match[0], `export const pattern = ${rebuilt};\\n`);
	        };

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
	                const res = await fetch(`/api/blocks/${filename}`);
	                if (!res.ok) continue;
	                const block = await res.json();
	                // Use filename-derived var names to avoid name collisions between blocks.
	                const baseVar = `block_${slugify(filename.replace(/\\.js$/, ''))}`;
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
	        const baseArrVar = `arr_${slugify(arrName)}`;
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

	        fileCode = upsertPatternLayer(fileCode, arrVar);
	        fileCode = normalizePatternStack(fileCode);

        const editorCode = fileToEditor(fileCode);
        dom.repl.editor.setCode(editorCode);

        fetch(`/api/pattern/${currentPatternFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode
        });

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

	    // Listen for arrangements:preview event
	    document.addEventListener('arrangements:preview', async (e) => {
	        const { arrangement, startRowIndex, filename: previewFilename } = e.detail || {};
	        const arrangementState = arrangement?.arrangementState;
	        if (!arrangementState) return;

	        // Fast path: same arrangement already playing, just changing start row — use cached context to avoid async work and minimize pause
	        if (Number.isInteger(startRowIndex) && startRowIndex >= 0 &&
	            arrangementPreviewPlayingFilename === previewFilename &&
	            arrangementPreviewContext?.trackerStateByFilename != null &&
	            Array.isArray(arrangementPreviewContext?.instrumentList)) {
	            const stateToPlay = (currentArrangementFilename === previewFilename)
	                ? buildArrangementStatePayload()
	                : arrangementState;
	            arrangementPreviewContext = {
	                ...arrangementPreviewContext,
	                arrangementState: stateToPlay,
	                mixSettings: getPlaybackMixSettings(),
	            };
	            arrangementPreviewPlayingFilename = previewFilename ?? null;
	            stopArrangementPreview();
	            const started = startArrangementPreview(
	                stateToPlay,
	                arrangementPreviewContext.trackerStateByFilename,
	                arrangementPreviewContext.instrumentList,
	                arrangementPreviewContext.bpm ?? 120,
	                {
	                    keepPosition: false,
	                    mixSettings: arrangementPreviewContext.mixSettings,
	                    startRowIndex,
	                }
	            );
	            if (!started) {
	                setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
	                arrangementPreviewPlayingFilename = null;
	            }
	            document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: started } }));
	            return;
	        }

	        console.log('[Arranger] preview listener received:', {
	            startRowIndex,
	            receivedRowLoops: (arrangementState?.rows || []).map((r, i) => ({ i, loop: Boolean(r?.loop) })),
	        });

	        try {
	            console.log('[Arranger] Preview start:', arrangementState);
		            const instrumentList = await getArrangementInstrumentList();
		            const instrumentIdSet = new Set(instrumentList.map(i => i.id));

	            const wantedBlockFiles = Array.from(new Set(
	                (arrangementState.rows || []).flatMap(r => Array.isArray(r.blocks) ? r.blocks : [])
	            ));

	            const isPlayableTrackerState = (ts) => {
	                if (!ts) return false;
	                if (!Array.isArray(ts.grid) || !Array.isArray(ts.channelInstruments)) return false;
	                return ts.grid.some((channel, ch) => {
	                    const instId = ts.channelInstruments[ch];
	                    if (!instId || !instrumentIdSet.has(instId)) return false;
	                    const hasPlayableNote = (cell) => {
	                        const n = cell && typeof cell === 'object' ? cell.note : cell;
	                        return n && n !== '~' && n !== '-';
	                    };
	                    return Array.isArray(channel) && channel.some(hasPlayableNote);
	                });
	            };

	            const trackerStateByFilename = {};
	            const previewBlocks = [];
	            const resolvedFilenames = new Set();
	            let playable = 0;
	            const registerTrackerState = (filename, trackerState) => {
	                if (!filename || !trackerState || trackerStateByFilename[filename]) return;
	                const resolved = resolveTrackerStateChannelInstruments(trackerState);
	                trackerStateByFilename[filename] = resolved;
	                previewBlocks.push({ filename, trackerState });
	                if (isPlayableTrackerState(resolved)) playable++;
	            };

	            const cachedBlocksByFilename = new Map(
	                (Array.isArray(blocksLibraryCache) ? blocksLibraryCache : [])
	                    .filter((block) => block?.filename)
	                    .map((block) => [block.filename, block])
	            );

	            for (const filename of wantedBlockFiles) {
	                const cached = cachedBlocksByFilename.get(filename);
	                if (!cached) continue;
	                resolvedFilenames.add(filename);
	                registerTrackerState(filename, cached.trackerState);
	            }

	            const missingBlocks = wantedBlockFiles.filter((filename) => !trackerStateByFilename[filename]);
	            const mergeFetchedBlocks = (fetchedBlocks = []) => {
	                fetchedBlocks.forEach((result) => {
	                    if (!result?.block) return;
	                    const { filename, block } = result;
	                    resolvedFilenames.add(filename);
	                    registerTrackerState(filename, block.trackerState);

	                    const cacheIndex = blocksLibraryCache.findIndex((entry) => entry?.filename === filename);
	                    if (cacheIndex !== -1) {
	                        blocksLibraryCache[cacheIndex] = { ...blocksLibraryCache[cacheIndex], ...block };
	                    } else {
	                        blocksLibraryCache.push({ filename, ...block });
	                    }
	                });
	            };
	            const fetchMissingBlocks = async (filenames = []) => Promise.all(
	                filenames.map(async (filename) => {
	                    try {
	                        const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
	                        if (!res.ok) return null;
	                        const block = await res.json();
	                        return { filename, block };
	                    } catch (err) {
	                        console.warn('[Arranger] Failed to fetch block for preview:', filename, err);
	                        return null;
	                    }
	                })
	            );
	            const startPreviewWithCurrentStates = () => {
	                const bpm = arrangementState.bpm || 120;
	                const mixSettings = getPlaybackMixSettings();
	                console.log('[Arranger] Preview rendering. bpm:', bpm, 'blocks:', Object.keys(trackerStateByFilename).length);
	                // Use fresh payload from current draft when still on same arrangement so loop (and other) flags are never stale
	                const stateToPlay = (currentArrangementFilename === previewFilename)
	                    ? buildArrangementStatePayload()
	                    : arrangementState;
	                console.log('[Arranger] startPreviewWithCurrentStates passing to tracker:', {
	                    arrangementStateRowLoops: (stateToPlay?.rows || []).map((r, i) => ({ i, loop: Boolean(r?.loop) })),
	                    startRowIndex,
	                });
	                arrangementPreviewContext = {
	                    arrangementState: stateToPlay,
	                    trackerStateByFilename: { ...trackerStateByFilename },
	                    instrumentList,
	                    bpm,
	                    mixSettings,
	                };
	                if (previewBlocks.length) {
	                    document.dispatchEvent(new CustomEvent('arrangements:blocksLoaded', { detail: { blocks: previewBlocks } }));
	                }
	                // Set playing filename before start so synchronous playhead emit (e.g. start-from-row) is applied
	                arrangementPreviewPlayingFilename = previewFilename ?? null;
	                stopArrangementPreview();
	                const started = startArrangementPreview(stateToPlay, trackerStateByFilename, instrumentList, bpm, {
	                    keepPosition: false,
	                    mixSettings,
	                    startRowIndex: Number.isInteger(startRowIndex) ? startRowIndex : undefined,
	                });
	                if (!started) {
	                    setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
	                    arrangementPreviewPlayingFilename = null;
	                }
	                document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: started } }));
	                return started;
	            };

	            // Ensure all referenced blocks are loaded before first playback so loudness/render
	            // matches export behavior (full arrangement pass, no partial early start).
	            if (missingBlocks.length) {
	                setStatus('Preparing arrangement preview...', 'normal');
	                const fetchedBlocks = await fetchMissingBlocks(missingBlocks);
	                mergeFetchedBlocks(fetchedBlocks);
	            }

	            const unresolvedBlocks = wantedBlockFiles.filter((filename) => !trackerStateByFilename[filename]);
	            if (unresolvedBlocks.length > 0) {
	                setStatus(`Arrangement preview failed: missing blocks (${unresolvedBlocks.length}).`, 'error');
	                return;
	            }

		            if (wantedBlockFiles.length > 0 && resolvedFilenames.size === 0) {
		                setStatus('Arrangement preview failed: could not load blocks.', 'error');
		                return;
		            }
		            if (wantedBlockFiles.length > 0 && playable === 0) {
		                setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
		                return;
		            }
	            startPreviewWithCurrentStates();
        } catch (err) {
            console.error('[Arranger] Preview failed:', err);
            setStatus('Arrangement preview failed (see console).', 'error');
        }
    });

	        document.addEventListener('arrangements:stateChanged', (e) => {
            if (!isArrangementPreviewPlaying()) return;
            if (arrangementPreviewPlayingFilename !== currentArrangementFilename) return;
            const arrangementState = e?.detail?.arrangementState;
            if (!arrangementState) return;
	            arrangementPreviewContext = {
	                ...arrangementPreviewContext,
	                arrangementState,
	                bpm: arrangementState.bpm || arrangementPreviewContext.bpm,
                    mixSettings: getPlaybackMixSettings(),
	            };
            const addedRowIndex = e?.detail?.addedRowIndex;
            const addedFilename = e?.detail?.addedFilename;
            const removedFilename = e?.detail?.removedFilename;
            if (Number.isInteger(addedRowIndex)) {
                clearArrangementLiveOverride({ rowIndex: addedRowIndex, scheduleUpdate: false });
            }
            if (addedFilename) {
                clearArrangementLiveOverride({ filename: addedFilename, scheduleUpdate: false });
            }
            if (removedFilename) {
                clearArrangementLiveOverride({ filename: removedFilename, scheduleUpdate: false });
            }
            const keepPosition = !removedFilename;
	            updateArrangementPreview({
		                arrangementState,
		                trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
		                instrumentList: arrangementPreviewContext.instrumentList,
		                bpm: arrangementPreviewContext.bpm,
	                    mixSettings: arrangementPreviewContext.mixSettings,
		                keepPosition,
				            });
                updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
        });

        document.addEventListener('arrangements:previewLoopChanged', (e) => {
            if (!isArrangementPreviewPlaying()) return;
            const arrangementState = e?.detail?.arrangementState;
            if (!arrangementState) return;
            updateArrangementPreview({
                arrangementState,
                trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
                instrumentList: arrangementPreviewContext.instrumentList,
                bpm: arrangementPreviewContext.bpm,
                mixSettings: arrangementPreviewContext.mixSettings,
                keepPosition: true,
            });
        });

        document.addEventListener('arrangements:blocksLoaded', (e) => {
            const blocks = e?.detail?.blocks || [];
            updateArrangementWorkspaceChipSteps(blocks);
            updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
        });

        document.addEventListener('arrangements:playhead', (e) => {
            const detail = e?.detail || {};
            if (arrangementPreviewPlayingFilename === currentArrangementFilename) {
                applyArrangementWorkspacePlayhead(detail);
            }
            updateArrangementPlaybackInstrumentAliases(detail);
            updateArrangementListScopeVisualizer();
        });

        document.addEventListener('arrangements:previewState', (e) => {
            updateArrangementWorkspacePreviewButtonState();
            const playing = e?.detail?.playing ?? isArrangementPreviewPlaying();
            if (!playing) {
                arrangementPreviewPlayingFilename = null;
                clearArrangementWorkspacePlayheadVisuals();
                clearArrangementPlaybackInstrumentAliases();
                updateArrangementListScopeVisualizer();
                return;
            }
            updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
            updateArrangementListScopeVisualizer();
        });

        document.addEventListener('tracker:stateChanged', (e) => {
            const { filename, trackerState, arrangementInsertRowIndex, name, pattern, immediate } = e.detail || {};
            if (!trackerState) return;
            if (filename && (currentArrangementFilename || activeArrangementBlockFilename)) {
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
            if (!currentPatternFilename) return;
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
                        activeArrangementBlockFilename = createdBlock.filename;
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
                        activeArrangementBlockFilename = updatedFilename;
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
        const res = await fetch('/api/blocks');
        if (res.ok) existing = await res.json();
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
        activeArrangementBlockFilename = createdBlock.filename;
        if (currentArrangementFilename) arrangementSelectedBlockByArrangement[currentArrangementFilename] = createdBlock.filename;
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
