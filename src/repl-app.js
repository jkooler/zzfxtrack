import '@strudel/repl/index.mjs'; 
import { instruments } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { bakePattern } from './baker-logic.js';
import { playZzfxmSong, stopZzfxmSong } from './zzfxm-player.js';
import { attachVisualizer } from './visualizer.js';
import { getAudioContext } from '@strudel/webaudio';
import { initInstrumentUI, getInstrumentsForBaker, updateInstrumentUsage, updateSongSelectionState } from './instrument-ui.js';
import { createIcons, icons } from 'lucide';
import { initTracker, openTracker, openTrackerForEdit, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState } from './tracker.js';
import { initBlocks, openBlocksModal, saveBlock, updateBlock } from './blocks.js';

// --- Global State ---
let currentSongFilename = null;
let currentSongDisplayName = ''; // Store the display name for restoration
let lastBakedData = null;
let autoSaveTimeout = null; // Debounce timer for auto-save
let isPreviewPlaying = false;
let playingSongFilename = null;
let pendingExternalUrl = null;

// --- DOM Elements ---
const dom = {
    repl: document.getElementById('repl'),
    songList: document.getElementById('songList'),
    songNameInput: document.getElementById('songNameInput'),
    saveSongNameBtn: document.getElementById('saveSongNameBtn'),
    playBtn: document.getElementById('playBtn'),
    bakeBtn: document.getElementById('bakeBtn'),
    newSongBtn: document.getElementById('newSongBtn'),
    statusMsg: document.getElementById('statusMsg'),
    
    // Views
    welcomeView: document.getElementById('welcomeView'),
    editorContainer: document.getElementById('editorContainer'),
    
    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    
    // Modals
    newSongModal: document.getElementById('newSongModal'),
    newSongName: document.getElementById('newSongName'),
    confirmNewSong: document.getElementById('confirmNewSong'),
    cancelNewSong: document.getElementById('cancelNewSong'),
    
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
    copyJsonBtn: document.getElementById('copyJsonBtn'),

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
};

// --- View State Helpers ---
function showWelcome() {
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    dom.playBtn.style.visibility = 'hidden';
    dom.bakeBtn.disabled = true;
    
    updateSongSelectionState(false);
    dom.previewPlayBtn.disabled = true;
    if(dom.showJsonBtn) dom.showJsonBtn.disabled = true;
    
    // Clear state
    currentSongFilename = null;
    playingSongFilename = null;
    dom.songNameInput.classList.add('hidden');
    dom.saveSongNameBtn.style.display = 'none';
    if(dom.repl.editor) dom.repl.editor.stop();
    renderPlayButton();
    updateSongListVisualizer();
    
    // Clear preview
    dom.previewJson.innerText = '';
    lastBakedData = null;
}

function showEditor() {
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'flex';
    dom.playBtn.style.visibility = 'visible';
    dom.bakeBtn.disabled = false;
    dom.songNameInput.classList.remove('hidden');
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
    loadZzFXInstruments(instruments);
    
    // 3. Load Songs List
    await refreshSongList();
    
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
    const { getInstrumentMapping } = await import('./instrument-manager.js');
    const mapping = getInstrumentMapping();
    
    // Build instruments object from mapping
    const instruments = {};
    const defragged = (await import('./instrument-manager.js')).getDefragmentedInstruments();
    
    defragged.forEach(inst => {
        instruments[inst.strudelAlias] = inst.params;
    });
    
    // Reload into Strudel
    loadZzFXInstruments(instruments);
    console.log('[ReplApp] Reloaded', Object.keys(instruments).length, 'instruments into Strudel');
}

// --- Auto-Save and Hot-Reload Setup ---
let hotReloadTimeout = null;

