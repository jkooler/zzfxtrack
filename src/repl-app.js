import '@strudel/repl/index.mjs'; 
import { instruments, instrumentArray } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { bakePattern } from './baker-logic.js';
import { playZzfxmSong, stopZzfxmSong } from './zzfxm-player.js';
import { getAudioContext } from '@strudel/webaudio';

// --- Global State ---
let currentSongFilename = null;
let lastBakedData = null;

// --- DOM Elements ---
const dom = {
    repl: document.getElementById('repl'),
    songList: document.getElementById('songList'),
    currentSongTitle: document.getElementById('currentSongTitle'),
    playBtn: document.getElementById('playBtn'),
    saveBtn: document.getElementById('saveBtn'),
    bakeBtn: document.getElementById('bakeBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    newSongBtn: document.getElementById('newSongBtn'),
    statusMsg: document.getElementById('statusMsg'),
    
    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    previewStopBtn: document.getElementById('previewStopBtn'),
    
    // Modal
    newSongModal: document.getElementById('newSongModal'),
    newSongName: document.getElementById('newSongName'),
    confirmNewSong: document.getElementById('confirmNewSong'),
    cancelNewSong: document.getElementById('cancelNewSong'),
};

// --- Initialization ---
async function init() {
    setStatus('Initializing...', 'normal');
    
    // 1. Initialize Strudel Core
    await initStrudel();
    
    // 2. Load ZzFX Instruments into Strudel Registry
    loadZzFXInstruments(instruments);
    
    // 3. Load Songs List
    await refreshSongList();
    
    setStatus('Ready', 'normal');
}

// --- API Interactions ---

async function refreshSongList() {
    try {
        const res = await fetch('/api/songs');
        if (!res.ok) throw new Error('Failed to list songs');
        const files = await res.json();
        
        dom.songList.innerHTML = '';
        files.forEach(file => {
            const li = document.createElement('li');
            li.className = `song-item ${file === currentSongFilename ? 'active' : ''}`;
            li.innerText = file.replace('.js', '');
            li.onclick = () => loadSong(file);
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
    try {
        const res = await fetch(`/api/song/${filename}`);
        if (!res.ok) throw new Error('Failed to load song');
        const fileCode = await res.text();
        
        // Transform for Editor
        const editorCode = fileToEditor(fileCode);
        
        currentSongFilename = filename;
        dom.currentSongTitle.innerText = filename;
        
        Array.from(dom.songList.children).forEach(li => {
            li.classList.toggle('active', li.innerText === filename.replace('.js', ''));
        });
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.saveBtn.disabled = false;
        dom.bakeBtn.disabled = false;
        dom.deleteBtn.disabled = false;
        
        // Clear preview
        lastBakedData = null;
        dom.previewJson.innerText = "// Click BAKE to generate...";
        
        setStatus('Loaded', 'success');
    } catch (e) {
        console.error(e);
        setStatus(`Error loading ${filename}`, 'error');
    }
}

async function saveCurrentSong() {
    if (!currentSongFilename) return;
    setStatus('Saving...');
    
    try {
        const editorCode = dom.repl.editor.code;
        const fileCode = editorToFile(editorCode);
        
        const res = await fetch(`/api/song/${currentSongFilename}`, {
            method: 'POST',
            body: fileCode
        });
        
        if (!res.ok) throw new Error('Save failed');
        setStatus('Saved!', 'success');
        setTimeout(() => setStatus(''), 2000); // Wait 2s then clear
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

async function deleteCurrentSong() {
    if (!currentSongFilename) return;
    if (!confirm(`Permanently delete ${currentSongFilename}?`)) return;
    
    setStatus('Deleting...');
    try {
        const res = await fetch(`/api/song/${currentSongFilename}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        
        currentSongFilename = null;
        dom.currentSongTitle.innerText = 'Select a song...';
        dom.repl.editor.setCode('');
        dom.saveBtn.disabled = true;
        dom.bakeBtn.disabled = true;
        dom.deleteBtn.disabled = true;
        
        await refreshSongList();
        setStatus('Deleted', 'success');
        
        lastBakedData = null;
        dom.previewJson.innerText = "";
    } catch (e) {
        console.error(e);
        setStatus('Error deleting content', 'error');
    }
}

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

function openModal() {
    dom.newSongModal.classList.add('open');
    dom.newSongName.focus();
}

function closeModal() {
    dom.newSongModal.classList.remove('open');
    dom.newSongName.value = '';
}

// --- Event Listeners ---

dom.saveBtn.addEventListener('click', saveCurrentSong);
dom.deleteBtn.addEventListener('click', deleteCurrentSong);
dom.bakeBtn.addEventListener('click', bakeCurrentSong);

dom.newSongBtn.addEventListener('click', openModal);
dom.cancelNewSong.addEventListener('click', closeModal);
dom.confirmNewSong.addEventListener('click', () => {
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
});

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
