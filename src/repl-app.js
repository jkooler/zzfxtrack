import '@strudel/repl/index.mjs'; 
import { instruments as staticInstruments, instrumentMonophonic as staticMonophonic } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { exportPattern } from './export-logic.js';
import { buildSong, playZzfxmSong, stopZzfxmSong } from './zzfxm-player.js';
import { attachVisualizer } from './visualizer.js';
import { getAudioContext } from '@strudel/webaudio';
import { initInstrumentUI, getInstrumentsForExporter, updateInstrumentUsage, updateSongSelectionState, refreshInstrumentListUI, setPlaybackInstrumentAliases, clearPlaybackInstrumentAliases } from './instrument-ui.js';
import { setInstrumentScope } from './instrument-manager.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';
import { createIcons, icons } from 'lucide';
import { initTracker, openTracker, openTrackerForEdit, closeTracker, isTrackerOpen, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState, previewTrackerStateOnce, startArrangementPreview, stopArrangementPreview, updateArrangementPreview, isArrangementPreviewPlaying, setArrangementLiveOverride, clearArrangementLiveOverride, clearArrangementLiveOverrides, primePreviewAudioContext, stopTrackerPreviewPlayback, renderArrangementStateForExport } from './tracker.js';
import { initBlocks, openBlocksModal, isBlocksModalOpen, saveBlock, updateBlock } from './blocks.js';
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
    const show = !DEMO_MODE && isDeveloperModeEnabled();
    if (dom.openSongAdvancedSettingsBtn) {
        const shouldShow = show && Boolean(currentSongFilename) && !dom.songNameInput.classList.contains('hidden');
        dom.openSongAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
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
const demoSongModules = import.meta.glob('../songs/*.js', {
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
const demoSongSourceByFile = new Map(
    Object.entries(demoSongModules)
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
let currentSongFilename = null;
let currentSongDisplayName = ''; // Store the display name for restoration
let lastExportedData = null;
let lastExportedMeta = null;
let lastExportedContext = { type: null, filename: null };
let autoSaveTimeout = null; // Debounce timer for auto-save
let isPreviewPlaying = false;
let playingSongFilename = null;
let isStrudelPaused = false; // true after Shift+click stop (pause); next play resumes
let playBtnShiftHover = false; // shift held and mouse over play button (for pause icon)
let pendingExternalUrl = null;
let statusFadeClearTimeout = null;
let renameDebounceTimeout = null;
let pendingUploadBundle = null;
let songEntriesCache = [];
let currentSongScope = 'user';
let currentArrangementFilename = null;
let currentArrangementScope = 'user';
let arrangementEntriesCache = [];
let pendingAdvancedSettingsContext = null;
const UPLOAD_BUNDLE_MANIFEST_NAME = 'strudel-project-bundle.json';
const UPLOAD_BUNDLE_KIND = 'strudel-project-bundle';
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
let trackerAutoSaveTimeout = null;
let pendingTrackerSavePayload = null;
let arrangementDraftState = null;
let blocksLibraryCache = [];
let activeArrangementBlockFilename = null;
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
    songList: document.getElementById('songList'),
    arrangementList: document.getElementById('arrangementList'),
    blocksTab: document.getElementById('blocksTab'),
    newArrangementBtn: document.getElementById('newArrangementBtn'),
    songNameInput: document.getElementById('songNameInput'),
    openSongAdvancedSettingsBtn: document.getElementById('openSongAdvancedSettingsBtn'),
    playBtn: document.getElementById('playBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportBtnLabel: document.getElementById('exportBtnLabel'),
    exportWavBtn: document.getElementById('exportWavBtn'),
    exportWavBtnLabel: document.getElementById('exportWavBtnLabel'),
    newSongBtn: document.getElementById('newSongBtn'),
    statusMsg: document.getElementById('statusMsg'),
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
    
    // Modals
    newSongModal: document.getElementById('newSongModal'),
    newSongName: document.getElementById('newSongName'),
    confirmNewSong: document.getElementById('confirmNewSong'),
    cancelNewSong: document.getElementById('cancelNewSong'),
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
    advancedSettingsExamplesToggle: document.getElementById('advancedSettingsExamplesToggle'),
    closeAdvancedSettingsModalBtn: document.getElementById('closeAdvancedSettingsModalBtn'),
    cancelAdvancedSettingsBtn: document.getElementById('cancelAdvancedSettingsBtn'),
    saveAdvancedSettingsBtn: document.getElementById('saveAdvancedSettingsBtn'),
};

const SONG_FOLDER_STATE_KEY = 'zzfxm-folder-state-songs-v1';
/** Default: user folder open, examples collapsed. User toggles are persisted and restored on next launch. */
let songFolderState = loadFolderState(SONG_FOLDER_STATE_KEY, { user: true, example: false });

function normalizeScope(value) {
    return value === 'example' ? 'example' : 'user';
}

function loadFolderState(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { ...fallback };
        const parsed = JSON.parse(raw);
        return {
            user: typeof parsed?.user === 'boolean' ? parsed.user : fallback.user,
            example: typeof parsed?.example === 'boolean' ? parsed.example : fallback.example,
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

function normalizeSongEntries(payload) {
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

function getSongEntry(filename) {
    return songEntriesCache.find((entry) => entry.filename === filename) || null;
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
                name: typeof item.name === 'string' ? item.name : item.filename.replace(/\.js$/i, ''),
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
    const matchesSong = hasExportedData
        && lastExportedContext.type === 'song'
        && Boolean(currentSongFilename)
        && lastExportedContext.filename === currentSongFilename
        && !isArrangementWorkspaceActive();
    const matchesArrangement = hasExportedData
        && lastExportedContext.type === 'arrangement'
        && Boolean(currentArrangementFilename)
        && lastExportedContext.filename === currentArrangementFilename
        && isArrangementWorkspaceActive();
    const shouldShow = matchesSong || matchesArrangement;

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
        dom.previewJson.innerText = JSON.stringify(songData, null, 2);
    }
    if (reveal) {
        refreshZzfxmPreviewControlsVisibility();
    }
}

function clearZzfxmPreviewData({ placeholder = '// Click GENERATE to create ZzFXM song' } = {}) {
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
        dom.exportBtnLabel.textContent = arrangementMode ? 'Arr. to ZzFXM' : 'Song to ZzFXM';
    }
    if (dom.exportBtn) {
        dom.exportBtn.title = arrangementMode ? 'Export arrangement to ZzFXM JSON' : '';
        dom.exportBtn.classList.toggle('export-arrangement-mode', arrangementMode);
    }
    if (dom.exportWavBtnLabel) {
        dom.exportWavBtnLabel.textContent = arrangementMode ? 'Download WAV' : 'Download WAV';
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
    if (dom.mainFooter) dom.mainFooter.classList.add('hidden');
    dom.playBtn.style.visibility = 'hidden';
    dom.exportBtn.disabled = true;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = true;
    
    updateSongSelectionState(false);
    dom.previewPlayBtn.style.display = 'none';
    dom.previewPlayBtn.disabled = true;
    if(dom.showJsonBtn) {
        dom.showJsonBtn.style.display = 'none';
        dom.showJsonBtn.disabled = true;
    }
    updateAdvancedSettingsButtonsVisibility();
    
    // Clear state
    currentSongFilename = null;
    currentSongScope = 'user';
    currentArrangementFilename = null;
    currentArrangementScope = 'user';
    arrangementDraftState = null;
    activeArrangementBlockFilename = null;
    playingSongFilename = null;
    dom.songNameInput.classList.add('hidden');
    if(dom.repl.editor) dom.repl.editor.stop();
    renderPlayButton();
    updateSongListVisualizer();
    
    // Clear preview
    clearZzfxmPreviewData({ placeholder: '' });

    // No highlight on initial load or when returning to welcome with no song
    dom.sidebarTitle?.classList.remove('active');
    refreshArrangementListActiveState();
    renderArrangementWorkspace();
    updateFooterExportActionLabels();
}

function showIntroduction() {
    // If no song is loaded, the introduction view is also the "empty" state.
    if (!currentSongFilename) {
        showWelcome();
        return;
    }

    undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) dom.mainFooter.classList.add('hidden');
    dom.songNameInput.classList.add('hidden');
    updateAdvancedSettingsButtonsVisibility();

    // Keep controls available so the user can stop playback while reading intro.
    dom.playBtn.style.visibility = 'visible';
    dom.exportBtn.disabled = false;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = false;

    renderPlayButton();
    updateSongListVisualizer();

    // Remove selection highlight from song list when introduction page is selected
    Array.from(dom.songList.querySelectorAll('.song-item')).forEach((li) => li.classList.remove('active'));
    dom.sidebarTitle?.classList.add('active');
    refreshZzfxmPreviewControlsVisibility();
    updateFooterExportActionLabels();
}

function showEditor() {
    undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'flex';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.remove('hidden');
    if (dom.mainFooter) dom.mainFooter.classList.remove('hidden');
    dom.playBtn.style.visibility = 'visible';
    dom.exportBtn.disabled = false;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = false;
    dom.songNameInput.classList.remove('hidden');
    updateSongSelectionState(!!currentSongFilename);
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
    if (dom.mainFooter) dom.mainFooter.classList.remove('hidden');
    dom.sidebarTitle?.classList.remove('active');
    dom.songNameInput.classList.add('hidden');
    updateSongSelectionState(false);
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

// --- Initialization ---
async function init() {
    setStatus('Initializing...', 'normal');
    
    // Disable default samples (TidalCycles/Dirt) to ensure only ZzFX instruments are used
    dom.repl.prelude = `
// Strudel to ZzFXM Environment
// Default samples are disabled.
// Only ZzFX instruments defined in instruments.js are available.
`;
    
    // 1. Initialize Strudel Core
    await initStrudel();
    
    // 2. Load ZzFX Instruments into Strudel Registry
    loadZzFXInstruments(staticInstruments);
    
    // 3. Load Songs List
    await refreshSongList();
    await refreshArrangementList();
    await refreshBlocksLibrary();
    if (DEMO_MODE && dom.newSongBtn) {
        dom.newSongBtn.style.display = 'none';
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
    
    // Clear status - no song loaded yet
    setStatus('');

    // 7. Initialize Icons
    // 7. Initialize Icons
    createIcons({ icons });

    // 8. Sync Theme Colors from CodeMirror to Sidebar
    setTimeout(syncThemeColors, 1000); // Wait for editor render
    
    // 9. Initialize Tracker
    initTrackerWithInstruments();
    setupTrackerEventListeners();
    
    // 10. Initialize Blocks
    initBlocks();
    setupBlocksEventListeners();
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

    // Ensure every static instrument (e.g. cowbell) is in the registry even if missing from
    // localStorage — so reload never unregisters them and songs play without a full page reload.
    for (const [alias, params] of Object.entries(staticInstruments)) {
        if (Array.isArray(params) && map[alias] === undefined) {
            map[alias] = params;
            if (staticMonophonic && staticMonophonic[alias]) monophonicAliases.add(alias);
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
                // Only process if editor is focused and a song is loaded
                if (!currentSongFilename || !view.hasFocus) return;
                
                const currentCode = view.state.doc.toString();
                
                // Check if code actually changed
                if (currentCode !== lastCode) {
                    lastCode = currentCode;
                    
                    // Update indicators in sidebar
                    updateInstrumentUsage(currentCode);
                    
                    if (currentSongScope !== 'example' || isDeveloperModeEnabled()) {
                        // IMMEDIATELY save to localStorage as backup
                        localStorage.setItem(`unsaved_${currentSongFilename}`, currentCode);
                        
                        // Clear existing auto-save timeout
                        if (autoSaveTimeout) {
                            clearTimeout(autoSaveTimeout);
                        }
                        
                        // Set new timeout for 1 second (debounced server save)
                        autoSaveTimeout = setTimeout(() => {
                            saveCurrentSong();
                            // Clear localStorage after successful server save
                            localStorage.removeItem(`unsaved_${currentSongFilename}`);
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
    if (currentSongScope === 'example' && !isDeveloperModeEnabled()) return false;
    return Boolean(autoSaveTimeout && currentSongFilename);
});

registerBeforeUnloadFlusher(() => {
    if (DEMO_MODE) return;
    if (currentSongScope === 'example' && !isDeveloperModeEnabled()) return;
    if (!(autoSaveTimeout && currentSongFilename)) return;

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;

    const editorCode = dom.repl.editor?.code || '';
    const fileCode = editorToFile(editorCode);

    // Use sendBeacon for reliable delivery even as page closes.
    // Note: sendBeacon cannot send custom headers, so for developer mode (which needs a header)
    // we use fetch({ keepalive: true }) instead.
    if (currentSongScope === 'example' && isDeveloperModeEnabled()) {
        fetch(`/api/song/${currentSongFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode,
            keepalive: true,
        }).catch(() => {});
    } else {
        const blob = new Blob([fileCode], { type: 'text/plain' });
        navigator.sendBeacon(`/api/song/${currentSongFilename}`, blob);
    }

    // Also keep in localStorage as backup
    try {
        localStorage.setItem(`unsaved_${currentSongFilename}`, editorCode);
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
            headers: { 'Content-Type': 'application/json' },
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

async function refreshSongList() {
    try {
        const entries = DEMO_MODE
            ? Array.from(demoSongSourceByFile.keys())
                .sort()
                .map((filename) => ({ filename, scope: 'example' }))
            : await (async () => {
                const res = await fetch('/api/songs');
                if (!res.ok) throw new Error('Failed to list songs');
                const payload = await res.json();
                return normalizeSongEntries(payload).sort((a, b) => a.filename.localeCompare(b.filename));
            })();

        songEntriesCache = entries;
        dom.songList.innerHTML = '';

        if (!entries.length) {
            dom.songList.innerHTML = `
                <li class="text-xs text-muted-foreground px-3 py-2">No songs available.</li>
            `;
            updateSongListVisualizer();
            createIcons({ icons });
            return;
        }

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const expanded = isEmpty
                ? true
                : (scope === 'example' ? songFolderState.example : songFolderState.user);
            const folderIcon = expanded ? 'folder-open' : 'folder';
            const highlightIcon = expanded && (scope !== 'user' || items.length > 0);

            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1 border-b border-border/40';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-song-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 ${expanded ? 'fill-current' : 'fill-[var(--secondary)]'} stroke-[var(--card)]"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-song-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-song-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-song-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
                if (scope === 'example') {
                    songFolderState.example = !songFolderState.example;
                } else {
                    songFolderState.user = !songFolderState.user;
                }
                saveFolderState(SONG_FOLDER_STATE_KEY, songFolderState);
                refreshSongList();
            });

            if (items.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'Create a new song to get started.'
                    : 'No example songs available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const file = entry.filename;
                const fileName = decodeURIComponent(file.replace('.js', ''));
                const isExample = normalizeScope(entry.scope) === 'example';
                const devMode = isDeveloperModeEnabled();
                const isImmutable = isExample && !devMode;
                const li = document.createElement('li');
                const isIntroductionVisible = dom.welcomeView?.style?.display === 'flex';
                li.className = `song-item ${file === currentSongFilename && !isIntroductionVisible ? 'active' : ''}`;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = file;

                li.innerHTML = (DEMO_MODE || isImmutable)
                    ? `<span class="font-medium">${fileName}</span>`
                    : `
                        <span class="font-medium">${fileName}</span>
                        <div class="song-item-actions">
                            <button class="sidebar-del-btn" title="Delete ${fileName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    `;

                li.querySelector('span').onclick = (e) => {
                    e.stopPropagation();
                    loadSong(file);
                };
                li.onclick = () => loadSong(file);

                if (!DEMO_MODE && !isImmutable) {
                    li.querySelector('.sidebar-del-btn').onclick = (e) => {
                        e.stopPropagation();
                        showDeleteConfirmation(file);
                    };
                }

                list?.appendChild(li);
            });

            dom.songList.appendChild(folderLi);
        };

        const userEntries = entries.filter((entry) => normalizeScope(entry.scope) !== 'example');
        const exampleEntries = entries.filter((entry) => normalizeScope(entry.scope) === 'example');
        appendFolder('user', 'User', userEntries);
        appendFolder('example', 'Examples (Read only)', exampleEntries);
        
        updateSongListVisualizer();
        createIcons({ icons });
    } catch (e) {
        console.error(e);
        setStatus('Error loading songs', 'error');
    }
}

function isSongListVisible() {
    return Boolean(dom.songList && !dom.songList.classList.contains('hidden'));
}

function isArrangementListVisible() {
    return Boolean(dom.arrangementList && !dom.arrangementList.classList.contains('hidden'));
}

function updateSongListVisualizer() {
    if (!isSongListVisible()) return;

    const playingEntry = songEntriesCache.find((e) => e.filename === playingSongFilename);
    const playingScope = playingEntry ? normalizeScope(playingEntry.scope) : null;
    let visualizerAttached = false;

    // When the playing song's folder is collapsed, show the scope visualizer on the folder row
    const folderRows = Array.from(dom.songList.children).filter((li) =>
        li.querySelector('[data-song-folder]')
    );
    folderRows.forEach((folderLi) => {
        const folderButton = folderLi.querySelector('[data-song-folder]');
        const scope = folderButton?.getAttribute('data-song-folder');
        const itemsUl = folderLi.querySelector('[data-song-folder-items]');
        const isCollapsed = itemsUl?.classList.contains('hidden');
        const isPlayingInThisFolder = playingScope === scope && playingSongFilename;

        if (isCollapsed && isPlayingInThisFolder) {
            let canvas = folderLi.querySelector('canvas.song-visualizer');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'song-visualizer';
                folderLi.classList.add('relative', 'overflow-hidden');
                folderLi.insertBefore(canvas, folderLi.firstChild);
            }
            canvas.width = folderLi.clientWidth;
            canvas.height = folderLi.clientHeight;
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            const canvas = folderLi.querySelector('canvas.song-visualizer');
            if (canvas) canvas.remove();
            folderLi.classList.remove('relative', 'overflow-hidden');
        }
    });

    const listItems = Array.from(dom.songList.querySelectorAll('.song-item'));
    listItems.forEach((li) => {
        const span = li.querySelector('span');
        // Visualizer should track the PLAYING song, not necessarily the selected one
        const isPlayingTarget =
            span &&
            playingSongFilename &&
            span.innerText === decodeURIComponent(playingSongFilename.replace('.js', ''));
        
        let canvas = li.querySelector('canvas.song-visualizer');

        if (isPlayingTarget && !visualizerAttached) {
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'song-visualizer';
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

    let target = null;
    if (isArrangementPreviewPlaying() && currentArrangementFilename) {
        target = Array.from(dom.arrangementList.querySelectorAll('.song-item'))
            .find((item) => item.dataset.filename === currentArrangementFilename) || null;
    }

    Array.from(dom.arrangementList.querySelectorAll('.song-item')).forEach((item) => {
        if (item !== target) {
            item.classList.remove('relative', 'overflow-hidden');
            item.querySelector('canvas.song-visualizer')?.remove();
        }
    });

    if (!target) {
        attachVisualizer(null);
        return;
    }

    target.classList.add('relative', 'overflow-hidden');
    let canvas = target.querySelector('canvas.song-visualizer');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'song-visualizer';
        target.insertBefore(canvas, target.firstChild);
    }
    canvas.width = target.clientWidth;
    canvas.height = target.clientHeight;
    attachVisualizer(canvas);
}

/**
 * Re-apply active highlight to the currently selected song in the sidebar.
 * Used when user switches from introduction view to Songs/Instruments tab.
 */
export function refreshSongListActiveState() {
    if (!currentSongFilename || !dom.songList) return;
    Array.from(dom.songList.querySelectorAll('.song-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === currentSongFilename);
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
        const entries = DEMO_MODE
            ? Array.from(demoArrangementSourceByFile.keys())
                .sort()
                .map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'example' }))
            : await (async () => {
                const res = await fetch('/api/arrangements');
                if (!res.ok) throw new Error('Failed to list arrangements');
                const payload = await res.json();
                return normalizeArrangementEntries(payload).sort((a, b) => a.filename.localeCompare(b.filename));
            })();

        arrangementEntriesCache = entries;
        dom.arrangementList.innerHTML = '';

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1 border-b border-border/40';
            folderLi.innerHTML = `
                <div class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="folder-open" class="w-5 h-5 fill-current stroke-[var(--card)]"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </div>
                <ul class="list-none m-0 p-0 space-y-1 mt-1" data-arrangement-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-arrangement-folder-items="${scope}"]`);

            if (isEmpty) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'Create a new arrangement to get started.'
                    : 'No example arrangements available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const isExample = normalizeScope(entry.scope) === 'example';
                const devMode = isDeveloperModeEnabled();
                const isImmutable = isExample && !devMode;
                const li = document.createElement('li');
                li.className = `song-item ${entry.filename === currentArrangementFilename ? 'active' : ''}`;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = entry.filename;

                li.innerHTML = (DEMO_MODE || isImmutable)
                    ? `<span class="font-medium">${escapeHtml(entry.name || decodeURIComponent(entry.filename.replace(/\.js$/i, '')))}</span>`
                    : `
                        <span class="font-medium">${escapeHtml(entry.name || decodeURIComponent(entry.filename.replace(/\.js$/i, '')))}</span>
                        <div class="song-item-actions">
                            <button class="sidebar-del-btn" title="Delete ${escapeHtml(entry.name || entry.filename)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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

        const userItems = entries.filter((entry) => normalizeScope(entry.scope) === 'user');
        const exampleItems = entries.filter((entry) => normalizeScope(entry.scope) === 'example');
        appendFolder('user', 'User', userItems);
        appendFolder('example', 'Examples', exampleItems);
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
    Array.from(dom.arrangementList.querySelectorAll('.song-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === currentArrangementFilename);
    });
    updateArrangementListScopeVisualizer();
}

async function deleteArrangement(filename) {
    if (!filename || DEMO_MODE) return;
    const scope = normalizeScope(getArrangementEntry(filename)?.scope);
    if (scope === 'example' && !isDeveloperModeEnabled()) {
        setStatus('Example arrangements are immutable', 'normal');
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
        let baseSlug = normalizedBase.toLowerCase();
        let slug = baseSlug;
        let suffix = 1;
        while (existingFilenames.has(`${slug}.js`)) {
            suffix += 1;
            slug = `${baseSlug}-${suffix}`;
        }
        const filename = `${slug}.js`;
        const arrangementState = {
            version: 1,
            name: normalizedBase,
            bpm: 120,
            rows: [{ repeats: 1, blocks: [] }],
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
    } catch (err) {
        console.error('[Arrangements] Create failed:', err);
        setStatus('Failed to create arrangement', 'error');
    }
}

function getArrangementReadonly() {
    return DEMO_MODE || (currentArrangementScope === 'example' && !isDeveloperModeEnabled());
}

function canRecoverUnsavedForScope(scope) {
    const normalizedScope = normalizeScope(scope);
    return normalizedScope !== 'example' || isDeveloperModeEnabled();
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
    return {
        version: 1,
        name: String(value?.name || 'Arrangement').trim() || 'Arrangement',
        bpm: Number.isFinite(Number(value?.bpm)) ? Math.max(20, Math.min(300, Number(value.bpm))) : 120,
        rows: rows.length ? rows.map((row) => ({
            repeats: Number.isFinite(Number(row?.repeats)) ? Math.max(1, Math.min(16, Number(row.repeats))) : 1,
            blocks: Array.isArray(row?.blocks) ? row.blocks.filter(Boolean).map(String) : [],
        })) : [{ repeats: 1, blocks: [] }],
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
            trackerStateByFilename[filename] = block.trackerState;
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
        rows: [{ repeats: 1, blocks: [] }],
    });
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

    const arrangementState = buildArrangementStatePayload();
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
        showSaveStatus('Saved arrangement', 900);
    } catch (err) {
        console.error('[Arrangements] Autosave failed:', err);
        setStatus('Failed to save arrangement', 'error');
    }
}

function scheduleTrackerAutoSave({ filename, trackerState }) {
    if (!filename || !trackerState || DEMO_MODE) return;
    const block = getBlockByFilename(filename);
    if (!block) return;
    if (normalizeScope(block.scope) === 'example' && !isDeveloperModeEnabled()) return;

    const trackerNameInput = document.getElementById('trackerBlockName');
    const trackerOutput = document.getElementById('trackerOutput');
    const nextName = String(trackerNameInput?.value || block.name || filename.replace(/\.js$/i, '')).trim() || block.name || filename.replace(/\.js$/i, '');
    const nextPattern = String(trackerOutput?.value || block.pattern || '').trim();
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
    }
    trackerAutoSaveTimeout = setTimeout(async () => {
        const activePayload = pendingTrackerSavePayload;
        pendingTrackerSavePayload = null;
        trackerAutoSaveTimeout = null;
        if (!activePayload) return;
        try {
            const res = await fetch(`/api/blocks/${encodeURIComponent(activePayload.filename)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: activePayload.name,
                    description: activePayload.description,
                    pattern: activePayload.pattern,
                    trackerState: activePayload.trackerState,
                    scope: activePayload.scope,
                }),
            });
            if (!res.ok) throw new Error('Autosave failed');
            try {
                localStorage.removeItem(`unsaved_block_${activePayload.filename}`);
            } catch (_e) {
                // Ignore storage failures.
            }
            const idx = blocksLibraryCache.findIndex((item) => item.filename === activePayload.filename);
            if (idx !== -1) {
                blocksLibraryCache[idx] = {
                    ...blocksLibraryCache[idx],
                    name: activePayload.name,
                    pattern: activePayload.pattern,
                    trackerState: activePayload.trackerState,
                };
            }
            renderArrangementWorkspace();
            renderTrackerWorkspace();
            void refreshBlocksLibrary();
        } catch (err) {
            console.error('[Tracker] Autosave failed:', err);
            try {
                localStorage.setItem(`unsaved_block_${activePayload.filename}`, JSON.stringify(activePayload.trackerState || {}));
            } catch (_e) {
                // Ignore storage failures.
            }
            setStatus('Failed to autosave block', 'error');
        }
    }, 200);
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
        : blocksLibraryCache.filter((block) => normalizeScope(block.scope) !== 'example');

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
    const handleBlockDrop = ({ filename, fromRowIndex, toRowIndex, copy }, targetRowEl) => {
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
        renderArrangementWorkspace();
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: normalizedTo, addedFilename: filename });
    };

    dom.arrangementWorkspacePane.innerHTML = `
        <div class="h-full flex flex-col gap-4 p-0">
            <div class="flex min-w-0 gap-2 items-center px-3 py-2">
                <button
                    id="arrangementWorkspacePreviewBtn"
                    type="button"
                    class="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border-0 bg-quaternary text-quaternary-foreground hover:bg-quaternary/80 w-10 h-10 p-0 shadow-sm"
                    title="${isPreviewPlaying ? 'Stop arrangement preview' : 'Preview arrangement'}"
                >
                    <i data-lucide="${isPreviewPlaying ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>
                </button>
                <label for="arrangementWorkspaceBpm" class="text-xs font-bold text-muted-foreground uppercase">BPM:</label>
                <input
                    type="number"
                    id="arrangementWorkspaceBpm"
                    min="20"
                    max="300"
                    step="1"
                    value="${arrangementDraftState.bpm}"
                    class="w-16 h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    ${readonly ? 'readonly' : ''}
                >
                <label for="arrangementWorkspaceName" class="text-xs font-bold text-muted-foreground uppercase">Name:</label>
                <input
                    type="text"
                    id="arrangementWorkspaceName"
                    value="${escapeHtml(arrangementDraftState.name)}"
                    placeholder="Arrangement Name"
                    class="min-w-0 flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

            <div class="flex-1 min-h-0 overflow-auto rounded-md p-0 bg-card/30">
                <div class="arr-rows-header">
                    <span class="arr-rows-header-spacer" aria-hidden="true"></span>
                    <span class="arr-rows-header-repeat" title="1 repeat = 16 steps">Repeat</span>
                    <span class="arr-rows-header-blocks" aria-hidden="true">Blocks</span>
                </div>
                <div id="arrangementWorkspaceRows" class="flex flex-col"></div>
            </div>
            <footer class="flex items-center border-t border-border p-3 shrink-0">
                <button
                    id="arrangementWorkspaceAddRowBtn"
                    type="button"
                    class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 ${readonly ? 'opacity-40 cursor-not-allowed' : ''}"
                    ${readonly ? 'disabled' : ''}
                >
                    <i data-lucide="plus" class="w-4 h-4 mr-2"></i> Add Row
                </button>
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
            if (!isDeveloperModeEnabled() || DEMO_MODE) return;
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

    nameInput?.addEventListener('input', () => {
        arrangementDraftState.name = String(nameInput.value || '').trim() || arrangementDraftState.name;
        scheduleArrangementAutoSave();
        emitArrangementStateChanged();
    });
    bpmInput?.addEventListener('input', () => {
        const bpm = parseInt(bpmInput.value || '120', 10);
        arrangementDraftState.bpm = Number.isFinite(bpm) ? Math.max(20, Math.min(300, bpm)) : 120;
        scheduleArrangementAutoSave();
        emitArrangementStateChanged();
    });
    addRowBtn?.addEventListener('click', () => {
        arrangementDraftState.rows.push({ repeats: 1, blocks: [] });
        renderArrangementWorkspace();
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: arrangementDraftState.rows.length - 1 });
    });
    previewBtn?.addEventListener('click', () => {
        if (isArrangementPreviewPlaying()) {
            stopArrangementPreview();
            clearArrangementLiveOverrides({ scheduleUpdate: false });
            document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: false } }));
            return;
        }
        // Stop any other playback (Strudel song, ZzFXM preview, tracker) before starting arrangement preview.
        stopAllPlaybackForSelectionChange();
        document.dispatchEvent(new CustomEvent('arrangements:preview', {
            detail: { arrangement: { name: arrangementDraftState.name, arrangementState: buildArrangementStatePayload() } }
        }));
    });

    if (rowsRoot) {
        arrangementDraftState.rows.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'arr-row';
            rowEl.dataset.rowIndex = String(rowIndex);
            rowEl.addEventListener('dragover', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = isCopyModifier(event) ? 'copy' : 'move';
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
                const isRowDrag = event.dataTransfer.types.includes('application/x-zzfxm-arr-row');
                const fromIndex = isRowDrag ? window.__arrRowDragFromIndex : undefined;
                if (typeof fromIndex === 'number') {
                    if (fromIndex > rowIndex) rowEl.classList.add('arr-row-drop-target-above');
                    else if (fromIndex < rowIndex) rowEl.classList.add('arr-row-drop-target-below');
                } else {
                    rowEl.classList.add('arr-row-drop-target-below');
                }
            });
            rowEl.addEventListener('dragleave', (event) => {
                const related = event.relatedTarget;
                if (related && related instanceof Node && rowEl.contains(related)) return;
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
            });
            rowEl.addEventListener('drop', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
                window.__arrRowDragFromIndex = undefined;
                let rowPayload = null;
                try {
                    rowPayload = JSON.parse(event.dataTransfer.getData('application/x-zzfxm-arr-row') || 'null');
                } catch (_e) {
                    rowPayload = null;
                }
                const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
                if (fromRowIndex != null && fromRowIndex !== rowIndex) {
                    const moved = arrangementDraftState.rows.splice(fromRowIndex, 1)[0];
                    if (moved) {
                        arrangementDraftState.rows.splice(rowIndex, 0, moved);
                        renderArrangementWorkspace();
                        scheduleArrangementAutoSave();
                        emitArrangementStateChanged();
                    }
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
                handleBlockDrop({
                    filename,
                    fromRowIndex: fromRowIndexChip,
                    toRowIndex: rowIndex,
                    copy: isCopyModifier(event),
                }, rowEl);
            });

            const rowNumberEl = document.createElement('span');
            rowNumberEl.className = 'arr-row-number';
            rowNumberEl.setAttribute('aria-label', 'Row ' + (rowIndex + 1) + ' (drag to reorder)');
            if (!readonly) {
                rowNumberEl.draggable = true;
                rowNumberEl.addEventListener('dragstart', (e) => {
                    if (!e.dataTransfer) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-zzfxm-arr-row', JSON.stringify({ fromRowIndex: rowIndex }));
                    window.__arrRowDragFromIndex = rowIndex;
                });
                rowNumberEl.addEventListener('dragend', () => {
                    window.__arrRowDragFromIndex = undefined;
                    rowsRoot.querySelectorAll('.arr-row').forEach((el) => {
                        el.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
                    });
                });
            }
            rowNumberEl.innerHTML = `
                <span class="arr-row-number-value">${rowIndex + 1}</span>
                <i data-lucide="play" class="arr-row-play-icon hidden w-[13px] h-[13px] fill-current"></i>
            `;

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
            duplicateRowBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>';
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
                };
                arrangementDraftState.rows.splice(rowIndex + 1, 0, duplicatedRow);
                renderArrangementWorkspace();
                scheduleArrangementAutoSave();
                emitArrangementStateChanged();
            });

            const removeRowBtn = document.createElement('button');
            removeRowBtn.type = 'button';
            removeRowBtn.className = 'arr-row-del';
            removeRowBtn.title = 'Remove row';
            removeRowBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
            removeRowBtn.disabled = readonly;
            removeRowBtn.classList.toggle('opacity-40', readonly);
            removeRowBtn.classList.toggle('cursor-not-allowed', readonly);
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
                    arrangementDraftState.rows[0] = { repeats: 1, blocks: [] };
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
                            renderArrangementWorkspace();
                            renderTrackerWorkspace();
                        });
                        chip.querySelector('.arr-chip-del')?.addEventListener('click', (event) => {
                            event.stopPropagation();
                            if (readonly) return;
                            const idx = row.blocks.indexOf(filename);
                            if (idx >= 0) row.blocks.splice(idx, 1);
                            if (activeArrangementBlockFilename === filename) {
                                activeArrangementBlockFilename = null;
                            }
                            renderArrangementWorkspace();
                            renderTrackerWorkspace();
                            scheduleArrangementAutoSave();
                            emitArrangementStateChanged();
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
            rowMain.appendChild(rowNumberEl);
            rowMain.appendChild(repeatsEl);
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
}

function updateArrangementWorkspacePreviewButtonState() {
    const previewBtn = dom.arrangementWorkspacePane?.querySelector('#arrangementWorkspacePreviewBtn');
    if (!previewBtn) return;
    const playing = isArrangementPreviewPlaying();
    previewBtn.title = playing ? 'Stop arrangement preview' : 'Preview arrangement';
    previewBtn.innerHTML = `<i data-lucide="${playing ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>`;
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
    const valueEl = rowEl.querySelector('.arr-row-number-value');
    const iconEl = rowEl.querySelector('.arr-row-play-icon');
    valueEl?.classList.toggle('hidden', !!isPlaying);
    iconEl?.classList.toggle('hidden', !isPlaying);
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

async function refreshBlocksLibrary() {
    if (!dom.blocksLibraryList) return;
    try {
        const previousBlocksByFilename = new Map(
            (Array.isArray(blocksLibraryCache) ? blocksLibraryCache : [])
                .filter((block) => block?.filename)
                .map((block) => [block.filename, block])
        );
        const list = DEMO_MODE
            ? Array.from(demoBlockSourceByFile.keys()).map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'example', trackerState: null }))
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
        dom.blocksLibraryList.innerHTML = '';

        if (!blocksLibraryCache.length) {
            dom.blocksLibraryList.innerHTML = '<li class="text-xs text-muted-foreground px-2 py-2">No blocks available.</li>';
            return;
        }

        blocksLibraryCache
            .slice()
            .sort((a, b) => String(a?.name || a?.filename || '').localeCompare(String(b?.name || b?.filename || '')))
            .forEach((block) => {
                const li = document.createElement('li');
                const isSelected = block.filename === activeArrangementBlockFilename;
                li.className = `song-item ${isSelected ? 'active' : ''}`;
                li.dataset.filename = block.filename;
                const isReadonly = normalizeScope(block.scope) === 'example' && !isDeveloperModeEnabled();
                li.innerHTML = `
                    <span class="font-medium text-xs">${escapeHtml(block.name || block.filename.replace(/\.js$/i, ''))}</span>
                    ${isReadonly ? '' : `<div class="song-item-actions"><button class="sidebar-del-btn" title="Delete ${escapeHtml(block.name || block.filename)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`}
                `;
                li.addEventListener('click', async () => {
                    activeArrangementBlockFilename = block.filename;
                    renderArrangementWorkspace();
                    renderTrackerWorkspace();
                });
                li.querySelector('.sidebar-del-btn')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteBlockFromLibrary(block.filename, block.name || block.filename);
                });
                dom.blocksLibraryList.appendChild(li);
            });

        createIcons({ icons });
    } catch (err) {
        console.error('[Blocks] Failed to refresh library:', err);
        dom.blocksLibraryList.innerHTML = '<li class="text-xs text-destructive px-2 py-2">Failed to load block library.</li>';
    }
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
    if (normalizeScope(block?.scope) === 'example' && !isDeveloperModeEnabled()) {
        setStatus('Example blocks are immutable', 'normal');
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

async function loadArrangement(filename) {
    if (!filename) return;
    if (arrangementAutoSaveTimeout) {
        clearTimeout(arrangementAutoSaveTimeout);
        arrangementAutoSaveTimeout = null;
    }

    try {
        // Do not stop playback here: let the arrangement workspace play button stop Strudel (etc.) and start arrangement preview when user presses play.
        const loadedScope = DEMO_MODE ? 'example' : normalizeScope(getArrangementEntry(filename)?.scope);
        const detail = DEMO_MODE
            ? null
            : await fetch(`/api/arrangements/${encodeURIComponent(filename)}`).then((r) => (r.ok ? r.json() : null));
        let arrangementState = cloneArrangementState(detail?.arrangementState || {
            name: decodeURIComponent(filename.replace(/\.js$/i, '')),
            bpm: 120,
            rows: [{ repeats: 1, blocks: [] }],
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
        activeArrangementBlockFilename = null;
        // Keep currentSongFilename so song selection is remembered when switching back to Songs tab.

        refreshArrangementListActiveState();
        await refreshBlocksLibrary();
        renderArrangementWorkspace();
        showArrangementWorkspace();
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

async function loadSong(filename) {
    // IMPORTANT: Clear any pending auto-save from the previous song
    // This prevents saving the new song's content to the old song's file
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    if (renameDebounceTimeout) {
        clearTimeout(renameDebounceTimeout);
        renameDebounceTimeout = null;
    }
    
    try {
        // Do not stop playback here: let the Strudel play button stop arrangement (etc.) and start song when user presses play.
        let fileCode = '';
        const loadedSongScope = DEMO_MODE
            ? 'example'
            : normalizeScope(getSongEntry(filename)?.scope);
        if (DEMO_MODE) {
            fileCode = demoSongSourceByFile.get(filename);
            if (typeof fileCode !== 'string') throw new Error('Song not available in demo bundle');
        } else {
            const res = await fetch(`/api/song/${filename}`);
            if (!res.ok) throw new Error('Failed to load song');
            fileCode = await res.text();
        }
        
        // Transform for Editor
        let editorCode = fileToEditor(fileCode);
        
        // Check if there's an unsaved version in localStorage
        if (loadedSongScope !== 'example' || isDeveloperModeEnabled()) {
            const unsavedCode = localStorage.getItem(`unsaved_${filename}`);
            if (unsavedCode) {
                // Recover from localStorage
                editorCode = unsavedCode;
                setStatus('⚠️ Recovered unsaved changes from cache', 'error');
                setTimeout(() => {
                    // Auto-save the recovered content
                    saveCurrentSong();
                    localStorage.removeItem(`unsaved_${filename}`);
                }, 500);
            }
        }
        
        // Keep currentArrangementFilename and arrangementDraftState so arrangement selection is remembered when switching back to Blocks tab.

        currentSongFilename = filename;
        currentSongScope = loadedSongScope;

        showEditor();
        refreshArrangementListActiveState();
        renderArrangementWorkspace();
        currentSongDisplayName = decodeURIComponent(filename.replace('.js', '')); // Store without extension
        originalSongName = currentSongDisplayName; // Track for rename detection
        dom.songNameInput.value = currentSongDisplayName;
        dom.songNameInput.readOnly = DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled());
        dom.songNameInput.placeholder = '';
        if (dom.openSongAdvancedSettingsBtn) {
            updateAdvancedSettingsButtonsVisibility();
        }
        
        Array.from(dom.songList.querySelectorAll('.song-item')).forEach(li => {
            const isActive = li.dataset.filename === filename;
            li.classList.toggle('active', Boolean(isActive));
        });
        
        updateSongListVisualizer();
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.exportBtn.disabled = false;
        
        // Clear ZzFXM export preview until this song/arrangement is exported again.
        clearZzfxmPreviewData();
        hideSaveStatus();
        
        renderPlayButton(); // Update play button context (Stop vs Play)

        await loadSongMeta(filename);
        
        // Update indicators in sidebar
        updateInstrumentUsage(editorCode);
        updateSongSelectionState(true);

        setStatus('');
    } catch (e) {
        console.error(e);
        setStatus(`Error loading ${filename}`, 'error');
    }
}

async function loadSongMeta(filename) {
    if (DEMO_MODE) return;
    try {
        const res = await fetch(`/api/song-meta/${filename}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.scope === 'string') {
            currentSongScope = normalizeScope(data.scope);
            dom.songNameInput.readOnly = DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled());
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
        console.warn('Failed to load song meta', e);
    }
}

async function saveSongMeta() {
    if (DEMO_MODE) return;
    if (!currentSongFilename) return;
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
            const res = await fetch(`/api/song-meta/${currentSongFilename}`);
            if (res.ok) {
                existing = await res.json();
            }
        } catch (_e) {
            existing = {};
        }
        await fetch(`/api/song-meta/${currentSongFilename}`, {
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
        console.warn('Failed to save song meta', e);
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

async function saveCurrentSong() {
    if (DEMO_MODE) return;
    if (!currentSongFilename) return;
    if (currentSongScope === 'example' && !isDeveloperModeEnabled()) return;
    
    try {
        const editorCode = dom.repl.editor.code;
        const fileCode = editorToFile(editorCode);
        
        const res = await fetch(`/api/song/${currentSongFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode
        });
        
        if (!res.ok) throw new Error('Save failed');
        showSaveStatus('✅ Saved changes');
    } catch (e) {
        console.error(e);
        setStatus('Error saving', 'error');
    }
}

async function createNewSong(name) {
    if (DEMO_MODE) {
        setStatus('Demo mode: creating songs is disabled', 'normal');
        return;
    }
    const normalizedBase = normalizeSongBaseName(name);
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
        const res = await fetch(`/api/song/${name}`, {
            method: 'POST',
            body: template
        });
        
        if (!res.ok) throw new Error('Create failed');
        
        closeModal();
        await refreshSongList();
        await loadSong(name); // loadSong will handle the transform
        
    } catch (e) {
        console.error(e);
        setStatus('Error creating song', 'error');
    }
}

// async function deleteCurrentSong() removed for new custom modal implementation below

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

async function exportCurrentSong(options = {}) {
    const { revealZzfxmPreview = true } = options;
    if (!currentSongFilename) return;
    
    validateCode(dom.repl.editor.code);
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        const confirmed = await confirmDialog({
            title: 'Export With Warnings?',
            message: 'This code uses functions that ZzFXM ignores (for example reverb/delay). Export anyway?',
            confirmLabel: 'Export',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
    }

    setStatus('Exporting...');
    
    try {
        const code = dom.repl.editor.code;
        
        // Save first (good practice)
        await saveCurrentSong();
        
        // Use the live pattern from the scheduler!
        // This avoids file cache issues or import delays.
        const editor = dom.repl.editor;
        
        // Ensure latest code is evaluated, but do not start Strudel playback.
        // Strudel's underlying repl supports a "start" flag (used internally for drawFirstFrame()).
        await editor.repl.evaluate(code, false);
        
        // Get pattern
        const pattern = editor.repl.scheduler.pattern;
        
        if (!pattern) throw new Error('No pattern found. Try playing the song first?');
        
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
            type: 'song',
            filename: currentSongFilename,
            reveal: revealZzfxmPreview,
        });
        
        // 4. Send JSON to server (local mode only)
        const jsonFilename = currentSongFilename.replace('.js', '.json');
        if (!DEMO_MODE) {
            const res = await fetch(`/api/save-exported/${jsonFilename}`, {
                method: 'POST',
                body: JSON.stringify(songData)
            });
            if (!res.ok) throw new Error('Server failed to save JSON');
        }
        
        // Show and enable ZzFXM preview buttons only for explicit ZzFXM export flow.
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
            dom.statusMsg.innerHTML = `${escapeHtml(statusMsg)} • <span style="color:#ff3333">Incompatible sounds: ${escapeHtml(incompatibleList)}</span>`;
            dom.statusMsg.style.color = '#888';
            dom.statusMsg.style.opacity = '1';
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

    if (!msg) {
        dom.statusMsg.style.opacity = '0';
        statusFadeClearTimeout = setTimeout(() => {
            dom.statusMsg.textContent = '';
            statusFadeClearTimeout = null;
        }, 220);
        return;
    }

    dom.statusMsg.innerText = msg;
    dom.statusMsg.style.color = type === 'error' ? '#ff3333' : (type === 'success' ? '#00ff66' : '#888');
    dom.statusMsg.style.opacity = '1';
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

function showSaveStatus(message = '✅ Saved changes', duration = 2000) {
    // Use the saveStatus span for temporary messages
    const saveStatus = document.getElementById('saveStatus');
    if (!saveStatus) return;
    
    saveStatus.innerText = message;
    saveStatus.style.opacity = '1';
    
    setTimeout(() => {
        saveStatus.style.opacity = '0';
    }, duration);
}

function hideSaveStatus() {
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) {
        saveStatus.style.opacity = '0';
    }
}

function normalizeSongBaseName(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

async function updateSongScope(filename, scope) {
    const res = await fetch(`/api/song-meta/${encodeURIComponent(filename)}`);
    const existing = res.ok ? await res.json() : {};
    const updated = { ...(existing || {}), scope: normalizeScope(scope) };
    const writeRes = await fetch(`/api/song-meta/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
    });
    if (!writeRes.ok) throw new Error('Failed to update song scope');
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
    if (dom.advancedSettingsExamplesToggle) {
        dom.advancedSettingsExamplesToggle.checked = pendingAdvancedSettingsContext.scope === 'example';
        dom.advancedSettingsExamplesToggle.disabled = DEMO_MODE;
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
        setStatus('Demo mode: updating example visibility is disabled', 'normal');
        closeAdvancedSettingsModal();
        return;
    }
    const nextScope = dom.advancedSettingsExamplesToggle?.checked ? 'example' : 'user';
    const context = pendingAdvancedSettingsContext;

    try {
        if (context.type === 'song') {
            if (!context.filename) throw new Error('No song selected');
            await updateSongScope(context.filename, nextScope);
            const entry = getSongEntry(context.filename);
            if (entry) entry.scope = nextScope;
                if (context.filename === currentSongFilename) {
                    currentSongScope = nextScope;
                    dom.songNameInput.readOnly = DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled());
                }
            await refreshSongList();
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
    dom.newSongModal.classList.add('open');
    dom.newSongName.focus();
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

async function exportCurrentSongWav() {
    if (!currentSongFilename) return;

    await exportCurrentSong({ revealZzfxmPreview: false });
    if (!lastExportedData) {
        setStatus('WAV export failed: no song data generated.', 'error');
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
        const wavName = currentSongFilename.replace(/\.js$/i, '.wav');
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
        if (!DEMO_MODE) {
            const res = await fetch(`/api/save-exported/${encodeURIComponent(jsonFilename)}`, {
                method: 'POST',
                body: JSON.stringify(songData),
            });
            if (!res.ok) throw new Error('Server failed to save JSON');
        }

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

async function downloadSongsAndInstruments() {
    try {
        const zip = new JSZip();

        let downloadedInstruments = 0;
        const instrumentsContent = await getInstrumentsFileContent();
        if (instrumentsContent) {
            zip.file('instruments.js', instrumentsContent);
            downloadedInstruments = 1;
        }

        const files = DEMO_MODE
            ? Array.from(demoSongSourceByFile.keys()).sort()
            : await (async () => {
                const res = await fetch('/api/songs');
                if (!res.ok) throw new Error('Failed to list songs');
                const payload = await res.json();
                return normalizeSongEntries(payload).map((entry) => entry.filename);
            })();

        let downloadedSongs = 0;
        for (const filename of files) {
            let fileCode = '';
            if (filename === currentSongFilename && dom.repl.editor?.code) {
                fileCode = editorToFile(dom.repl.editor.code);
            } else if (DEMO_MODE) {
                fileCode = demoSongSourceByFile.get(filename) || '';
            } else {
                const res = await fetch(`/api/song/${filename}`);
                if (!res.ok) continue;
                fileCode = await res.text();
            }

            if (!fileCode.trim()) continue;
            zip.file(`songs/${decodeURIComponent(filename)}`, fileCode);
            downloadedSongs++;
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

        if (!downloadedSongs && !downloadedBlocks && !downloadedArrangements && !downloadedInstruments) {
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
                        songs: downloadedSongs,
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
            `Downloaded ZIP: ${downloadedSongs} song${downloadedSongs === 1 ? '' : 's'}, ${downloadedBlocks} block${downloadedBlocks === 1 ? '' : 's'}, ${downloadedArrangements} arrangement${downloadedArrangements === 1 ? '' : 's'}${instrumentsLabel}`,
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

    const songs = new Map();
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

        const songFile = getFilenameFromSection(normalized, 'songs');
        if (songFile) {
            songs.set(songFile, content);
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
        songs: Array.from(songs, ([filename, content]) => ({ filename, content })),
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
    return `${bundle.songs.length} songs, ${bundle.blocks.length} blocks, ${bundle.arrangements.length} arrangements${bundle.instrumentsContent ? ', instruments.js' : ''}`;
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

    const hasAnyData = Boolean(bundle.songs.length || bundle.blocks.length || bundle.arrangements.length || bundle.instrumentsContent);
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
            ['songs', bundle.songs.length],
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

    const songsLookValid = bundle.songs.every((item) => /export\s+default\b/.test(item.content));
    if (!songsLookValid) return 'Incompatible ZIP: songs payload is invalid.';

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
            songs: new Set(Array.from(demoSongSourceByFile.keys(), (f) => f.toLowerCase())),
            blocks: new Set(Array.from(demoBlockSourceByFile.keys(), (f) => f.toLowerCase())),
            arrangements: new Set(Array.from(demoArrangementSourceByFile.keys(), (f) => f.toLowerCase())),
        };
    }

    const [songs, blocks, arrangements] = await Promise.all([
        fetch('/api/songs').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/blocks').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/arrangements').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);

    return {
        songs: new Set(normalizeSongEntries(songs || []).map((entry) => String(entry.filename || '').toLowerCase())),
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
        if (section === 'songs') return demoSongSourceByFile.get(filename) || '';
        if (section === 'blocks') return demoBlockSourceByFile.get(filename) || '';
        if (section === 'arrangements') return demoArrangementSourceByFile.get(filename) || '';
        return '';
    }

    if (section === 'songs') {
        const res = await fetch(`/api/song/${encodeURIComponent(filename)}`);
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
        if (section === 'songs') demoSongSourceByFile.set(filename, content);
        if (section === 'blocks') demoBlockSourceByFile.set(filename, content);
        if (section === 'arrangements') demoArrangementSourceByFile.set(filename, content);
        return true;
    }

    if (section === 'songs') {
        const res = await fetch(`/api/song/${encodeURIComponent(filename)}`, {
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

    const includeSongs = pendingUploadBundle.songs.length > 0;
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

        const songsStats = await importSectionItems('songs', pendingUploadBundle.songs, includeSongs, mode, existing.songs);
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

        await refreshSongList();
        if (instrumentsImported) await reloadInstruments();

        setStatus(
            `Imported songs ${songsStats.written} (renamed ${songsStats.renamed}, skipped ${songsStats.skipped}), blocks ${blocksStats.written} (renamed ${blocksStats.renamed}, skipped ${blocksStats.skipped}), arrangements ${arrangementsStats.written} (renamed ${arrangementsStats.renamed}, skipped ${arrangementsStats.skipped}), instruments ${instrumentsImported}`,
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
    dom.newSongModal.classList.remove('open');
    dom.newSongName.value = '';
}

// --- Event Listeners ---

// Event Listeners ---

dom.exportBtn.addEventListener('click', () => {
    if (isArrangementWorkspaceActive()) {
        exportCurrentArrangement();
        return;
    }
    exportCurrentSong();
});
if (dom.exportWavBtn) {
    dom.exportWavBtn.addEventListener('click', () => {
        if (isArrangementWorkspaceActive()) {
            exportCurrentArrangementWav();
            return;
        }
        exportCurrentSongWav();
    });
}
if (dom.downloadProjectBtn) dom.downloadProjectBtn.addEventListener('click', downloadSongsAndInstruments);
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

dom.sidebarTitle.addEventListener('click', showIntroduction);
dom.newSongBtn.addEventListener('click', openModal);
dom.newArrangementBtn?.addEventListener('click', openNewArrangementModal);
dom.newSidebarBlockBtn?.addEventListener('click', () => {
    void createUntitledBlock();
});
dom.cancelNewSong.addEventListener('click', closeModal);
dom.cancelNewArrangement?.addEventListener('click', closeNewArrangementModal);
if (dom.openSongAdvancedSettingsBtn) {
    dom.openSongAdvancedSettingsBtn.addEventListener('click', () => {
        if (!isDeveloperModeEnabled()) return;
        if (!currentSongFilename) return;
        openAdvancedSettingsModal({
            type: 'song',
            filename: currentSongFilename,
            name: currentSongDisplayName || currentSongFilename.replace(/\.js$/, ''),
            scope: currentSongScope,
        });
    });
}
document.addEventListener('resource-scope:open', (e) => {
    if (!isDeveloperModeEnabled()) return;
    const detail = e?.detail || null;
    if (!detail) return;
    openAdvancedSettingsModal(detail);
});
dom.confirmNewSong.addEventListener('click', () => {
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
});
dom.confirmNewArrangement?.addEventListener('click', () => {
    const name = dom.newArrangementName?.value?.trim() || '';
    if (name) {
        void createNewArrangement(name);
    }
});
document.addEventListener('sidebar:viewChanged', async (e) => {
    const view = e?.detail?.view;
    if (view === 'songs') {
        if (currentSongFilename) {
            showEditor();
        }
        refreshSongListActiveState();
    } else if (view === 'blocks') {
        await refreshArrangementList();
        await refreshBlocksLibrary();
        if (currentArrangementFilename) {
            showArrangementWorkspace();
        } else if (!currentSongFilename) {
            showWelcome();
        }
    } else if (view === 'instruments') {
        // Tie Instruments tab to currently playing source: show that context in the center.
        if (isStrudelPlaybackActive()) {
            showEditor();
        } else if (isArrangementPreviewPlaying()) {
            showArrangementWorkspace();
        } else {
            if (currentSongFilename) showEditor();
            else if (currentArrangementFilename) showArrangementWorkspace();
        }
    }
    updateSongListVisualizer();
    updateArrangementListScopeVisualizer();
});
document.addEventListener('visualizer:ready', () => {
    updateSongListVisualizer();
    updateArrangementListScopeVisualizer();
});
dom.newSongName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
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
let songToDelete = null;

function showDeleteConfirmation(filename) {
    const scope = normalizeScope(getSongEntry(filename)?.scope);
    if (scope === 'example' && !isDeveloperModeEnabled()) {
        setStatus('Example songs cannot be deleted', 'normal');
        return;
    }
    songToDelete = filename;
    dom.deleteConfirmText.innerHTML = `Song: <strong>${decodeURIComponent(filename)}</strong><br>This cannot be undone.`;
    dom.deleteConfirmModal.classList.add('open');
}

function closeDeleteModal() {
    dom.deleteConfirmModal.classList.remove('open');
    songToDelete = null;
}



dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);

// Song Rename Functionality
let originalSongName = '';

// Auto-save rename with debounce
dom.songNameInput.addEventListener('input', () => {
    if (!currentSongFilename) return;
    if (DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled())) return;
    if (renameDebounceTimeout) clearTimeout(renameDebounceTimeout);
    renameDebounceTimeout = setTimeout(() => {
        renameSong({ quiet: true });
    }, 1000);
});

// Save song name immediately when leaving the input
dom.songNameInput.addEventListener('blur', () => {
    if (!currentSongFilename) return;
    if (DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled())) return;
    if (renameDebounceTimeout) {
        clearTimeout(renameDebounceTimeout);
        renameDebounceTimeout = null;
    }
    renameSong({ quiet: true });
});

// Save song name on Enter key
dom.songNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled())) return;
        if (renameDebounceTimeout) {
            clearTimeout(renameDebounceTimeout);
            renameDebounceTimeout = null;
        }
        renameSong();
    }
});

async function renameSong(options = {}) {
    if (DEMO_MODE) return;
    const { quiet = false } = options;
    if (!currentSongFilename) return;
    if (currentSongScope === 'example' && !isDeveloperModeEnabled()) {
        if (!quiet) setStatus('Example songs are immutable', 'normal');
        return;
    }
    
    const rawName = dom.songNameInput.value.trim();
    const newName = normalizeSongBaseName(rawName);
    if (!newName) {
        if (!quiet) {
            setStatus('Invalid name. Use letters, numbers, spaces, hyphens, or underscores.', 'error');
        }
        return;
    }
    if (dom.songNameInput.value !== newName) {
        dom.songNameInput.value = newName;
        if (!quiet && rawName !== newName) {
            setStatus(`Using normalized name: ${newName}`, 'normal');
        }
    }
    if (newName === originalSongName) {
        return;
    }
    
    const newFilename = newName + '.js';
    
    // Check if name already exists
    try {
        const res = await fetch('/api/songs');
        if (!res.ok) throw new Error('Failed to check existing songs');
        const payload = await res.json();
        const files = normalizeSongEntries(payload).map((entry) => entry.filename);
        
        if (files.includes(newFilename) && newFilename !== currentSongFilename) {
            if (!quiet) {
                setStatus('A song with that name already exists', 'error');
            }
            return;
        }
    } catch (e) {
        console.error(e);
        if (!quiet) {
            setStatus('Error checking song names', 'error');
        }
        return;
    }
    
    if (!quiet) {
        setStatus('Renaming...');
    }
    
    try {
        // Rename via API
        const res = await fetch('/api/rename-song', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
            body: JSON.stringify({
                oldName: currentSongFilename,
                newName: newFilename
            })
        });
        
        if (!res.ok) throw new Error('Rename failed');
        
        // Update local state
        const wasPlaying = playingSongFilename === currentSongFilename;
        currentSongFilename = newFilename;
        currentSongDisplayName = newName;
        originalSongName = newName;
        if (wasPlaying) playingSongFilename = newFilename;
        renameDebounceTimeout = null;
        
        // Refresh song list
        await refreshSongList();
        
        if (!quiet) {
            setStatus('Renamed successfully', 'success');
        }
        showSaveStatus('✅ Song renamed');
        
    } catch (e) {
        console.error(e);
        if (!quiet) {
            setStatus('Error renaming song', 'error');
        }
        // Restore original name on error
        dom.songNameInput.value = originalSongName;
    }
}

dom.confirmDeleteBtn.addEventListener('click', async () => {
    if (songToDelete) {
        await deleteSong(songToDelete);
        closeDeleteModal();
    }
});

async function deleteSong(filename) {
    if (DEMO_MODE) {
        setStatus('Demo mode: deleting songs is disabled', 'normal');
        return;
    }
    if (normalizeScope(getSongEntry(filename)?.scope) === 'example' && !isDeveloperModeEnabled()) {
        setStatus('Example songs cannot be deleted', 'normal');
        return;
    }
    setStatus('Deleting...');
    try {
        const res = await fetch(`/api/song/${filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
        if (!res.ok) throw new Error('Delete failed');
        
        if (filename === playingSongFilename) {
             if (dom.repl.editor) dom.repl.editor.stop();
             updatePlayState(false);
        }

        const wasCurrentSong = (filename === currentSongFilename);
        
        if (wasCurrentSong) {
            showWelcome();
        }
        
        await refreshSongList();
        
        // Clear status after a moment if we deleted the current song
        if (wasCurrentSong) {
            setTimeout(() => setStatus(''), 1500);
        } else {
            setStatus('Deleted', 'success');
            setTimeout(() => setStatus(''), 2000);
        }
    } catch (e) {
        console.error(e);
        setStatus('Error deleting song', 'error');
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
        setStatus('Nothing to play. Export to ZzFXM first.', 'error');
        return;
    }
    
    // Stop Strudel playback to avoid overlap
    const editor = dom.repl.editor;
    if (editor && editor.repl.scheduler.started) {
        editor.stop();
        updatePlayState(false);
    }
    
    playZzfxmSong(lastExportedData, getAudioContext(), () => {
        updatePreviewPlayButton(false);
    }, { ...(lastExportedMeta || {}), ...getPlaybackMixSettings() });
    updatePreviewPlayButton(true);
});

function updatePreviewPlayButton(playing) {
    isPreviewPlaying = playing;
    dom.previewPlayBtn.innerHTML = playing ? '<i data-lucide="square" class="w-4 h-4 fill-current"></i>' : '<i data-lucide="play" class="w-4 h-4"></i>';
    dom.previewPlayBtn.style.color = '#eee';
    createIcons({ icons });
}


// Shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (DEMO_MODE) {
            setStatus('Demo mode: save is disabled', 'normal');
        } else {
            saveCurrentSong();
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
    const isPlayingCurrent = isRunning && playingSongFilename === currentSongFilename;
    const shiftPause = e && e.shiftKey;

    if (isPlayingCurrent) {
        if (shiftPause) {
            // Pause playback (resumable with play)
            editor.repl.pause();
            isStrudelPaused = true;
            updatePlayState(false);
        } else {
            // Stop current song
            editor.stop();
            isStrudelPaused = false;
            updatePlayState(false);
        }
        return;
    }

    // Stop any other playback (arrangement preview, ZzFXM, tracker) before starting Strudel.
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
        // Another song is currently running. Switch to selected song and restart
        editor.stop();
        isStrudelPaused = false;
        editor.evaluate();
        updatePlayState(true);
    } else {
        if (isStrudelPaused && playingSongFilename === currentSongFilename) {
            // Resume from pause
            editor.repl.start();
            isStrudelPaused = false;
            updatePlayState(true);
        } else {
            // Start selected song from the beginning
            editor.evaluate();
            updatePlayState(true);
        }
    }
}

function updatePlayState(isPlaying) {
    // Sync visualizer location and playing state context
    if (isPlaying) {
        playingSongFilename = currentSongFilename;
    } else {
        playingSongFilename = null;
    }
    updateSongListVisualizer();
    renderPlayButton();
}

export function isStrudelPlaybackActive() {
    const editor = dom.repl.editor;
    return Boolean(editor && editor.repl && editor.repl.scheduler && editor.repl.scheduler.started);
}

function renderPlayButton() {
    const editor = dom.repl.editor;
    const isRunning = editor && editor.repl.scheduler.started;
    const showStop = isRunning && playingSongFilename === currentSongFilename;
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

// --- JSON Preview Modal Logic ---

function openJsonModal() {
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
    const contextFilename = lastExportedContext?.filename || currentSongFilename || currentArrangementFilename || null;
    const filename = contextFilename
        ? contextFilename.replace(/\.js$/i, '.json')
        : 'song-data.json';
    triggerFileDownload(filename, text, 'application/json;charset=utf-8');
    setStatus(`Downloaded ${filename}`, 'success');
}

// JSON Modal Listeners
if(dom.showJsonBtn) dom.showJsonBtn.addEventListener('click', openJsonModal);
if(dom.closeJsonModalBtn) dom.closeJsonModalBtn.addEventListener('click', closeJsonModal);
if(dom.closeJsonModalBottomBtn) dom.closeJsonModalBottomBtn.addEventListener('click', closeJsonModal);
if(dom.downloadJsonBtn) dom.downloadJsonBtn.addEventListener('click', downloadJsonData);
if(dom.copyJsonBtn) dom.copyJsonBtn.addEventListener('click', copyJsonToClipboard);

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
function openSystemSettingsModal() {
    if (!dom.systemSettingsModal) return;
    if (dom.systemSettingsDevModeToggle) {
        dom.systemSettingsDevModeToggle.checked = isDeveloperModeEnabled();
        dom.systemSettingsDevModeToggle.disabled = DEMO_MODE;
    }
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

document.addEventListener('developer-mode:changed', () => {
    // Immediately update local read-only flags and rerender lists.
    if (dom.songNameInput) {
        dom.songNameInput.readOnly = DEMO_MODE || (currentSongScope === 'example' && !isDeveloperModeEnabled());
    }
    updateAdvancedSettingsButtonsVisibility();
    updateDevModeToolbarLabelVisibility();
    void refreshSongList();
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
            saveSongMeta();
        });
    });
    dom.exportResolutionCustom?.addEventListener('input', () => {
        updateResolutionUi();
        saveSongMeta();
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
        saveSongMeta();
    });

    dom.maxChannelsInput?.addEventListener('input', saveSongMeta);
    dom.normalizeLayers?.addEventListener('change', saveSongMeta);
    const handlePlaybackMixChange = () => {
        const inferred = inferPlaybackPresetId(getPlaybackMixSettings());
        setPlaybackPresetControl(inferred);
        saveSongMeta();
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
    dom.wavSampleRate?.addEventListener('change', saveSongMeta);
    dom.wavBitDepth?.addEventListener('change', saveSongMeta);

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
            // Stop Strudel song and ZzFXM export preview so only tracker preview is heard
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
    
    // Resolve latest block scope/name from API so immutable example safeguards are accurate.
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
        setStatus('⚠️ Recovered unsaved block edits from cache', 'error');
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
            if (!currentSongFilename) return;
            openBlocksModal();
        });

	    // Stop Strudel playback when entering the Blocks modal (avoids confusion with previews/exports).
	    document.addEventListener('blocks:modalOpen', () => {
	        const editor = dom.repl.editor;
	        if (editor && editor.repl.scheduler.started) {
	            editor.stop();
	            updatePlayState(false);
	        }
          document.dispatchEvent(new CustomEvent('blocks:targetSongScope', {
            detail: { scope: currentSongScope }
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
                const songBpm = bpmMatch ? Number(bpmMatch[1]) : 120;
                const factor = songBpm && blockBpm ? (songBpm / blockBpm) : 1;
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
            fetch(`/api/song/${currentSongFilename}`, {
                method: 'POST',
                headers: getDeveloperModeHeaders(),
                body: fileCode
            });
            
            setStatus(`Block "${name}" inserted into song`, 'success');
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

        fetch(`/api/song/${currentSongFilename}`, {
            method: 'POST',
            headers: getDeveloperModeHeaders(),
            body: fileCode
        });

        setStatus(`Arrangement "${arrName}" inserted into song`, 'success');
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

	        previewTrackerStateOnce(trackerState, instrumentList, trackerState.bpm || 120, getPlaybackMixSettings());
	    });

	    // Listen for arrangements:preview event
	    document.addEventListener('arrangements:preview', async (e) => {
	        const { arrangement } = e.detail || {};
	        const arrangementState = arrangement?.arrangementState;
	        if (!arrangementState) return;

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
	                    return Array.isArray(channel) && channel.some(note => note && note !== '~' && note !== '-');
	                });
	            };

	            const trackerStateByFilename = {};
	            const previewBlocks = [];
	            const resolvedFilenames = new Set();
	            let playable = 0;
	            const registerTrackerState = (filename, trackerState) => {
	                if (!filename || !trackerState || trackerStateByFilename[filename]) return;
	                trackerStateByFilename[filename] = trackerState;
	                previewBlocks.push({ filename, trackerState });
	                if (isPlayableTrackerState(trackerState)) playable++;
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
	                arrangementPreviewContext = {
	                    arrangementState,
	                    trackerStateByFilename: { ...trackerStateByFilename },
	                    instrumentList,
	                    bpm,
	                    mixSettings,
	                };
	                clearArrangementLiveOverrides({ scheduleUpdate: false });
	                if (previewBlocks.length) {
	                    document.dispatchEvent(new CustomEvent('arrangements:blocksLoaded', { detail: { blocks: previewBlocks } }));
	                }
	                const started = startArrangementPreview(arrangementState, trackerStateByFilename, instrumentList, bpm, {
	                    keepPosition: false,
	                    mixSettings,
	                });
	                if (!started) {
	                    setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
	                }
	                document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: started } }));
	                return started;
	            };

	            // Start immediately when cached tracker states are available, then hydrate missing blocks in background.
	            if (playable > 0 || missingBlocks.length === 0) {
	                const started = startPreviewWithCurrentStates();
	                if (started && missingBlocks.length) {
	                    fetchMissingBlocks(missingBlocks).then((fetchedBlocks) => {
	                        mergeFetchedBlocks(fetchedBlocks);
	                        if (!isArrangementPreviewPlaying()) return;
	                        if (!fetchedBlocks.length) return;
	                        arrangementPreviewContext = {
	                            ...arrangementPreviewContext,
	                            trackerStateByFilename: { ...trackerStateByFilename },
	                            mixSettings: getPlaybackMixSettings(),
	                        };
	                        if (previewBlocks.length) {
	                            document.dispatchEvent(new CustomEvent('arrangements:blocksLoaded', { detail: { blocks: previewBlocks } }));
	                        }
	                        updateArrangementPreview({
	                            trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
	                            mixSettings: arrangementPreviewContext.mixSettings,
	                            keepPosition: true,
	                        });
	                    }).catch((err) => {
	                        console.warn('[Arranger] Background block hydration failed:', err);
	                    });
	                }
	                return;
	            }

	            if (missingBlocks.length) {
	                const fetchedBlocks = await fetchMissingBlocks(missingBlocks);
	                mergeFetchedBlocks(fetchedBlocks);
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
            if (Number.isInteger(addedRowIndex)) {
                clearArrangementLiveOverride({ rowIndex: addedRowIndex, scheduleUpdate: false });
            }
            if (addedFilename) {
                clearArrangementLiveOverride({ filename: addedFilename, scheduleUpdate: false });
            }
	            updateArrangementPreview({
		                arrangementState,
		                trackerStateByFilename: arrangementPreviewContext.trackerStateByFilename,
		                instrumentList: arrangementPreviewContext.instrumentList,
		                bpm: arrangementPreviewContext.bpm,
	                    mixSettings: arrangementPreviewContext.mixSettings,
		                keepPosition: true,
				            });
                updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
        });

        document.addEventListener('arrangements:blocksLoaded', (e) => {
            const blocks = e?.detail?.blocks || [];
            updateArrangementWorkspaceChipSteps(blocks);
            updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
        });

        document.addEventListener('arrangements:playhead', (e) => {
            const detail = e?.detail || {};
            applyArrangementWorkspacePlayhead(detail);
            updateArrangementPlaybackInstrumentAliases(detail);
            updateArrangementListScopeVisualizer();
        });

        document.addEventListener('arrangements:previewState', (e) => {
            updateArrangementWorkspacePreviewButtonState();
            const playing = e?.detail?.playing ?? isArrangementPreviewPlaying();
            if (!playing) {
                clearArrangementWorkspacePlayheadVisuals();
                clearArrangementPlaybackInstrumentAliases();
                updateArrangementListScopeVisualizer();
                return;
            }
            updateArrangementPlaybackInstrumentAliases(arrangementWorkspacePlayhead);
            updateArrangementListScopeVisualizer();
        });

        document.addEventListener('tracker:stateChanged', (e) => {
            const { filename, trackerState, arrangementInsertRowIndex } = e.detail || {};
            if (!trackerState) return;
            if (filename && (currentArrangementFilename || activeArrangementBlockFilename)) {
                scheduleTrackerAutoSave({ filename, trackerState });
            }

            if (!isArrangementPreviewPlaying()) return;
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
            if (!currentSongFilename) return;
            // Only if not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                openBlocksModal();
            }
        }
    });
}



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

// Start
init();
