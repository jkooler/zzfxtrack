/**
 * Instrument UI Controller
 * Handles all UI interactions for the instrument editor
 */

import {
    loadInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
    getInstrumentById,
    migrateFromFile,
    needsMigration
} from './instrument-manager.js';
import { playTestNoteDebounced, resumePreviewAudio } from './instrument-preview.js';
import { autoUpdateInstrumentsFile } from './file-generator.js';

// State
let currentInstrumentId = null;
let currentView = 'songs'; // 'songs' or 'instruments'

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
    downloadInstrumentsBtn: document.getElementById('downloadInstrumentsBtn'),
    
    // Drawer
    instrumentDrawer: document.getElementById('instrumentDrawer'),
    drawerTitle: document.getElementById('drawerTitle'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    testInstrumentBtn: document.getElementById('testInstrumentBtn'),
    
    // Drawer Inputs
    instExportName: document.getElementById('instExportName'),
    instStrudelAlias: document.getElementById('instStrudelAlias'),
    instChannel: document.getElementById('instChannel'),
    
    // Modals
    newInstrumentModal: document.getElementById('newInstrumentModal'),
    newInstrumentName: document.getElementById('newInstrumentName'),
    newInstrumentAlias: document.getElementById('newInstrumentAlias'),
    confirmNewInstrument: document.getElementById('confirmNewInstrument'),
    cancelNewInstrument: document.getElementById('cancelNewInstrument'),
    
    deleteInstrumentModal: document.getElementById('deleteInstrumentModal'),
    deleteInstrumentText: document.getElementById('deleteInstrumentText'),
    confirmDeleteInstrument: document.getElementById('confirmDeleteInstrument'),
    cancelDeleteInstrument: document.getElementById('cancelDeleteInstrument'),
};

// Get all parameter inputs (0-20)
const paramInputs = [];
for (let i = 0; i <= 20; i++) {
    paramInputs[i] = document.getElementById(`param${i}`);
}

/**
 * Initialize instrument UI
 */
export async function initInstrumentUI() {
    console.log('[InstrumentUI] Initializing...');
    
    // Check if migration is needed
    if (needsMigration()) {
        console.log('[InstrumentUI] Migration needed, importing from instruments.js');
        try {
            // Import the current instruments
            const { instruments: instrumentsObj, instrumentMapping } = await import('../instruments.js');
            migrateFromFile({ instruments: instrumentsObj, instrumentMapping });
        } catch (e) {
            console.error('[InstrumentUI] Migration failed:', e);
        }
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Render instrument list
    renderInstrumentList();
    
    // Generate initial instruments.js file
    autoUpdateInstrumentsFile();
    
    console.log('[InstrumentUI] Initialized');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Tab switching
    dom.songsTab.addEventListener('click', () => switchView('songs'));
    dom.instrumentsTab.addEventListener('click', () => switchView('instruments'));
    
    // New instrument
    dom.newInstrumentBtn.addEventListener('click', openNewInstrumentModal);
    dom.cancelNewInstrument.addEventListener('click', closeNewInstrumentModal);
    dom.confirmNewInstrument.addEventListener('click', handleCreateInstrument);
    
    // Download instruments.js
    dom.downloadInstrumentsBtn.addEventListener('click', handleDownloadInstruments);
    
    // Delete instrument
    dom.cancelDeleteInstrument.addEventListener('click', closeDeleteInstrumentModal);
    dom.confirmDeleteInstrument.addEventListener('click', handleDeleteInstrument);
    
    // Drawer
    dom.closeDrawerBtn.addEventListener('click', closeDrawer);
    dom.testInstrumentBtn.addEventListener('click', handleTestInstrument);
    
    // Drawer inputs - auto-save and preview on change
    dom.instExportName.addEventListener('input', handleDrawerChange);
    dom.instStrudelAlias.addEventListener('input', handleDrawerChange);
    
    // Parameter inputs - debounced preview
    paramInputs.forEach((input, index) => {
        if (input) {
            input.addEventListener('input', () => handleParamChange(index));
        }
    });
    
    // Parameter ordering toggle
    setupParameterOrdering();
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
    const paramGroup = document.querySelector('.param-group');
    if (!paramGroup) return;
    
    // Parameter groups and ordering
    const musicianOrder = {
        'General': [0, 6, 7, 2, 1, 20],
        'Envelope (ADSR)': [3, 18, 4, 17, 5],
        'Effects': [13, 15, 16],
        'LFO (Volume)': [19, 12],
        'Pitch': [8, 9, 10, 11, 14]
    };
    
    const paramLabels = {
        0: 'Volume', 1: 'Randomness', 2: 'Frequency (Hz)', 3: 'Attack (s)',
        4: 'Sustain (s)', 5: 'Release (s)', 6: 'Wave Shape', 7: 'Shape Curve',
        8: 'Slide (Hz/s)', 9: 'Delta Slide', 10: 'Pitch Jump (Hz)',
        11: 'Pitch Jump Time (s)', 12: 'Repeat Time (s)', 13: 'Noise (detune)',
        14: 'Modulation (Hz)', 15: 'Bit Crush', 16: 'Delay (s)',
        17: 'Sustain Volume', 18: 'Decay', 19: 'Tremolo (Hz)', 20: 'Filter (Hz)'
    };
    
    const paramHints = {
        6: '0=sine, 1=tri, 2=saw, 3=tan, 4=noise, 5=square'
    };
    
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
    } else {
        // Musician-friendly order with groups
        Object.entries(musicianOrder).forEach(([groupName, indices]) => {
            const groupHeader = document.createElement('h4');
            groupHeader.textContent = groupName;
            groupHeader.style.cssText = 'margin: 20px 0 10px 0; color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;';
            paramGroup.appendChild(groupHeader);
            
            indices.forEach(i => {
                const field = createParamField(i, paramLabels[i], paramHints[i], false);
                paramGroup.appendChild(field);
            });
        });
    }
}

