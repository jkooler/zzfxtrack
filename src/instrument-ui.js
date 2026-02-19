/**
 * Instrument UI Controller
 * Handles all UI interactions for the instrument editor
 */

import {
    loadInstruments,
    saveInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
    getInstrumentById,
    migrateFromFile,
    needsMigration
} from './instrument-manager.js';
import { playTestNoteDebounced, resumePreviewAudio } from './instrument-preview.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';

import { reloadInstruments, isStrudelPlaybackActive } from './repl-app.js';
import { createIcons, icons } from 'lucide';
import { getInstrumentAnalyser } from './zzfx-loader.js';
import { ScopeVisualizer } from './visualizer.js';

const DEMO_MODE = import.meta.env.MODE === 'demo';

// State
let currentInstrumentId = null;
let currentView = 'songs'; // 'songs' or 'instruments'
let hasSelectedSong = false;
const INSTRUMENT_FOLDER_STATE_KEY = 'zzfxm-folder-state-instruments-v1';
let instrumentFolderState = loadFolderState(INSTRUMENT_FOLDER_STATE_KEY, { user: true, example: true });
const DEVELOPER_MODE_KEY = 'zzfxm-developer-mode';

function isDeveloperModeEnabled() {
    try {
        return localStorage.getItem(DEVELOPER_MODE_KEY) === '1';
    } catch (_e) {
        return false;
    }
}

// DOM Elements
const dom = {
    // Tabs
    songsTab: document.getElementById('songsTab'),
    instrumentsTab: document.getElementById('instrumentsTab'),
    
    // Lists
    songList: document.getElementById('songList'),
    instrumentList: document.getElementById('instrumentList'),
    
    // Buttons
    newSongBtn: document.getElementById('newSongBtn'),
    newInstrumentBtn: document.getElementById('newInstrumentBtn'),
    downloadProjectBtn: document.getElementById('downloadProjectBtn'),
    instrumentControls: document.getElementById('instrumentControls'),
    usedInstrumentsOnly: document.getElementById('usedInstrumentsOnly'),
    
    // Drawer
    instrumentDrawer: document.getElementById('instrumentDrawer'),
    drawerTitle: document.getElementById('drawerTitle'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    testInstrumentBtn: document.getElementById('testInstrumentBtn'),
    
    // Drawer Inputs
    instExportName: document.getElementById('instExportName'),
    instStrudelAlias: document.getElementById('instStrudelAlias'),
    instChannel: document.getElementById('instChannel'),
    instMonophonic: document.getElementById('instMonophonic'),
    openInstrumentAdvancedSettingsBtn: document.getElementById('openInstrumentAdvancedSettingsBtn'),
    
    // Modals
    newInstrumentModal: document.getElementById('newInstrumentModal'),
    newInstrumentName: document.getElementById('newInstrumentName'),
    confirmNewInstrument: document.getElementById('confirmNewInstrument'),
    cancelNewInstrument: document.getElementById('cancelNewInstrument'),
    
    deleteInstrumentModal: document.getElementById('deleteInstrumentModal'),
    deleteInstrumentText: document.getElementById('deleteInstrumentText'),
    confirmDeleteInstrument: document.getElementById('confirmDeleteInstrument'),
    cancelDeleteInstrument: document.getElementById('cancelDeleteInstrument'),

    // Sync UI
    initOverlay: document.getElementById('initOverlay'),
    instrumentSyncModal: document.getElementById('instrumentSyncModal'),
    syncLocalList: document.getElementById('syncLocalList'),
    syncFileList: document.getElementById('syncFileList'),
    syncKeepLocalBtn: document.getElementById('syncKeepLocalBtn'),
    syncLoadFileBtn: document.getElementById('syncLoadFileBtn'),

    // Import ZzFX
    importZzFXInput: document.getElementById('importZzFXInput'),
    importZzFXBtn: document.getElementById('importZzFXBtn'),
    importConfirmationModal: document.getElementById('importConfirmationModal'),
    confirmImportBtn: document.getElementById('confirmImportBtn'),
    cancelImportBtn: document.getElementById('cancelImportBtn'),
};

// Get all parameter inputs (0-20)
const paramInputs = [];
for (let i = 0; i <= 20; i++) {
    paramInputs[i] = document.getElementById(`param${i}`);
}

function normalizeScope(value) {
    return value === 'example' ? 'example' : 'user';
}

function getWaveShapeLabel(params) {
    const shapeValue = Number(Array.isArray(params) ? params[6] : 0);
    const shapeIndex = Number.isFinite(shapeValue) ? Math.max(0, Math.min(5, Math.round(shapeValue))) : 0;
    const labels = ['sine', 'tri', 'saw', 'tan', 'noise', 'square'];
    return labels[shapeIndex] || 'sine';
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

/**
 * Initialize instrument UI
 */
export async function initInstrumentUI() {
    console.log('[InstrumentUI] Initializing...');

    showInitOverlay();

    // Setup event listeners
    setupEventListeners();

    // Set initial view state
    switchView('songs');

    // Resolve initial sync (local vs file)
    await syncInstrumentSources();
    
    // Normalize existing aliases in localStorage
    normalizeLocalInstruments();

    // Render instrument list
    renderInstrumentList();
    if (dom.openInstrumentAdvancedSettingsBtn) {
        dom.openInstrumentAdvancedSettingsBtn.classList.add('dev-only-hidden');
    }

    hideInitOverlay();

    console.log('[InstrumentUI] Initialized');
}

export function refreshInstrumentListUI() {
    renderInstrumentList();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Tab switching
    dom.songsTab.addEventListener('click', () => switchView('songs'));
    dom.instrumentsTab.addEventListener('click', () => switchView('instruments'));

    // Instrument Controls
    if (dom.usedInstrumentsOnly) {
        dom.usedInstrumentsOnly.addEventListener('change', () => {
            renderInstrumentList();
        });
    }

    // Listen for instrument triggers (highlighting)
    if (typeof window !== 'undefined') {
        window.addEventListener('strudel:instrument-trigger', (e) => {
            const { id, duration } = e.detail;
            const li = dom.instrumentList.querySelector(`li[data-alias="${id}"]`);
            if (li) {
                li.classList.add('playing');
                
                if (li._playingTimeout) clearTimeout(li._playingTimeout);
                
                // Keep highlighted for duration, but at least 100ms for visibility
                const flashDuration = Math.max(duration * 1000, 100);
                
                li._playingTimeout = setTimeout(() => {
                    li.classList.remove('playing');
                    li._playingTimeout = null;
                }, flashDuration);
            }
        });
    }
    
    // New instrument
    dom.newInstrumentBtn.addEventListener('click', openNewInstrumentModal);
    dom.cancelNewInstrument.addEventListener('click', closeNewInstrumentModal);
    dom.confirmNewInstrument.addEventListener('click', handleCreateInstrument);
    dom.newInstrumentName.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        handleCreateInstrument();
    });
    
    // Delete instrument
    dom.cancelDeleteInstrument.addEventListener('click', closeDeleteInstrumentModal);
    dom.confirmDeleteInstrument.addEventListener('click', handleDeleteInstrument);

    // Import ZzFX
    if(dom.importZzFXBtn) dom.importZzFXBtn.addEventListener('click', handleImportZzFX);
    if(dom.confirmImportBtn) dom.confirmImportBtn.addEventListener('click', handleConfirmImport);
    if(dom.cancelImportBtn) dom.cancelImportBtn.addEventListener('click', closeImportModal);
    
    // Drawer
    dom.closeDrawerBtn.addEventListener('click', closeDrawer);
    dom.testInstrumentBtn.addEventListener('click', handleTestInstrument);
    if (dom.openInstrumentAdvancedSettingsBtn) {
        dom.openInstrumentAdvancedSettingsBtn.addEventListener('click', () => {
            if (!isDeveloperModeEnabled() || DEMO_MODE) return;
            const instrument = currentInstrumentId ? getInstrumentById(currentInstrumentId) : null;
            if (!instrument) return;
            document.dispatchEvent(new CustomEvent('resource-scope:open', {
                detail: {
                    type: 'instrument',
                    id: instrument.id,
                    name: instrument.strudelAlias,
                    scope: normalizeScope(instrument.scope),
                }
            }));
        });
    }
    
    // Drawer inputs - auto-save and preview on change
    dom.instExportName.addEventListener('input', handleDrawerChange);
    dom.instStrudelAlias.addEventListener('input', handleDrawerChange);
    
    // Parameter inputs - debounced preview
    paramInputs.forEach((input, index) => {
        if (input) {
            input.addEventListener('input', () => handleParamChange(index));
            setupScrubInteraction(input);
        }
    });
    
    // Parameter ordering toggle
    setupParameterOrdering();

    document.addEventListener('resource-scope:changed', (e) => {
        if (e?.detail?.type !== 'instrument') return;
        renderInstrumentList();
        if (currentInstrumentId) {
            openDrawer(currentInstrumentId);
        }
    });

    document.addEventListener('developer-mode:changed', () => {
        renderInstrumentList();
        if (currentInstrumentId) {
            openDrawer(currentInstrumentId);
        }
        if (!isDeveloperModeEnabled() && dom.openInstrumentAdvancedSettingsBtn) {
            dom.openInstrumentAdvancedSettingsBtn.classList.add('dev-only-hidden');
        }
    });
}

