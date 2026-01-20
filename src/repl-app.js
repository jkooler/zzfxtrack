import '@strudel/repl/index.mjs'; 
import { instruments, instrumentArray } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { bakePattern } from './baker-logic.js';
import { playZzfxmSong, stopZzfxmSong } from './zzfxm-player.js';
import { getAudioContext } from '@strudel/webaudio';

// --- Global State ---
let currentSongFilename = null;
let currentSongDisplayName = ''; // Store the display name for restoration
let lastBakedData = null;
let autoSaveTimeout = null; // Debounce timer for auto-save

// --- DOM Elements ---
const dom = {
    repl: document.getElementById('repl'),
    songList: document.getElementById('songList'),
    currentSongTitle: document.getElementById('currentSongTitle'),
    playBtn: document.getElementById('playBtn'),
    bakeBtn: document.getElementById('bakeBtn'),
    newSongBtn: document.getElementById('newSongBtn'),
    statusMsg: document.getElementById('statusMsg'),
    
    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    previewStopBtn: document.getElementById('previewStopBtn'),
    
    // Modals
    newSongModal: document.getElementById('newSongModal'),
    newSongName: document.getElementById('newSongName'),
    confirmNewSong: document.getElementById('confirmNewSong'),
    cancelNewSong: document.getElementById('cancelNewSong'),
    
    // Delete Confirmation
    deleteConfirmModal: document.getElementById('deleteConfirmModal'),
    deleteConfirmText: document.getElementById('deleteConfirmText'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
};

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
    
    // 4. Setup auto-save on input
    setupAutoSave();
    
    // Ensure buttons are disabled when no song is loaded
    dom.bakeBtn.disabled = true;
    dom.previewPlayBtn.disabled = true;
    dom.previewStopBtn.disabled = true;
    
    // Clear preview area
    dom.previewJson.innerText = '';
    
    // Clear status - no song loaded yet
    setStatus('');
}

// --- Auto-Save Setup ---
function setupAutoSave() {
    console.log('setupAutoSave() called');
    let checkCount = 0;
    
    // Wait for editor to be ready
    const checkEditor = setInterval(() => {
        checkCount++;
        
        // dom.repl.editor.editor IS the CodeMirror EditorView
        if (dom.repl.editor && dom.repl.editor.editor) {
            clearInterval(checkEditor);
            console.log('✅ Editor found! Setting up auto-save...');
            
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
                    
                    // IMMEDIATELY save to localStorage as backup
                    localStorage.setItem(`unsaved_${currentSongFilename}`, currentCode);
                    
                    // Clear existing timeout
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
                    <button class="sidebar-del-btn" title="Delete ${fileName}">🗑️</button>
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
    } catch (e) {
        console.error(e);
        setStatus('Error loading songs', 'error');
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
        
        currentSongFilename = filename;
        currentSongDisplayName = filename; // Store for later restoration
        dom.currentSongTitle.innerText = filename;
        
        Array.from(dom.songList.children).forEach(li => {
            li.classList.toggle('active', li.innerText === filename.replace('.js', ''));
        });
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.bakeBtn.disabled = false;
        
        // Clear preview and save status
        lastBakedData = null;
        dom.previewJson.innerText = "// Click BAKE to generate...";
        hideSaveStatus();
        
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
        
        // 3. Bake!
        const songData = bakePattern(pattern, bpm, instrumentArray);
        
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
        dom.previewPlayBtn.disabled = false;
        dom.previewStopBtn.disabled = false;
        
        setStatus(`Baked to /output/${jsonFilename}`, 'success');
        
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
    const originalText = dom.currentSongTitle.innerText;
    const originalColor = dom.currentSongTitle.style.color;
    
    // Fade out
    dom.currentSongTitle.style.transition = 'opacity 0.2s ease-out';
    dom.currentSongTitle.style.opacity = '0';
    
    // Change text and color after fade out
    setTimeout(() => {
        dom.currentSongTitle.innerText = message;
        dom.currentSongTitle.style.color = '#00ff66';
        
        // Fade in
        dom.currentSongTitle.style.opacity = '1';
        
        // After duration, fade out and restore filename
        setTimeout(() => {
            dom.currentSongTitle.style.opacity = '0';
            
            setTimeout(() => {
                dom.currentSongTitle.innerText = currentSongDisplayName;
                dom.currentSongTitle.style.color = originalColor;
                dom.currentSongTitle.style.opacity = '1';
            }, 200); // Wait for fade out
        }, duration);
    }, 200); // Wait for fade out
}

function hideSaveStatus() {
    // Restore the filename immediately with fade
    dom.currentSongTitle.style.transition = 'opacity 0.2s ease-out';
    dom.currentSongTitle.style.opacity = '0';
    
    setTimeout(() => {
        dom.currentSongTitle.innerText = currentSongDisplayName;
        dom.currentSongTitle.style.color = '#888';
        dom.currentSongTitle.style.opacity = '1';
    }, 200);
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
        
        const wasCurrentSong = (filename === currentSongFilename);
        
        if (wasCurrentSong) {
            currentSongFilename = null;
            dom.currentSongTitle.innerText = 'Select a song...';
            if (dom.repl.editor) dom.repl.editor.setCode('');
            dom.bakeBtn.disabled = true;
            dom.previewPlayBtn.disabled = true;
            dom.previewStopBtn.disabled = true;
            dom.previewJson.innerText = "";
            lastBakedData = null;
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
    if (!lastBakedData) {
        setStatus('Nothing to play. Bake a song first.', 'error');
        return;
    }
    // Stop Strudel playback to avoid overlap
    const editor = dom.repl.editor;
    if (editor && editor.repl.scheduler.started) {
        editor.stop();
        updatePlayButton(false);
    }
    
    playZzfxmSong(lastBakedData, getAudioContext());
});

dom.previewStopBtn.addEventListener('click', stopZzfxmSong);


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
    
    // Access internal scheduler state
    const scheduler = editor.repl.scheduler;
    const isRunning = scheduler.started;
    
    if (isRunning) {
        editor.stop();
        // UI update happens via event listener or manual
        updatePlayButton(false);
    } else {
        editor.evaluate();
        updatePlayButton(true);
    }
}

function updatePlayButton(isPlaying) {
    dom.playBtn.innerText = isPlaying ? '⏹' : '▶';
    dom.playBtn.style.color = isPlaying ? '#ff3333' : '#eee';
}

// Listen for global Strudel events to keep UI in sync (e.g. Ctrl+Enter)
document.addEventListener('start-repl', (e) => {
    // If our repl started, update button
    if (dom.repl.editor && e.detail === dom.repl.editor.id) {
        updatePlayButton(true);
    }
});

// Add listener
dom.playBtn.addEventListener('click', togglePlay);

// Start
init();