/**
 * Create a parameter field element
 */
function createParamField(index, label, hint, showIndex) {
    const field = document.createElement('div');
    field.className = 'param-field';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    field.appendChild(labelEl);
    
    const input = paramInputs[index];
    if (input) {
        field.appendChild(input);
        
        if (hint || showIndex) {
            const hintEl = document.createElement('div');
            hintEl.className = 'param-hint';
            hintEl.textContent = hint ? `Index ${index} • ${hint}` : `Index ${index}`;
            field.appendChild(hintEl);
        }
    }
    
    return field;
}

/**
 * Switch between songs and instruments view
 */
function switchView(view) {
    currentView = view;
    
    if (view === 'songs') {
        dom.songsTab.classList.add('active');
        dom.instrumentsTab.classList.remove('active');
        dom.songList.style.display = 'block';
        dom.instrumentList.classList.remove('active');
        dom.newSongBtn.style.display = 'block';
        dom.newInstrumentBtn.style.display = 'none';
        dom.downloadInstrumentsBtn.style.display = 'none';
        closeDrawer();
    } else {
        dom.songsTab.classList.remove('active');
        dom.instrumentsTab.classList.add('active');
        dom.songList.style.display = 'none';
        dom.instrumentList.classList.add('active');
        dom.newSongBtn.style.display = 'none';
        dom.newInstrumentBtn.style.display = 'block';
        dom.downloadInstrumentsBtn.style.display = 'block';
    }
}

/**
 * Render instrument list
 */
function renderInstrumentList() {
    const instruments = loadInstruments();
    dom.instrumentList.innerHTML = '';
    
    // Reverse order so newest (highest channel) appears first
    const reversed = [...instruments].reverse();
    
    reversed.forEach((inst, index) => {
        const li = document.createElement('li');
        li.className = `instrument-item ${inst.id === currentInstrumentId ? 'active' : ''}`;
        li.draggable = true;
        li.dataset.instrumentId = inst.id;
        
        li.innerHTML = `
            <div class="instrument-info" style="cursor: move;">
                <div class="instrument-name">⋮⋮ ${inst.exportName}</div>
                <div class="instrument-alias">${inst.strudelAlias}</div>
                <div class="instrument-channel">ch: ${inst.channel}</div>
            </div>
            <div class="song-item-actions">
                <button class="sidebar-del-btn" title="Delete ${inst.exportName}">🗑️</button>
            </div>
        `;
        
        // Click to edit
        li.querySelector('.instrument-info').addEventListener('click', () => openDrawer(inst.id));
        
        // Delete button
        li.querySelector('.sidebar-del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteInstrumentConfirmation(inst.id);
        });
        
        // Drag and drop events
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('dragleave', handleDragLeave);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);
        
        dom.instrumentList.appendChild(li);
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
        // Get all list items
        const items = Array.from(dom.instrumentList.children);
        const draggedIndex = items.indexOf(draggedElement);
        const targetIndex = items.indexOf(target);
        
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
        
        // Find indices (in reversed array since that's what we display)
        const reversed = [...instruments].reverse();
        const draggedIndex = reversed.findIndex(inst => inst.id === draggedId);
        const targetIndex = reversed.findIndex(inst => inst.id === targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            // Reorder in the reversed array
            const [movedInst] = reversed.splice(draggedIndex, 1);
            reversed.splice(targetIndex, 0, movedInst);
            
            // Reverse back to get original order and save
            const reordered = [...reversed].reverse();
            
            // Update channel numbers based on new order
            reordered.forEach((inst, index) => {
                inst.channel = index;
            });
            
            // Save and update
            import('./instrument-manager.js').then(({ saveInstruments }) => {
                saveInstruments(reordered);
                renderInstrumentList();
                autoUpdateInstrumentsFile();
                console.log('[InstrumentUI] Reordered instruments');
            });
        }
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
    
    currentInstrumentId = instrumentId;
    
    // Populate fields
    dom.drawerTitle.textContent = `Edit: ${instrument.exportName}`;
    dom.instExportName.value = instrument.exportName;
    dom.instStrudelAlias.value = instrument.strudelAlias;
    dom.instChannel.value = instrument.channel;
    
    // Populate parameters
    instrument.params.forEach((value, index) => {
        if (paramInputs[index]) {
            paramInputs[index].value = value;
        }
    });
    
    // Show drawer
    dom.instrumentDrawer.classList.add('active');
    
    // Update active state in list
    renderInstrumentList();
    
    // Resume audio context (needed for user interaction)
    resumePreviewAudio();
}