function showInitOverlay() {
    if (dom.initOverlay) {
        dom.initOverlay.classList.add('active');
    }
}

function hideInitOverlay() {
    if (dom.initOverlay) {
        dom.initOverlay.classList.remove('active');
    }
}

function getInstrumentDisplayName(instrument) {
    return instrument?.strudelAlias || instrument?.exportName || 'unnamed';
}

function sanitizeExportName(value) {
    let safe = String(value || '');
    safe = safe.replace(/[^a-zA-Z0-9_$]/g, '_');
    if (/^[0-9]/.test(safe)) safe = `_${safe}`;
    return safe || 'UNTITLED';
}

function sanitizeStrudelAlias(value) {
    let safe = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!safe) safe = 'untitled';
    if (/^[0-9]/.test(safe)) safe = `z-${safe}`;
    return safe;
}

function parseMonophonicFlag(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    }
    return fallback;
}

function normalizeLocalInstruments() {
    const instruments = loadInstruments();
    let didChange = false;

    const normalized = instruments.map((inst) => {
        const safeAlias = sanitizeStrudelAlias(inst.strudelAlias);
        const safeExport = generateExportName(safeAlias);
        const updated = { ...inst };

        if (safeAlias !== inst.strudelAlias) {
            updated.strudelAlias = safeAlias;
            didChange = true;
        }
        if (safeExport !== inst.exportName) {
            updated.exportName = safeExport;
            didChange = true;
        }
        const normalizedMono = parseMonophonicFlag(updated.monophonic, false);
        if (updated.monophonic !== normalizedMono) {
            updated.monophonic = normalizedMono;
            didChange = true;
        }
        return updated;
    });

    if (didChange) {
        saveInstruments(normalized);
        autoUpdateInstrumentsFile();
        reloadInstruments();
    }
}