function setupAutoSave() {
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

// Save pending changes before page unload
window.addEventListener('beforeunload', (e) => {
    if (autoSaveTimeout && currentSongFilename) {
        // There's a pending save - try to save synchronously
        clearTimeout(autoSaveTimeout);
        
        const editorCode = dom.repl.editor.code;
        const fileCode = editorToFile(editorCode);
        
        // Use sendBeacon for reliable delivery even as page closes
        const blob = new Blob([fileCode], { type: 'text/plain' });
        navigator.sendBeacon(`/api/song/${currentSongFilename}`, blob);
        
        // Also keep in localStorage as backup
        localStorage.setItem(`unsaved_${currentSongFilename}`, editorCode);
    }
});

// --- API Interactions ---

async function refreshSongList() {
    try {
        const res = await fetch('/api/songs');
        if (!res.ok) throw new Error('Failed to list songs');
        const files = await res.json();
        
        dom.songList.innerHTML = '';
        files.forEach(file => {
            const fileName = file.replace('.js', '');
            const li = document.createElement('li');
            li.className = `song-item ${file === currentSongFilename ? 'active' : ''}`;
            
            li.innerHTML = `
                <span>${fileName}</span>
                <div class="song-item-actions">
                    <button class="sidebar-del-btn" title="Delete ${fileName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `;

            // Click on text loads song
            li.querySelector('span').onclick = (e) => {
                e.stopPropagation();
                loadSong(file);
            };
            li.onclick = () => loadSong(file);

            // Delete button
            li.querySelector('.sidebar-del-btn').onclick = (e) => {
                e.stopPropagation();
                showDeleteConfirmation(file);
            };

            dom.songList.appendChild(li);
        });
        
        updateSongListVisualizer();
        updateSongListVisualizer();
        updateSongListVisualizer();
        createIcons({ icons });
    } catch (e) {
        console.error(e);
        setStatus('Error loading songs', 'error');
    }
}

function updateSongListVisualizer() {
    const listItems = Array.from(dom.songList.children);
    let visualizerAttached = false;
    
    listItems.forEach(li => {
        const span = li.querySelector('span');
        // Visualizer should track the PLAYING song, not necessarily the selected one
        const isPlayingTarget = span && playingSongFilename && span.innerText === playingSongFilename.replace('.js', '');
        
        let canvas = li.querySelector('canvas.song-visualizer');

        if (isPlayingTarget) {
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
    
    // Identify used strudel functions for import
    const commonFuncs = ['stack', 'note', 's', 'slow', 'fast', 'rev', 'jux', 'every', 'chunk', 'scale', 'gain', 'lpf', 'room', 'clip', 'sine', 'add', 'sub', 'mul', 'div', 'choose', 'rand', 'saw', 'square', 'tri', 'cat', 'seq', 'mini', 'tidal', 'pure', 'orbit', 'delay', 'shifto', 'shape', 'cps'];
    const usedImports = commonFuncs.filter(f => cleanCode.includes(f + '(') || cleanCode.includes(f + '.'));
    // Always include basics
    if (!usedImports.includes('note')) usedImports.push('note');
    if (!usedImports.includes('s')) usedImports.push('s');
    
    const importStmt = `import { ${usedImports.join(', ')} } from "@strudel/core";`;
    
    return `${importStmt}

export const bpm = ${bpmVal};

export const pattern = ${cleanCode};
`;
}

async function loadSong(filename) {
    setStatus(`Loading ${filename}...`);
    
    // IMPORTANT: Clear any pending auto-save from the previous song
    // This prevents saving the new song's content to the old song's file
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    
    try {
        const res = await fetch(`/api/song/${filename}`);
        if (!res.ok) throw new Error('Failed to load song');
        const fileCode = await res.text();
        
        // Transform for Editor
        let editorCode = fileToEditor(fileCode);
        
        // Check if there's an unsaved version in localStorage
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
        
        showEditor();
        currentSongFilename = filename;
        currentSongDisplayName = filename.replace('.js', ''); // Store without extension
        originalSongName = currentSongDisplayName; // Track for rename detection
        dom.songNameInput.value = currentSongDisplayName;
        dom.songNameInput.readOnly = false; // Make editable
        dom.songNameInput.placeholder = '';
        dom.saveSongNameBtn.style.display = 'none'; // Hide save button initially
        
        Array.from(dom.songList.children).forEach(li => {
            const span = li.querySelector('span');
            const isActive = span && span.innerText === filename.replace('.js', '');
            li.classList.toggle('active', isActive);
        });
        
        updateSongListVisualizer();
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.bakeBtn.disabled = false;
        
        // Clear preview and save status
        lastBakedData = null;
        dom.previewJson.innerText = "// Click GENERATE to create ZzFXM song";
        hideSaveStatus();
        
        renderPlayButton(); // Update play button context (Stop vs Play)
        
        // Update indicators in sidebar
        updateInstrumentUsage(editorCode);
        updateSongSelectionState(true);

        setStatus('Loaded', 'success');
    } catch (e) {
        console.error(e);
        setStatus(`Error loading ${filename}`, 'error');
    }
}

async function saveCurrentSong() {
    if (!currentSongFilename) return;
    
    try {
        const editorCode = dom.repl.editor.code;
        const fileCode = editorToFile(editorCode);
        
        const res = await fetch(`/api/song/${currentSongFilename}`, {
            method: 'POST',
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
    if (!name.endsWith('.js')) name += '.js';
    
    setStatus('Creating...');
    // Initial file content
    const template = `import { stack, note } from "@strudel/core";

export const bpm = 120;

export const pattern = note("c3 e3 g3").s("bd");
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

async function bakeCurrentSong() {
    if (!currentSongFilename) return;
    
    validateCode(dom.repl.editor.code);
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        if (!confirm("Code contains unsafe functions for ZzFXM (e.g. reverb/delay). These will be ignored. Bake anyway?")) return;
    }

    setStatus('Baking...');
    
    try {
        const code = dom.repl.editor.code;
        
        // Save first (good practice)
        await saveCurrentSong();
        
        // Use the live pattern from the scheduler!
        // This avoids file cache issues or import delays.
        const editor = dom.repl.editor;
        
        // Ensure latest code is evaluated
        await editor.evaluate();
        
        // Get pattern
        const pattern = editor.repl.scheduler.pattern;
        
        if (!pattern) throw new Error('No pattern found. Try playing the song first?');
        
        // Get BPM from text (since it's a variable, not on the pattern object)
        let bpm = 120;
        const match = code.match(/(?:const|let|var)\s+bpm\s*=\s*(\d+)/);
        if (match) bpm = Number(match[1]);
        
        // 3. Get dynamic instruments from manager
        const { array: instrumentArray, mapping: instrumentMapping } = await getInstrumentsForBaker();
        
        // 4. Get export settings
        const isLimitEnabled = dom.limitChannels.checked;
        const maxChannels = isLimitEnabled ? (parseInt(dom.maxChannelsInput.value) || 16) : Infinity;
        const normalizeLayers = dom.normalizeLayers?.checked || false;
        
        // 5. Bake!
        const result = bakePattern(pattern, bpm, instrumentArray, instrumentMapping, 8, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers
        });
        const songData = result.song;
        const { channelCount, droppedNotes } = result.stats;
        
        // Store for preview
        lastBakedData = songData;
        dom.previewJson.innerText = JSON.stringify(songData, null, 2);
        
        // 4. Send JSON to server
        const jsonFilename = currentSongFilename.replace('.js', '.json');
        
        const res = await fetch(`/api/save-baked/${jsonFilename}`, {
            method: 'POST',
            body: JSON.stringify(songData)
        });
        
        if (!res.ok) throw new Error('Server failed to save JSON');
        
        // Enable preview playback buttons
        // Enable preview playback buttons
        dom.previewPlayBtn.disabled = false;
        if(dom.showJsonBtn) dom.showJsonBtn.disabled = false;
        
        // Build status message with channel count
        let statusMsg = `/output/${jsonFilename} (${channelCount} ch)`;
        if (droppedNotes > 0) {
            statusMsg += ` • ${droppedNotes} notes dropped`;
        }
        setStatus(statusMsg, 'success');
        
    } catch (e) {
        console.error(e);
        setStatus(`Bake failed: ${e.message}`, 'error');
    }
}


// --- Validation Logic ---

const UNSAFE_FUNCS = [
    'delay', 'room', 'reverb', 'lpf', 'hpf', 'bp', 'vowel', 
    'phaser', 'leslie', 'crush', 'cutoff', 'resonance',
    'distort', 'saturate', 'chorus', 'flanger', 'tremolo',
    'fit', 'legato', 'chop' // Timing effects that might not bake well?
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
        setStatus(`⚠️ Unsafe for Baking: ${findings.join(', ')}`, 'error');
    } else {
        if (dom.statusMsg.innerText.startsWith('⚠️')) {
            setStatus('Ready', 'normal');
        }
    }
}


function setStatus(msg, type = 'normal') {
    dom.statusMsg.innerText = msg;
    dom.statusMsg.style.color = type === 'error' ? '#ff3333' : (type === 'success' ? '#00ff66' : '#888');
}

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

function openModal() {
    dom.newSongModal.classList.add('open');
    dom.newSongName.focus();
}

function closeModal() {
    dom.newSongModal.classList.remove('open');
    dom.newSongName.value = '';
}

// --- Event Listeners ---

// Event Listeners ---

dom.bakeBtn.addEventListener('click', bakeCurrentSong);

dom.newSongBtn.addEventListener('click', openModal);
dom.cancelNewSong.addEventListener('click', closeModal);
dom.confirmNewSong.addEventListener('click', () => {
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
});

// Delete Confirmation
let songToDelete = null;

function showDeleteConfirmation(filename) {
    songToDelete = filename;
    dom.deleteConfirmText.innerHTML = `File: <strong>${filename}</strong><br>This action is irreversible.`;
    dom.deleteConfirmModal.classList.add('open');
}

function closeDeleteModal() {
    dom.deleteConfirmModal.classList.remove('open');
    songToDelete = null;
}



dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);

// Song Rename Functionality
let originalSongName = '';

// Track changes to song name input
dom.songNameInput.addEventListener('input', () => {
    if (!currentSongFilename) return;
    
    const newName = dom.songNameInput.value.trim();
    const hasChanged = newName !== originalSongName && newName !== '';
    
    // Show/hide save button based on whether name changed
    dom.saveSongNameBtn.style.display = hasChanged ? 'block' : 'none';
});

// Save song name on button click
dom.saveSongNameBtn.addEventListener('click', () => {
    renameSong();
});

// Save song name on Enter key
dom.songNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        renameSong();
    }
});

async function renameSong() {
    if (!currentSongFilename) return;
    
    const newName = dom.songNameInput.value.trim();
    if (!newName || newName === originalSongName) {
        dom.saveSongNameBtn.style.display = 'none';
        return;
    }
    
    // Validate name (no special characters that would break filenames)
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
        setStatus('Invalid name. Use only letters, numbers, hyphens, and underscores.', 'error');
        return;
    }
    
    const newFilename = newName + '.js';
    
    // Check if name already exists
    try {
        const res = await fetch('/api/songs');
        if (!res.ok) throw new Error('Failed to check existing songs');
        const files = await res.json();
        
        if (files.includes(newFilename) && newFilename !== currentSongFilename) {
            setStatus('A song with that name already exists', 'error');
            return;
        }
    } catch (e) {
        console.error(e);
        setStatus('Error checking song names', 'error');
        return;
    }
    
    setStatus('Renaming...');
    
    try {
        // Rename via API
        const res = await fetch('/api/rename-song', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        
        // Hide save button
        dom.saveSongNameBtn.style.display = 'none';
        
        // Refresh song list
        await refreshSongList();
        
        setStatus('Renamed successfully', 'success');
        showSaveStatus('✅ Song renamed');
        
    } catch (e) {
        console.error(e);
        setStatus('Error renaming song', 'error');
        // Restore original name on error
        dom.songNameInput.value = originalSongName;
        dom.saveSongNameBtn.style.display = 'none';
    }
}

dom.confirmDeleteBtn.addEventListener('click', async () => {
    if (songToDelete) {
        await deleteSong(songToDelete);
        closeDeleteModal();
    }
});

async function deleteSong(filename) {
    setStatus('Deleting...');
    try {
        const res = await fetch(`/api/song/${filename}`, { method: 'DELETE' });
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

    if (!lastBakedData) {
        setStatus('Nothing to play. Bake a song first.', 'error');
        return;
    }
    
    // Stop Strudel playback to avoid overlap
    const editor = dom.repl.editor;
    if (editor && editor.repl.scheduler.started) {
        editor.stop();
        updatePlayState(false);
    }
    
    playZzfxmSong(lastBakedData, getAudioContext(), () => {
        updatePreviewPlayButton(false);
    });
    updatePreviewPlayButton(true);
});

function updatePreviewPlayButton(playing) {
    isPreviewPlaying = playing;
    dom.previewPlayBtn.innerHTML = playing ? '<i data-lucide="square" class="w-4 h-4 fill-current"></i>' : '<i data-lucide="play" class="w-4 h-4"></i>';
    dom.previewPlayBtn.style.color = playing ? '#ff3333' : '#eee';
    createIcons({ icons });
}


// Shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentSong();
    }
});


// --- PLAYBACK LOGIC ---

function togglePlay() {
    const editor = dom.repl.editor;
    if (!editor) return;
    
    validateCode(editor.code);
    
    const scheduler = editor.repl.scheduler;
    const isRunning = scheduler.started;
    const isPlayingCurrent = isRunning && playingSongFilename === currentSongFilename;
    
    if (isPlayingCurrent) {
        // Stop current song
        editor.stop();
        // UI update happens via state helper
        updatePlayState(false);
    } else {
        // Start new song (implicitly replaces old one if running)
        editor.evaluate();
        updatePlayState(true);
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

function renderPlayButton() {
    const editor = dom.repl.editor;
    // Use playingSongFilename logic: Show STOP only if running AND playing current song
    // Note: editor.repl.scheduler.started might be true (if playing another song)
    // But we only show STOP if matches current filename.
    const isRunning = editor && editor.repl.scheduler.started;
    const showStop = isRunning && playingSongFilename === currentSongFilename;
    
    dom.playBtn.innerHTML = showStop ? '<i data-lucide="square" class="w-5 h-5 fill-current"></i>' : '<i data-lucide="play" class="w-5 h-5 fill-current"></i>';
    dom.playBtn.style.color = showStop ? '#ff3333' : '#eee';
    createIcons({ icons });
}

// Listen for global Strudel events to keep UI in sync (e.g. Ctrl+Enter)
document.addEventListener('start-repl', (e) => {
    // If our repl started, update button
    if (dom.repl.editor && e.detail === dom.repl.editor.id) {
        updatePlayState(true);
    }
});

// Add listener
dom.playBtn.addEventListener('click', togglePlay);

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

// JSON Modal Listeners
if(dom.showJsonBtn) dom.showJsonBtn.addEventListener('click', openJsonModal);
if(dom.closeJsonModalBtn) dom.closeJsonModalBtn.addEventListener('click', closeJsonModal);
if(dom.closeJsonModalBottomBtn) dom.closeJsonModalBottomBtn.addEventListener('click', closeJsonModal);
if(dom.copyJsonBtn) dom.copyJsonBtn.addEventListener('click', copyJsonToClipboard);

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
    });
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
    }));
    
    initTracker(instrumentList);
}

/**
 * Setup tracker event listeners
 */
function setupTrackerEventListeners() {
    // Listen for tracker:apply event to insert code into editor
    document.addEventListener('tracker:apply', async (e) => {
        const code = e.detail.code;
        if (code && dom.repl.editor) {
            // Get the current code and convert it to file format (with exports)
            let fileCode = editorToFile(dom.repl.editor.code || '');
            
            // Remove any existing pattern definition from the file code
            fileCode = fileCode.replace(
                /export\s+const\s+pattern\s*=[\s\S]*?;\s*$/,
                ''
            );
            
            // Add the new pattern before the final closing
            fileCode = fileCode.replace(
                /(\nexport const bpm = \d+;)/,
                `$1\n\nexport const pattern = ${code};`
            );
            
            // Convert back to editor format and set
            const editorCode = fileToEditor(fileCode);
            dom.repl.editor.setCode(editorCode);
            
            // Also save to server
            fetch(`/api/song/${currentSongFilename}`, {
                method: 'POST',
                body: fileCode
            });
            
            setStatus('Tracker pattern applied to editor', 'success');
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
async function openTrackerModal() {
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    
    const instrumentList = instruments.map(inst => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
    }));
    
    openTracker(instrumentList);
}

// Expose tracker open function globally for button access
window.openTrackerModal = openTrackerModal;

/**
 * Open the tracker modal for editing an existing block
 */
async function openTrackerModalForEdit(block, trackerState) {
    const { getDefragmentedInstruments } = await import('./instrument-manager.js');
    const instruments = getDefragmentedInstruments();
    
    const instrumentList = instruments.map(inst => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
    }));
    
    // Prepare block data for edit mode
    const blockData = {
        filename: block.filename,
        name: block.name,
        description: block.description,
        trackerState: trackerState,
    };
    
    openTrackerForEdit(instrumentList, blockData);
}

/**
 * Setup blocks event listeners
 */
function setupBlocksEventListeners() {
    // Blocks button in header
    const blocksBtn = document.getElementById('blocksBtn');
    blocksBtn?.addEventListener('click', openBlocksModal);
    
    // Listen for blocks:create event (from Blocks modal)
    document.addEventListener('blocks:create', () => {
        openTrackerModal();
        // Switch tracker to "block creation mode"
        isCreatingBlock = true;
    });
    
    // Listen for blocks:edit event (from Blocks modal)
    document.addEventListener('blocks:edit', async (e) => {
        const { block, trackerState } = e.detail;
        await openTrackerModalForEdit(block, trackerState);
    });
    
    // Listen for blocks:insert event
    document.addEventListener('blocks:insert', (e) => {
        const { pattern, name } = e.detail;
        if (pattern && dom.repl.editor) {
            // Get the current code and convert it to file format (with exports)
            let fileCode = editorToFile(dom.repl.editor.code || '');
            
            // Remove any existing pattern definition from the file code
            fileCode = fileCode.replace(
                /export\s+const\s+pattern\s*=[\s\S]*?;\s*$/,
                ''
            );
            
            // Add the new pattern before the final closing
            fileCode = fileCode.replace(
                /(\nexport const bpm = \d+;)/,
                `$1\n\nexport const pattern = ${pattern};`
            );
            
            // Convert back to editor format and set
            const editorCode = fileToEditor(fileCode);
            dom.repl.editor.setCode(editorCode);
            
            // Also save to server
            fetch(`/api/song/${currentSongFilename}`, {
                method: 'POST',
                body: fileCode
            });
            
            setStatus(`Block "${name}" inserted into song`, 'success');
        }
    });
    
    // Keyboard shortcut for blocks (Ctrl/Cmd + B)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            // Only if not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                openBlocksModal();
            }
        }
    });
}

// Flag to track if we're creating a block (vs just using tracker)
let isCreatingBlock = false;

// Override the tracker apply handler to support saving as block
document.addEventListener('tracker:apply', async (e) => {
    if (isCreatingBlock) {
        // Save as block instead of inserting into song
        const code = e.detail.code;
        const trackerState = serializeTrackerState();
        
        // Prompt for block name and description
        const name = prompt('Enter a name for this block:', 'My Pattern');
        if (!name) {
            isCreatingBlock = false;
            return;
        }
        
        const description = prompt('Enter a description (optional):', '');
        
        // Save the block
        const success = await saveBlock(name, description, code, trackerState);
        if (success) {
            setStatus(`Block "${name}" saved successfully`, 'success');
        } else {
            setStatus('Failed to save block', 'error');
        }
        
        isCreatingBlock = false;
    }
});

// Listen for tracker:saveBlock event (when saving edits to existing block)
document.addEventListener('tracker:saveBlock', async (e) => {
    const { filename, name, description, pattern, trackerState } = e.detail;
    
    // Confirm before saving
    if (!confirm(`Save changes to block "${name}"?`)) {
        return;
    }
    
    // Update the block
    const success = await updateBlock(filename, name, description, pattern, trackerState);
    if (success) {
        setStatus(`Block "${name}" updated successfully`, 'success');
    } else {
        setStatus('Failed to update block', 'error');
    }
});

// Start
init();