/**
 * Close drawer
 */
function closeDrawer() {
    dom.instrumentDrawer.classList.remove('active');
    currentInstrumentId = null;
    renderInstrumentList();
}

/**
 * Handle drawer field changes (export name, alias)
 */
function handleDrawerChange() {
    if (!currentInstrumentId) return;
    
    const changes = {
        exportName: dom.instExportName.value,
        strudelAlias: dom.instStrudelAlias.value
    };
    
    updateInstrument(currentInstrumentId, changes);
    renderInstrumentList();
    autoUpdateInstrumentsFile();
}

/**
 * Handle parameter input changes
 */
function handleParamChange(paramIndex) {
    if (!currentInstrumentId) return;
    
    const instrument = getInstrumentById(currentInstrumentId);
    if (!instrument) return;
    
    // Update parameter
    const newParams = [...instrument.params];
    newParams[paramIndex] = parseFloat(paramInputs[paramIndex].value) || 0;
    
    updateInstrument(currentInstrumentId, { params: newParams });
    autoUpdateInstrumentsFile();
    
    // Play test note (debounced)
    playTestNoteDebounced(newParams);
}

/**
 * Handle test button click
 */
function handleTestInstrument() {
    if (!currentInstrumentId) return;
    
    const instrument = getInstrumentById(currentInstrumentId);
    if (!instrument) return;
    
    // Play immediately (no debounce)
    playTestNoteDebounced(instrument.params, 440, 0);
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
    dom.newInstrumentAlias.value = '';
}

/**
 * Handle create new instrument
 */
function handleCreateInstrument() {
    const exportName = dom.newInstrumentName.value.trim();
    const strudelAlias = dom.newInstrumentAlias.value.trim();
    
    if (!exportName || !strudelAlias) {
        alert('Please provide both export name and Strudel alias');
        return;
    }
    
    const instruments = loadInstruments();
    const channel = instruments.length; // Auto-assign next channel
    
    const newInst = createInstrument(exportName, strudelAlias, channel);
    
    closeNewInstrumentModal();
    renderInstrumentList();
    autoUpdateInstrumentsFile();
    
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
    
    deleteInstrument(instrumentToDelete);
    
    if (instrumentToDelete === currentInstrumentId) {
        closeDrawer();
    }
    
    closeDeleteInstrumentModal();
    renderInstrumentList();
    autoUpdateInstrumentsFile();
}

/**
 * Handle download instruments.js button
 */
function handleDownloadInstruments() {
    import('./file-generator.js').then(({ getCurrentInstrumentsContent }) => {
        const content = getCurrentInstrumentsContent();
        
        if (!content) {
            alert('No instruments.js content available. Try creating or editing an instrument first.');
            return;
        }
        
        // Create blob and download
        const blob = new Blob([content], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'instruments.js';
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('[InstrumentUI] Downloaded instruments.js');
    });
}



/**
 * Get current instruments for baker
 * Called by repl-app.js when baking
 */
export async function getInstrumentsForBaker() {
    const { getInstrumentMapping, getInstrumentArray } = await import('./instrument-manager.js');
    return {
        mapping: getInstrumentMapping(),
        array: getInstrumentArray()
    };
}