function getFingerprint(instruments = []) {
    return JSON.stringify(
        instruments
            .map((inst) => ({
                name: getInstrumentDisplayName(inst),
                params: Array.isArray(inst.params) ? inst.params : [],
                monophonic: parseMonophonicFlag(inst.monophonic, false)
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    );
}

async function fetchServerInstruments() {
    try {
        const response = await fetch('/api/instruments', { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (e) {
        console.warn('[InstrumentUI] Could not fetch instruments from server:', e);
        return null;
    }
}

function buildServerInstrumentList(serverData) {
    const list = [];
    const instruments = serverData?.instruments || {};
    const monophonicMap = serverData?.instrumentMonophonic || {};

    const readMonophonic = (alias) => {
        const raw =
            monophonicMap?.[alias] ??
            monophonicMap?.[String(alias).toLowerCase()] ??
            monophonicMap?.[String(alias).toUpperCase()];
        return parseMonophonicFlag(raw, false);
    };

    if (serverData?.instrumentMapping) {
        Object.entries(serverData.instrumentMapping).forEach(([alias]) => {
            let params = instruments?.[alias];
            if (!params) {
                const aliasUpper = alias.toUpperCase();
                const aliasLower = alias.toLowerCase();
                params = instruments?.[aliasUpper] || instruments?.[aliasLower];
            }
            if (Array.isArray(params)) {
                list.push({
                    strudelAlias: alias,
                    params,
                    monophonic: readMonophonic(alias)
                });
            }
        });
        return list;
    }

    Object.entries(instruments).forEach(([alias, params]) => {
        if (Array.isArray(params)) {
            list.push({
                strudelAlias: alias,
                params,
                monophonic: readMonophonic(alias)
            });
        }
    });

    return list;
}

function renderSyncList(listEl, names, highlightSet, paramConflictSet, monophonicConflictSet) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!names.length) {
        const li = document.createElement('li');
        li.textContent = '(empty)';
        listEl.appendChild(li);
        return;
    }

    names.forEach((name) => {
        const li = document.createElement('li');
        if (paramConflictSet?.has(name)) {
            li.textContent = `${name} (Parameter conflict)`;
        } else if (monophonicConflictSet?.has(name)) {
            li.textContent = `${name} (Monophonic conflict)`;
        } else {
            li.textContent = name;
        }
        li.classList.add('sync-list-item');
        if (highlightSet?.has(name)) {
            li.classList.add('highlight');
        }
        listEl.appendChild(li);
    });
}

function showSyncModal(localInstruments, fileInstruments) {
    if (!dom.instrumentSyncModal) {
        return Promise.resolve('local');
    }

    const localNames = localInstruments.map(getInstrumentDisplayName).sort();
    const fileNames = fileInstruments.map(getInstrumentDisplayName).sort();
    const localSet = new Set(localNames);
    const fileSet = new Set(fileNames);
    const localOnly = new Set(localNames.filter((name) => !fileSet.has(name)));
    const fileOnly = new Set(fileNames.filter((name) => !localSet.has(name)));

    const localParamMap = new Map();
    const fileParamMap = new Map();
    const localMonoMap = new Map();
    const fileMonoMap = new Map();

    localInstruments.forEach((inst) => {
        const name = getInstrumentDisplayName(inst);
        const params = Array.isArray(inst.params) ? inst.params : [];
        localParamMap.set(name, JSON.stringify(params));
        localMonoMap.set(name, parseMonophonicFlag(inst.monophonic, false));
    });
    fileInstruments.forEach((inst) => {
        const name = getInstrumentDisplayName(inst);
        const params = Array.isArray(inst.params) ? inst.params : [];
        fileParamMap.set(name, JSON.stringify(params));
        fileMonoMap.set(name, parseMonophonicFlag(inst.monophonic, false));
    });

    const paramConflicts = new Set();
    localNames.forEach((name) => {
        if (fileParamMap.has(name) && localParamMap.get(name) !== fileParamMap.get(name)) {
            paramConflicts.add(name);
        }
    });

    const monophonicConflicts = new Set();
    localNames.forEach((name) => {
        if (fileMonoMap.has(name) && localMonoMap.get(name) !== fileMonoMap.get(name)) {
            monophonicConflicts.add(name);
        }
    });

    const localHighlight = new Set([...localOnly, ...paramConflicts, ...monophonicConflicts]);
    const fileHighlight = new Set([...fileOnly, ...paramConflicts, ...monophonicConflicts]);

    renderSyncList(dom.syncLocalList, localNames, localHighlight, paramConflicts, monophonicConflicts);
    renderSyncList(dom.syncFileList, fileNames, fileHighlight, paramConflicts, monophonicConflicts);

    dom.instrumentSyncModal.classList.add('open');

    return new Promise((resolve) => {
        const handleLocal = () => {
            cleanup();
            resolve('local');
        };
        const handleFile = () => {
            cleanup();
            resolve('file');
        };
        const cleanup = () => {
            dom.instrumentSyncModal.classList.remove('open');
            dom.syncKeepLocalBtn?.removeEventListener('click', handleLocal);
            dom.syncLoadFileBtn?.removeEventListener('click', handleFile);
        };

        dom.syncKeepLocalBtn?.addEventListener('click', handleLocal);
        dom.syncLoadFileBtn?.addEventListener('click', handleFile);
    });
}

async function syncInstrumentSources() {
    const localInstruments = loadInstruments();
    const serverData = await fetchServerInstruments();

    if (!serverData) {
        if (needsMigration()) {
            console.log('[InstrumentUI] Migration needed, importing from instruments.js');
            try {
                const cacheBust = `?t=${Date.now()}`;
                const {
                    instruments: instrumentsObj,
                    instrumentMapping,
                    instrumentMonophonic
                } = await import(`../instruments.js${cacheBust}`);
                migrateFromFile({ instruments: instrumentsObj, instrumentMapping, instrumentMonophonic });
            } catch (e) {
                console.error('[InstrumentUI] Migration failed:', e);
            }
        }
        return;
    }

    const fileInstruments = buildServerInstrumentList(serverData);
    const localFingerprint = getFingerprint(localInstruments);
    const fileFingerprint = getFingerprint(fileInstruments);

    if (localFingerprint === fileFingerprint) {
        if (fileInstruments.length > 0 || localInstruments.length > 0) {
            migrateFromFile(serverData);
        }
        return;
    }

    if (localInstruments.length === 0 && fileInstruments.length > 0) {
        migrateFromFile(serverData);
        return;
    }

    hideInitOverlay();
    const choice = await showSyncModal(localInstruments, fileInstruments);

    if (choice === 'file') {
        migrateFromFile(serverData);
    } else {
        await autoUpdateInstrumentsFile();
    }
}

/**
 * Setup parameter ordering toggle
 */
function setupParameterOrdering() {
    // Add toggle checkbox to drawer header
    const drawerContent = document.querySelector('.instrument-drawer-content');
    if (!drawerContent) return;
    
    const paramGroup = drawerContent.querySelector('.param-group');
    if (!paramGroup) return;
    
    // Create toggle UI
    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #333;';
    toggleContainer.innerHTML = `
        <h4 style="margin: 0;">Parameters</h4>
        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #888; cursor: pointer;">
            <input type="checkbox" id="arrayOrderToggle" style="cursor: pointer;" />
            <span>Array Order</span>
        </label>
    `;
    
    // Insert at the beginning of param-group
    const existingH4 = paramGroup.querySelector('h4');
    if (existingH4) {
        existingH4.replaceWith(toggleContainer);
    } else {
        paramGroup.insertBefore(toggleContainer, paramGroup.firstChild);
    }
    
    // Get toggle checkbox
    const toggle = document.getElementById('arrayOrderToggle');
    if (!toggle) return;
    
    // Reorganize parameters on toggle
    toggle.addEventListener('change', () => {
        reorganizeParameters(toggle.checked);
    });
    
    // Initial organization (musician-friendly)
    reorganizeParameters(false);
}

/**
 * Reorganize parameters based on ordering mode
 */
function reorganizeParameters(useArrayOrder) {
    // Target specifically the param-group in the content area, not the header
    const paramGroup = document.querySelector('.instrument-drawer-content .param-group');
    if (!paramGroup) return;
    
    // Parameter groups and ordering
    const musicianOrder = {
        'General': [6, [0, 7], 2, [1, 20]],
        'Envelope (ADSR)': [3, 18, 4, 17, 5],
        'Effects': [[13, 15, 16]],
        'LFO (Volume)': [[19, 12]],
        'Pitch': [[8, 9], [10, 11], 14]
    };
    
    const paramLabels = {
        0: 'Volume', 1: 'Randomness', 2: 'Frequency (Hz)', 3: 'Attack (s)',
        4: 'Sustain (s)', 5: 'Release (s)', 6: 'Wave Shape', 7: 'Shape Curve',
        8: 'Slide (Hz/s)', 9: 'Delta Slide', 10: 'Pitch Jump (Hz)',
        11: 'Pitch Jump Time (s)', 12: 'Repeat Time (s)', 13: 'Noise (detune)',
        14: 'Modulation (Hz)', 15: 'Bit Crush', 16: 'Delay (s)',
        17: 'Sustain Volume', 18: 'Decay', 19: 'Tremolo', 20: 'Filter (Hz)'
    };

    const musicianLabels = {
        ...paramLabels,
        1: 'Rand.', 7: 'Sh. Curve', 8: 'Slide', 10: 'Pitch Jump',
        11: 'P.J. Time', 12: 'Rep. Time', 13: 'Noise', 15: 'BitCr', 16: 'Delay'
    };
    
    const paramHints = {
        6: '0=sine, 1=tri, 2=saw, 3=tan, 4=noise, 5=square'
    };
    
    // Cleanup inputs from previous custom modes to restore clean state
    paramInputs.forEach(input => {
        if (!input) return;
        
        if (input._originalClass) {
            input.className = input._originalClass;
        } else {
            input.classList.remove('multislider-input');
        }
        input.style.display = ''; // Reset visibility
        
        // Remove slider sync listeners
        if (input._sliderSyncHandler) {
            input.removeEventListener('input', input._sliderSyncHandler);
            delete input._sliderSyncHandler;
        }
        
        // Remove wave shape sync listeners
        if (input._waveSyncHandler) {
             input.removeEventListener('input', input._waveSyncHandler);
             delete input._waveSyncHandler;
        }
    });
    
    // Clear existing params (keep toggle)
    const toggle = paramGroup.querySelector('#arrayOrderToggle')?.parentElement?.parentElement;
    Array.from(paramGroup.children).forEach(child => {
        if (child !== toggle) {
            child.remove();
        }
    });
    
    if (useArrayOrder) {
        // Array order (0-20)
        for (let i = 0; i <= 20; i++) {
            const field = createParamField(i, `${i}: ${paramLabels[i]}`, paramHints[i], true);
            paramGroup.appendChild(field);
        }
        createIcons({ icons });
    } else {
        // Musician-friendly order with groups
        Object.entries(musicianOrder).forEach(([groupName, indices]) => {
            const groupHeader = document.createElement('h4');
            groupHeader.textContent = groupName;
            groupHeader.className = 'param-group-header';
            paramGroup.appendChild(groupHeader);

            // Instrument-level settings: placed between "General" and the Wave Shape UI.
            if (groupName === 'General') {
                const monoField = document.createElement('div');
                // Avoid `.param-field label { ... }` global rule overriding our flex alignment.
                monoField.className = 'flex flex-col gap-2';

                const checkbox = ensureMonophonicControl();
                const row = document.createElement('div');
                row.className = 'flex flex-row items-center gap-3 h-8';

                const label = document.createElement('label');
                label.className = 'flex items-center h-4 text-sm font-medium leading-4 text-foreground select-none';
                label.setAttribute('for', 'instMonophonic');
                label.textContent = 'Monophonic';

                row.appendChild(checkbox);
                row.appendChild(label);
                monoField.appendChild(row);
                paramGroup.appendChild(monoField);
            }
            
            if (groupName === 'Envelope (ADSR)') {
                // Multislider Container
                const container = document.createElement('div');
                container.className = 'multislider-container';
                
                // Define sliders: A(3), D(18), S(4), R(5)
                const sliders = [
                   { idx: 3, label: 'Atk', max: 3, defaultValue: 0.01 },
                   { idx: 18, label: 'Dec', max: 3, defaultValue: 1 },
                   { idx: 4, label: 'Sus', max: 5, defaultValue: 0 },
                   { idx: 5, label: 'Rel', max: 5, defaultValue: 0 }
                ];
                
                sliders.forEach(({ idx, label, max, defaultValue }) => {
                    const input = paramInputs[idx];
                    
                    // Create Slider UI
                    const track = document.createElement('div');
                    track.className = 'multislider-track';
                    
                    const range = document.createElement('input');
                    range.type = 'range';
                    range.className = 'multislider-range';
                    range.setAttribute('orient', 'vertical'); // Firefox legacy support
                    range.min = 0;
                    range.max = max;
                    range.step = 0.01;
                    range.title = ''; // Suppress native tooltip
                    
                    const labelEl = document.createElement('div');
                    labelEl.className = 'multislider-label group';
                    labelEl.innerHTML = `
                        <span class="multislider-label-text">${label}</span>
                        <span class="multislider-label-icon">
                          <i data-lucide="refresh-ccw" class="w-3 h-3"></i>
                        </span>
                    `;
                    
                    // Reset on click
                    labelEl.addEventListener('click', () => {
                        input.value = defaultValue;
                        input.dispatchEvent(new Event('input'));
                    });
                    
                    // Logic to sync
                    const updateSlider = () => {
                        const val = parseFloat(input.value) || 0;
                        range.value = val;
                    };
                    
                    // Initial sync
                    updateSlider();
                    
                    // Slider -> Input
                    range.addEventListener('input', () => {
                        input.value = range.value;
                        // Trigger change for preview
                        input.dispatchEvent(new Event('input'));
                    });
                    
                    // Input -> Slider (Cleanup old listener)
                    if (input._sliderSyncHandler) {
                        input.removeEventListener('input', input._sliderSyncHandler);
                    }
                    input._sliderSyncHandler = updateSlider;
                    input.addEventListener('input', updateSlider);
                    
                    // Input styling override
                    if (!input._originalClass) input._originalClass = input.className;
                    input.className = 'multislider-input'; // Reset classes
                    
                    track.appendChild(range);
                    track.appendChild(input);
                    track.appendChild(labelEl);
                    container.appendChild(track);
                });
                
                paramGroup.appendChild(container);

                // Add separate Sustain Volume (17)
                const volIdx = 17;
                const field = createParamField(volIdx, paramLabels[volIdx], paramHints[volIdx], false);
                paramGroup.appendChild(field);
                
            } else {
                indices.forEach(item => {
                    if (Array.isArray(item)) {
                        const row = document.createElement('div');
                        row.className = 'flex gap-3';
                        item.forEach(i => {
                         const field = createParamField(i, musicianLabels[i], paramHints[i], false);
                         field.className += ' flex-1 min-w-0';
                         row.appendChild(field);
                     });
                        paramGroup.appendChild(row);
                        return;
                    }

                    const i = item;
                    if (i === 6) {
                        // Custom Wave Shape UI
                        const container = document.createElement('div');
                        container.className = 'param-field space-y-1.5 py-1';
                        
                        const label = document.createElement('label');
                        label.className = 'param-label';
                        label.textContent = paramLabels[i];
                        container.appendChild(label);
                        
                        const toggleGroup = document.createElement('div');
                        toggleGroup.className = 'flex w-full items-center rounded-md h-10';
                        
                        const options = [
                             { val: 0, label: 'Sin' },
                             { val: 1, label: 'Tri' },
                             { val: 2, label: 'Saw' },
                             { val: 3, label: 'Tan' },
                             { val: 4, label: 'N' },
                             { val: 5, label: 'Sq' }
                        ];
                        
                        const input = paramInputs[i];
                        
                        const updateActive = () => {
                             const currentVal = parseInt(input.value) || 0;
                             toggleGroup.querySelectorAll('button').forEach(btn => {
                                 const btnVal = parseInt(btn.dataset.value);
                                 if (btnVal === currentVal) {
                                     btn.className = 'flex-1 h-full text-sm font-medium rounded-md bg-input-bg border border-border text-foreground shadow-sm transition-all';
                                 } else {
                                     btn.className = 'flex-1 h-full text-sm font-medium rounded-md border border-card text-muted-foreground hover:text-foreground hover:bg-background/50 transition-all';
                                 }
                             });
                        };
                        
                        options.forEach(opt => {
                             const btn = document.createElement('button');
                             btn.dataset.value = opt.val;
                             btn.textContent = opt.label;
                             btn.addEventListener('click', () => {
                                 input.value = opt.val;
                                 input.dispatchEvent(new Event('input'));
                             });
                             toggleGroup.appendChild(btn);
                        });
                        
                        // Sync listener cleanup
                        if (input._waveSyncHandler) input.removeEventListener('input', input._waveSyncHandler);
                        input._waveSyncHandler = updateActive;
                        input.addEventListener('input', updateActive);
                        
                        updateActive();
                        
                        container.appendChild(toggleGroup);
                        container.appendChild(input);
                        input.style.display = 'none';
                        
                        paramGroup.appendChild(container);
                        
                    } else {
                        const field = createParamField(i, musicianLabels[i], paramHints[i], false);
                        paramGroup.appendChild(field);
                    }
                });
            }
        });
    }
    
    // Ensure icons render for everything
    createIcons({ icons });
}

/**
 * Create a parameter field element
 */
function createParamField(index, label, hint, showIndex) {
    const field = document.createElement('div');
    field.className = 'param-field flex flex-col gap-2';
    
    // Header (Label + Reset)
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-2';
    
    const labelEl = document.createElement('label');
    labelEl.className = 'text-sm font-medium leading-none text-foreground';
    labelEl.textContent = label;
    header.appendChild(labelEl);
    
    const defaults = [0.2, 0, 440, 0.01, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0];
    
    // Add reset buttons (exclude ADSR sliders 3,4,5,18 UNLESS in Array Order)
    if (![3, 4, 5, 18].includes(index) || showIndex) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'h-4 w-4 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors opacity-70 hover:opacity-100';
        resetBtn.innerHTML = '<i data-lucide="refresh-ccw" class="w-3 h-3"></i>';
        resetBtn.title = 'Reset to default';
        resetBtn.addEventListener('click', () => {
             const input = paramInputs[index];
             if (input) {
                 input.value = defaults[index];
                 input.dispatchEvent(new Event('input'));
             }
        });
        header.appendChild(resetBtn);
    }
    field.appendChild(header);
    
    const input = paramInputs[index];
    if (input) {
        if (index === 2) {
            // Frequency Note Selector
            const wrapper = document.createElement('div');
            wrapper.className = 'flex items-center gap-2';
            
            // Layout adjust
            if (input._originalClass) input.className = input._originalClass;
            input.classList.remove('w-full');
            input.classList.add('flex-1');
            input.classList.add('min-w-0');
            
            wrapper.appendChild(input);
            
            const noteSelect = document.createElement('select');
            noteSelect.className = 'h-8 rounded-md border border-input bg-muted px-1 py-1 text-xs shadow-sm font-mono w-14 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
            
            // Populate notes C0 (12) to B8 (119)
            const notes = ['C', 'c#', 'D', 'd#', 'E', 'F', 'f#', 'G', 'g#', 'A', 'a#', 'B'];
            for (let m = 12; m <= 119; m++) {
                 const noteName = notes[m % 12];
                 const octave = Math.floor(m / 12) - 1;
                 const fullNote = `${noteName}${octave}`;
                 const freq = 440 * Math.pow(2, (m - 69) / 12);
                 
                 const option = document.createElement('option');
                 option.value = freq.toFixed(2);
                 option.textContent = fullNote;
                 noteSelect.appendChild(option);
            }
            
            // Sync Select -> Input
            noteSelect.addEventListener('change', () => {
                input.value = noteSelect.value;
                input.dispatchEvent(new Event('input'));
            });
            
            // Sync Input -> Select
            const syncSelect = () => {
                const currentFreq = parseFloat(input.value);
                if (isNaN(currentFreq)) return;
                
                let minDiff = Infinity;
                let closestVal = '';
                
                 Array.from(noteSelect.options).forEach(opt => {
                     const optFreq = parseFloat(opt.value);
                     const diff = Math.abs(currentFreq - optFreq);
                     if (diff < minDiff) {
                         minDiff = diff;
                         closestVal = opt.value;
                     }
                 });
                 noteSelect.value = closestVal;
            };
            
            // Prev Button
            const prevBtn = document.createElement('button');
            prevBtn.className = 'h-8 w-6 flex items-center justify-center rounded-md border border-input bg-muted hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
            prevBtn.innerHTML = '<i data-lucide="chevron-left" class="w-4 h-4"></i>';
            prevBtn.addEventListener('click', () => {
                if (noteSelect.selectedIndex > 0) {
                    noteSelect.selectedIndex--;
                    noteSelect.dispatchEvent(new Event('change'));
                }
            });

            // Next Button
            const nextBtn = document.createElement('button');
            nextBtn.className = 'h-8 w-6 flex items-center justify-center rounded-md border border-input bg-muted hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
            nextBtn.innerHTML = '<i data-lucide="chevron-right" class="w-4 h-4"></i>';
            nextBtn.addEventListener('click', () => {
                 if (noteSelect.selectedIndex < noteSelect.options.length - 1) {
                     noteSelect.selectedIndex++;
                     noteSelect.dispatchEvent(new Event('change'));
                 }
            });

            // Cleanup and Attach Sync
            if (input._noteSyncHandler) {
                input.removeEventListener('input', input._noteSyncHandler);
            }
            input._noteSyncHandler = syncSelect;
            input.addEventListener('input', syncSelect);
            
            // Initial sync
            syncSelect();
            
            wrapper.appendChild(prevBtn);
            wrapper.appendChild(noteSelect);
            wrapper.appendChild(nextBtn);
            field.appendChild(wrapper);
            
        } else {
            // Restore input class in case it was modified
            if (input._originalClass) input.className = input._originalClass;
            field.appendChild(input);
        }
        
        if (hint || showIndex) {
            const hintEl = document.createElement('div');
            hintEl.className = 'param-hint text-xs text-muted-foreground';
            hintEl.textContent = hint ? `Index ${index} • ${hint}` : `Index ${index}`;
            field.appendChild(hintEl);
        }
    }
    
    return field;
}

/**
 * Refresh visibility of instrument-specific controls (like 'Used in song' checkbox)
 */
function refreshInstrumentControlsVisibility() {
    if (!dom.instrumentControls) return;
    
    // Only show if we are in instruments view AND a song is actually selected/loaded
    if (currentView === 'instruments' && hasSelectedSong) {
        dom.instrumentControls.classList.remove('hidden');
    } else {
        dom.instrumentControls.classList.add('hidden');
    }
}

/**
 * Handle song selection state from main app
 */
export function updateSongSelectionState(isLoaded) {
    hasSelectedSong = isLoaded;
    refreshInstrumentControlsVisibility();
}

/**
 * Switch between songs and instruments view
 */
function switchView(view) {
    currentView = view;
    
    if (view === 'songs') {
        dom.songsTab.classList.add('active');
        dom.instrumentsTab.classList.remove('active');
        
        dom.songList.classList.remove('hidden');
        dom.instrumentList.classList.add('hidden');
        dom.instrumentList.classList.remove('active');
        
        // Show Song stuff
        dom.newSongBtn.classList.remove('hidden');
        dom.newSongBtn.classList.add('inline-flex');
        
        dom.newInstrumentBtn.classList.add('hidden');
        dom.newInstrumentBtn.classList.remove('inline-flex');
        
    } else {
        dom.songsTab.classList.remove('active');
        dom.instrumentsTab.classList.add('active');
        
        dom.songList.classList.add('hidden');
        dom.instrumentList.classList.remove('hidden');
        dom.instrumentList.classList.add('active');
        
        // Show Instrument stuff
        dom.newSongBtn.classList.add('hidden');
        dom.newSongBtn.classList.remove('inline-flex');
        
        dom.newInstrumentBtn.classList.remove('hidden');
        dom.newInstrumentBtn.classList.add('inline-flex');
        
    }
    
    refreshInstrumentControlsVisibility();
    
    createIcons({ icons });
}

/**
 * Render instrument list
 */

let activeVisualizers = [];

function renderInstrumentList() {
    // Cleanup old visualizers
    activeVisualizers.forEach(v => v.attach(null));
    activeVisualizers = [];

    const instruments = loadInstruments();
    dom.instrumentList.innerHTML = '';
    const devMode = isDeveloperModeEnabled();
    
    const filterUsed = dom.usedInstrumentsOnly && dom.usedInstrumentsOnly.checked;
    
    // Reverse order so newest (highest channel) appears first
    const filtered = [...instruments].reverse().filter((inst) => {
        if (!filterUsed || !lastKnownCode) return true;
        const regex = new RegExp(`["']${inst.strudelAlias}["']|\\b${inst.strudelAlias}\\b`, 'g');
        return regex.test(lastKnownCode);
    });
    const userInstruments = filtered.filter((inst) => normalizeScope(inst.scope) === 'user');
    const exampleInstruments = filtered.filter((inst) => normalizeScope(inst.scope) === 'example');

    const appendFolder = (scope, label, items) => {
        const folderItem = document.createElement('li');
        folderItem.className = 'mt-1 pb-1 border-b border-border/40';

        const isEmpty = items.length === 0;
        const expanded = isEmpty
            ? true
            : (scope === 'example' ? instrumentFolderState.example : instrumentFolderState.user);
        const icon = expanded ? 'folder-open' : 'folder';
        const highlightIcon = expanded && (scope !== 'user' || items.length > 0);

        folderItem.innerHTML = `
            <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-folder-scope="${scope}">
                <span class="inline-flex items-center gap-1.5">
                    <i data-lucide="${icon}" class="w-4 h-4 ${highlightIcon ? 'text-primary' : ''}"></i>
                    ${label}
                </span>
                <span class="opacity-70">${items.length}</span>
            </button>
            <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-folder-items="${scope}"></ul>
        `;

        const button = folderItem.querySelector(`[data-folder-scope="${scope}"]`);
        const list = folderItem.querySelector(`[data-folder-items="${scope}"]`);
        button?.addEventListener('click', () => {
            if (isEmpty) return;
            if (scope === 'example') {
                instrumentFolderState.example = !instrumentFolderState.example;
            } else {
                instrumentFolderState.user = !instrumentFolderState.user;
            }
            saveFolderState(INSTRUMENT_FOLDER_STATE_KEY, instrumentFolderState);
            renderInstrumentList();
        });

        if (items.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'text-xs text-muted-foreground px-2 py-1';
            empty.textContent = scope === 'user'
                ? 'Create one to get started.'
                : 'No example instruments available.';
            list?.appendChild(empty);
        }

        items.forEach((inst) => {
            const instScope = normalizeScope(inst.scope);
            const isExample = instScope === 'example';
            const isImmutable = isExample && !devMode;
            const waveShapeLabel = getWaveShapeLabel(inst.params);

            const li = document.createElement('li');
            li.className = `instrument-item ${inst.id === currentInstrumentId ? 'active' : ''}`;
            li.draggable = !isExample;
            li.dataset.instrumentId = inst.id;
            li.dataset.alias = inst.strudelAlias;
            li.dataset.scope = instScope;

            li.innerHTML = `
                <div class="usage-indicator absolute top-2 right-2 w-1 h-1 rounded-full bg-white hidden opacity-40"></div>
                <div class="instrument-info" style="cursor: ${isExample ? 'pointer' : 'move'}; display: flex; align-items: center; gap: 8px;">
                    <canvas class="instrument-scope w-8 h-8 rounded bg-black/20 border border-border/20 hidden md:block opacity-50 transition-opacity" width="64" height="64"></canvas>
                    <div class="min-w-0">
                        <div class="instrument-name truncate max-w-[120px] group-hover:text-primary transition-colors">${inst.strudelAlias}</div>
                        <div class="instrument-channel text-[9px] uppercase tracking-wide opacity-50">${waveShapeLabel} • CH: ${inst.channel}</div>
                    </div>
                </div>
                <div class="song-item-actions">
                    ${isImmutable ? '' : `<button class="sidebar-del-btn" title="Delete ${inst.strudelAlias}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
                </div>
            `;

            const canvas = li.querySelector('canvas');
            if (canvas) {
                const analyser = getInstrumentAnalyser(inst.strudelAlias);
                if (analyser) {
                    const viz = new ScopeVisualizer(analyser);
                    viz.attach(canvas);
                    activeVisualizers.push(viz);
                }
            }

            li.querySelector('.instrument-info').addEventListener('click', () => {
                openDrawer(inst.id);
                playTestNoteDebounced(inst.params, null, 0);
            });

            const deleteBtn = li.querySelector('.sidebar-del-btn');
            deleteBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteInstrumentConfirmation(inst.id);
            });

            if (!isExample) {
                li.addEventListener('dragstart', handleDragStart);
                li.addEventListener('dragover', handleDragOver);
                li.addEventListener('dragleave', handleDragLeave);
                li.addEventListener('drop', handleDrop);
                li.addEventListener('dragend', handleDragEnd);
            }

            list?.appendChild(li);
        });

        dom.instrumentList.appendChild(folderItem);
    };

    appendFolder('user', 'User', userInstruments);
    appendFolder('example', 'Examples', exampleInstruments);
    
    createIcons({ icons });

    // Refresh usage indicators (dots)
    updateInstrumentUsage();
}

let lastKnownCode = '';

/**
 * Update instrument usage indicators based on song code
 */
export function updateInstrumentUsage(code) {
    if (code !== undefined) {
        lastKnownCode = code;
    }
    
    if (!lastKnownCode) return;
    
    // Get all instrument items
    const items = dom.instrumentList.querySelectorAll('.instrument-item');
    
    items.forEach(item => {
        const alias = item.dataset.alias;
        if (!alias) return;
        
        // Check if alias is used in code
        // We look for the alias in quotes or as a separate word
        // Regex \b (word boundary) is tricky with escapes
        const regex = new RegExp(`["']${alias}["']|\\b${alias}\\b`, 'g');
        const isUsed = regex.test(lastKnownCode);
        
        const indicator = item.querySelector('.usage-indicator');
        if (indicator) {
            if (isUsed) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    });
}


// Drag and drop state
let draggedElement = null;

/**
 * Handle drag start
 */
function handleDragStart(e) {
    draggedElement = e.currentTarget;
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    if (draggedElement !== target) {
        // Reorder is limited to user-scoped instruments.
        const items = Array.from(dom.instrumentList.querySelectorAll('.instrument-item[data-scope="user"]'));
        const draggedIndex = items.indexOf(draggedElement);
        const targetIndex = items.indexOf(target);
        if (draggedIndex === -1 || targetIndex === -1) return false;
        
        // Clear both borders first
        target.style.borderTop = '';
        target.style.borderBottom = '';
        
        // Show indicator on the appropriate side based on drag direction
        if (draggedIndex < targetIndex) {
            // Dragging down - show indicator on bottom
            target.style.borderBottom = '2px solid #00ff88';
        } else {
            // Dragging up - show indicator on top
            target.style.borderTop = '2px solid #00ff88';
        }
    }
    
    return false;
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
    e.currentTarget.style.borderTop = '';
    e.currentTarget.style.borderBottom = '';
}



/**
 * Handle drop
 */
function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const target = e.currentTarget;
    target.style.borderTop = '';
    
    if (draggedElement !== target) {
        // Get instrument IDs
        const draggedId = draggedElement.dataset.instrumentId;
        const targetId = target.dataset.instrumentId;
        
        // Get all instruments
        const instruments = loadInstruments();

        const examples = instruments.filter((inst) => normalizeScope(inst.scope) === 'example');
        const users = instruments.filter((inst) => normalizeScope(inst.scope) !== 'example');
        const displayedUsers = [...users].reverse();
        const draggedIndex = displayedUsers.findIndex((inst) => inst.id === draggedId);
        const targetIndex = displayedUsers.findIndex((inst) => inst.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return false;

        const [moved] = displayedUsers.splice(draggedIndex, 1);
        displayedUsers.splice(targetIndex, 0, moved);
        const reorderedUsers = [...displayedUsers].reverse();
        const reordered = [...examples, ...reorderedUsers];
        reordered.forEach((inst, index) => {
            inst.channel = index;
        });

        import('./instrument-manager.js').then(({ saveInstruments }) => {
            saveInstruments(reordered);
            renderInstrumentList();
            autoUpdateInstrumentsFile();
            reloadInstruments(); // Reload instruments into Strudel
            console.log('[InstrumentUI] Reordered user instruments');
        });
    }
    
    return false;
}

/**
 * Handle drag end
 */
function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    
    // Remove all border highlights
    document.querySelectorAll('.instrument-item').forEach(item => {
        item.style.borderTop = '';
        item.style.borderBottom = '';
    });
}

/**
 * Open drawer to edit instrument
 */
function openDrawer(instrumentId) {
    const instrument = getInstrumentById(instrumentId);
    if (!instrument) return;
    const isExample = normalizeScope(instrument.scope) === 'example';
    const isImmutable = isExample && !isDeveloperModeEnabled();
    
    currentInstrumentId = instrumentId;
    
    // Populate fields
    dom.drawerTitle.textContent = `Edit: ${instrument.strudelAlias}`;
    dom.instExportName.value = instrument.exportName;
    dom.instStrudelAlias.value = instrument.strudelAlias;
    dom.instChannel.value = instrument.channel;
    dom.instStrudelAlias.readOnly = isImmutable;
    dom.instStrudelAlias.classList.toggle('opacity-60', isImmutable);
    dom.instStrudelAlias.classList.toggle('cursor-not-allowed', isImmutable);
    if (dom.instMonophonic) {
        dom.instMonophonic.checked = Boolean(instrument.monophonic);
        dom.instMonophonic.disabled = isImmutable;
    }

    // Populate parameters
    instrument.params.forEach((value, index) => {
        if (paramInputs[index]) {
            paramInputs[index].value = value;
            paramInputs[index].disabled = isImmutable;
        }
    });
    if (dom.openInstrumentAdvancedSettingsBtn) {
        const shouldShow = !DEMO_MODE && isDeveloperModeEnabled();
        dom.openInstrumentAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
    }
    
    // Show drawer
    dom.instrumentDrawer.classList.add('active');
    
    // Update active state in list
    renderInstrumentList();
    
    // Resume audio context (needed for user interaction)
    resumePreviewAudio();

    // Refresh parameters UI (especially important for Multislider sync)
    const toggle = document.getElementById('arrayOrderToggle');
    reorganizeParameters(toggle ? toggle.checked : false);
}

/**
 * Close drawer
 */
function closeDrawer() {
    dom.instrumentDrawer.classList.remove('active');
    currentInstrumentId = null;
    if (dom.openInstrumentAdvancedSettingsBtn) {
        dom.openInstrumentAdvancedSettingsBtn.classList.add('dev-only-hidden');
    }
    renderInstrumentList();
}

/**
 * Handle drawer field changes (Strudel alias)
 * Auto-generates export name from alias
 */
function handleDrawerChange() {
    if (!currentInstrumentId) return;
    const current = getInstrumentById(currentInstrumentId);
    if (current && normalizeScope(current.scope) === 'example' && !isDeveloperModeEnabled()) return;
    
    const rawAlias = dom.instStrudelAlias.value;
    const strudelAlias = sanitizeStrudelAlias(rawAlias);
    if (rawAlias !== strudelAlias) {
        dom.instStrudelAlias.value = strudelAlias;
    }
    const exportName = generateExportName(strudelAlias);
    
    // Update the display of the auto-generated export name
    dom.instExportName.value = exportName;
    
    const changes = {
        exportName: exportName,
        strudelAlias: strudelAlias
    };
    
    updateInstrument(currentInstrumentId, changes);
    renderInstrumentList();
    autoUpdateInstrumentsFile();
    reloadInstruments(); // Reload instruments into Strudel
}

function handleMonophonicChange() {
    if (!currentInstrumentId) return;
    const current = getInstrumentById(currentInstrumentId);
    if (current && normalizeScope(current.scope) === 'example' && !isDeveloperModeEnabled()) return;
    updateInstrument(currentInstrumentId, { monophonic: Boolean(dom.instMonophonic.checked) });
    renderInstrumentList();
    autoUpdateInstrumentsFile();
    reloadInstruments(); // Reload instruments into Strudel
}

function ensureMonophonicControl() {
    const existing = document.getElementById('instMonophonic');
    if (existing) {
        dom.instMonophonic = existing;
        if (!existing._monoListenerAttached) {
            existing.addEventListener('change', handleMonophonicChange);
            existing._monoListenerAttached = true;
        }
        if (currentInstrumentId) {
            const inst = getInstrumentById(currentInstrumentId);
            if (inst) existing.checked = Boolean(inst.monophonic);
        }
        return existing;
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'instMonophonic';
    checkbox.className = 'w-4 h-4 rounded border-border bg-input-bg text-primary focus:ring-primary focus:ring-offset-background';
    checkbox.title = 'If enabled, new notes will cut previous notes for this instrument';
    checkbox.addEventListener('change', handleMonophonicChange);
    checkbox._monoListenerAttached = true;

    dom.instMonophonic = checkbox;

    if (currentInstrumentId) {
        const inst = getInstrumentById(currentInstrumentId);
        if (inst) checkbox.checked = Boolean(inst.monophonic);
    }

    return checkbox;
}

/**
 * Handle parameter input changes
 */
function handleParamChange(paramIndex) {
    if (!currentInstrumentId) return;
    
    const instrument = getInstrumentById(currentInstrumentId);
    if (!instrument) return;
    if (normalizeScope(instrument.scope) === 'example' && !isDeveloperModeEnabled()) return;
    
    // Update parameter
    const newParams = [...instrument.params];
    newParams[paramIndex] = parseFloat(paramInputs[paramIndex].value) || 0;
    
    updateInstrument(currentInstrumentId, { params: newParams });
    autoUpdateInstrumentsFile();
    reloadInstruments(); // Reload instruments into Strudel
    
    // Play test note (debounced) if Strudel isn't currently playing
    if (!isStrudelPlaybackActive()) {
        playTestNoteDebounced(newParams);
    }
}

/**
 * Handle test button click
 */
function handleTestInstrument() {
    if (!currentInstrumentId) return;
    
    const instrument = getInstrumentById(currentInstrumentId);
    if (!instrument) return;
    
    // Play immediately (no debounce), using instrument's own frequency
    playTestNoteDebounced(instrument.params, null, 0);
}

/**
 * Open new instrument modal
 */
function openNewInstrumentModal() {
    dom.newInstrumentModal.classList.add('open');
    dom.newInstrumentName.focus();
}

/**
 * Close new instrument modal
 */
function closeNewInstrumentModal() {
    dom.newInstrumentModal.classList.remove('open');
    dom.newInstrumentName.value = '';
}

/**
 * Generate export name from instrument name
 * e.g., "bass" -> "zzfxm-bass", "fart-01-smelly" -> "zzfxm-fart-01-smelly"
 */
function generateExportName(instrumentName) {
    const safeName = sanitizeExportName(instrumentName);
    return `zzfxm_${safeName}`;
}

/**
 * Handle create new instrument
 */
function handleCreateInstrument() {
    const instrumentName = dom.newInstrumentName.value.trim();
    
    if (!instrumentName) {
        alert('Please provide an instrument name');
        return;
    }
    
    // The name IS the Strudel alias
    const strudelAlias = sanitizeStrudelAlias(instrumentName);
    // Auto-generate export name with zzfxm- prefix
    const exportName = generateExportName(strudelAlias);
    
    const instruments = loadInstruments();
    const channel = instruments.length; // Auto-assign next channel
    
    const newInst = createInstrument(exportName, strudelAlias, channel);
    
    closeNewInstrumentModal();
    renderInstrumentList();
    autoUpdateInstrumentsFile();
    reloadInstruments(); // Reload instruments into Strudel
    
    // Open drawer to edit
    openDrawer(newInst.id);
}

/**
 * Show delete confirmation modal
 */
let instrumentToDelete = null;

function showDeleteInstrumentConfirmation(instrumentId) {
    const instrument = getInstrumentById(instrumentId);
    if (!instrument) return;
    if (normalizeScope(instrument.scope) === 'example' && !isDeveloperModeEnabled()) {
        alert('Example instruments cannot be deleted.');
        return;
    }
    
    instrumentToDelete = instrumentId;
    dom.deleteInstrumentText.innerHTML = `Instrument: <strong>${instrument.exportName}</strong><br>This action is irreversible.`;
    dom.deleteInstrumentModal.classList.add('open');
}

/**
 * Close delete confirmation modal
 */
function closeDeleteInstrumentModal() {
    dom.deleteInstrumentModal.classList.remove('open');
    instrumentToDelete = null;
}

/**
 * Handle delete instrument
 */
function handleDeleteInstrument() {
    if (!instrumentToDelete) return;
    
    const deleted = deleteInstrument(instrumentToDelete);
    if (!deleted) {
        alert('Example instruments cannot be deleted.');
        closeDeleteInstrumentModal();
        return;
    }
    
    if (instrumentToDelete === currentInstrumentId) {
        closeDrawer();
    }
    
    closeDeleteInstrumentModal();
    renderInstrumentList();
    autoUpdateInstrumentsFile();
    reloadInstruments(); // Reload instruments into Strudel
}

/**
 * Handle Import ZzFX button click
 */
let pendingImportParams = null;

function handleImportZzFX() {
    const inputVal = dom.importZzFXInput.value.trim();
    if (!inputVal) return;

    // Parse params
    // Example: .5,.05,140,0,.02,.28,3,1.4,30,98,477,0,0,1,172,0,0,.9,.13,0,-1403
    // Remove brackets if any, split by comma
    const cleanStr = inputVal.replace(/[\[\]]/g, '');
    const parts = cleanStr.split(',').map(s => s.trim()).filter(s => s !== '');
    
    // Validate
    if (parts.length === 0) {
        alert('Invalid format. Please paste comma-separated numbers.');
        return;
    }

    const params = parts.map(p => parseFloat(p));
    if (params.some(isNaN)) {
        alert('Invalid data. Some values are not numbers.');
        return;
    }

    // Store for confirmation
    pendingImportParams = params;
    
    // Show confirmation modal
    dom.importConfirmationModal.classList.add('open');
}

function closeImportModal() {
    dom.importConfirmationModal.classList.remove('open');
    pendingImportParams = null;
}

function handleConfirmImport() {
    if (!pendingImportParams || !currentInstrumentId) {
        closeImportModal();
        return;
    }

    // Pad array with zeros if shorter than 21 (optional, but good for safety)
    // or just rely on updateInstrument handling it. 
    // ZzFX params can be variable length, but our UI expects up to index 20 (21 items).
    // Let's ensure it has at least enough items for the standard ZzFXMicro.
    
    // Update instrument
    updateInstrument(currentInstrumentId, { params: pendingImportParams });
    
    // Update inputs in drawer
    const instrument = getInstrumentById(currentInstrumentId);
    if (instrument) {
        instrument.params.forEach((value, index) => {
            if (paramInputs[index]) {
                paramInputs[index].value = value !== undefined ? value : 0;
            }
        });
    }

    autoUpdateInstrumentsFile();
    reloadInstruments();
    
    // Visual feedback
    console.log('[InstrumentUI] Imported ZzFX params:', pendingImportParams);
    
    // Clear input
    dom.importZzFXInput.value = '';
    
    closeImportModal();
    
    // Play test note
    playTestNoteDebounced(pendingImportParams, null, 0);
}

/**
 * Get current instruments for exporter
 * Called by repl-app.js when exporting
 */
export async function getInstrumentsForExporter() {
    const { getInstrumentMapping, getInstrumentArray, getMonophonicArray } = await import('./instrument-manager.js');
    return {
        mapping: getInstrumentMapping(),
        array: getInstrumentArray(),
        monophonicByIndex: getMonophonicArray()
    };
}
/**
 * Enable drag-to-change (scrub) interaction on an input
 */
export function setupScrubInteraction(input) {
    if (input._scrubInitialized) return;
    input._scrubInitialized = true;
    
    input.classList.add('scrub-input');
    
    let startY = 0;
    let startValue = 0;
    let isDragging = false;
    
    const onMouseDown = (e) => {
        // Only left click
        if (e.button !== 0) return;
        
        // Allow normal interaction if focusing (don't prevent default yet)
        startY = e.clientY;
        startValue = parseFloat(input.value) || 0;
        isDragging = false;
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        
        // Prevent text selection cursor flicker
        document.body.classList.add('scrubbing');
    };
    
    const onMouseMove = (e) => {
        // Threshold to start dragging (3px) to distinguish from simple click-to-focus
        const deltaY = startY - e.clientY;
        if (!isDragging && Math.abs(deltaY) < 3) return;
        
        if (!isDragging) {
            isDragging = true;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        }
        
        e.preventDefault();
        
        // Determine step size
        let step = parseFloat(input.step);
        if (isNaN(step)) {
            step = input.value.includes('.') ? 0.01 : 1;
        }
        
        // Modifiers
        const sensitivity = e.shiftKey ? 0.1 : 1.0;
        
        // Scale: 1px = 1 step is often too fast for small ranges (like 0-1) but fine if step is 0.01
        // Actually, for ZzFX where range is 0-1 and step is 0.01, 100px = full range. That feels right.
        // For Frequency (0-2000), step might be 1? 2000px drag is long. 
        // Maybe dynamic scaling? No, simple strict "pixels * step" is standard and predictable.
        
        let newValue = startValue + (deltaY * step * sensitivity);
        
        // Clamping
        if (input.min !== '' && !isNaN(parseFloat(input.min))) {
            newValue = Math.max(parseFloat(input.min), newValue);
        }
        if (input.max !== '' && !isNaN(parseFloat(input.max))) {
            newValue = Math.min(parseFloat(input.max), newValue);
        }
        
        // Rounding
        const decimals = (step.toString().split('.')[1] || '').length;
        input.value = newValue.toFixed(decimals);
        
        input.dispatchEvent(new Event('input'));
    };
    
    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        isDragging = false;
    };
    
    input.addEventListener('mousedown', onMouseDown);
}
