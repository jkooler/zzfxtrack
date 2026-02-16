import '@strudel/repl/index.mjs'; 
import { instruments } from '../instruments.js';
import { loadZzFXInstruments } from './zzfx-loader.js';
import { initStrudel } from './init.js';
import { exportPattern } from './export-logic.js';
import { playZzfxmSong, stopZzfxmSong } from './zzfxm-player.js';
import { attachVisualizer } from './visualizer.js';
import { getAudioContext } from '@strudel/webaudio';
import { initInstrumentUI, getInstrumentsForExporter, updateInstrumentUsage, updateSongSelectionState } from './instrument-ui.js';
import { createIcons, icons } from 'lucide';
import { initTracker, openTracker, openTrackerForEdit, closeTracker, updateInstruments as updateTrackerInstruments, serializeTrackerState, deserializeTrackerState, previewTrackerStateOnce, previewArrangementStateOnce, primePreviewAudioContext, stopTrackerPreviewPlayback } from './tracker.js';
import { initBlocks, openBlocksModal, isBlocksModalOpen, saveBlock, updateBlock } from './blocks.js';
import JSZip from 'jszip';

const DEMO_MODE = import.meta.env.MODE === 'demo';
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
let autoSaveTimeout = null; // Debounce timer for auto-save
let isPreviewPlaying = false;
let playingSongFilename = null;
let pendingExternalUrl = null;
let statusFadeClearTimeout = null;
let renameDebounceTimeout = null;
let pendingUploadBundle = null;
let pendingUploadConflicts = null;

// --- DOM Elements ---
const dom = {
    repl: document.getElementById('repl'),
    sidebarTitle: document.getElementById('sidebarTitle'),
    songList: document.getElementById('songList'),
    songNameInput: document.getElementById('songNameInput'),
    playBtn: document.getElementById('playBtn'),
    exportBtn: document.getElementById('exportBtn'),
    newSongBtn: document.getElementById('newSongBtn'),
    statusMsg: document.getElementById('statusMsg'),
    demoModeBadge: document.getElementById('demoModeBadge'),
    
    // Views
    welcomeView: document.getElementById('welcomeView'),
    editorContainer: document.getElementById('editorContainer'),
    
    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    downloadProjectBtn: document.getElementById('downloadProjectBtn'),
    uploadProjectBtn: document.getElementById('uploadProjectBtn'),
    uploadProjectInput: document.getElementById('uploadProjectInput'),
    uploadProjectModal: document.getElementById('uploadProjectModal'),
    closeUploadProjectModalBtn: document.getElementById('closeUploadProjectModalBtn'),
    cancelUploadProjectBtn: document.getElementById('cancelUploadProjectBtn'),
    confirmUploadProjectBtn: document.getElementById('confirmUploadProjectBtn'),
    uploadProjectFilename: document.getElementById('uploadProjectFilename'),
    uploadProjectSummary: document.getElementById('uploadProjectSummary'),
    uploadProjectWarnings: document.getElementById('uploadProjectWarnings'),
    uploadIncludeSongs: document.getElementById('uploadIncludeSongs'),
    uploadIncludeBlocks: document.getElementById('uploadIncludeBlocks'),
    uploadIncludeArrangements: document.getElementById('uploadIncludeArrangements'),
    uploadIncludeInstruments: document.getElementById('uploadIncludeInstruments'),
    uploadModeMerge: document.getElementById('uploadModeMerge'),
    uploadModeReplace: document.getElementById('uploadModeReplace'),
    uploadInstrumentsKeep: document.getElementById('uploadInstrumentsKeep'),
    uploadInstrumentsReplace: document.getElementById('uploadInstrumentsReplace'),
    
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
    
    // Licensing Modal
    openLicenseModalBtn: document.getElementById('openLicenseModalBtn'),
    licenseAttributionModal: document.getElementById('licenseAttributionModal'),
    closeLicenseModalBtn: document.getElementById('closeLicenseModalBtn'),
    closeLicenseModalBottomBtn: document.getElementById('closeLicenseModalBottomBtn'),
    
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
};

// --- View State Helpers ---
function showWelcome() {
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    dom.playBtn.style.visibility = 'hidden';
    dom.exportBtn.disabled = true;
    
    updateSongSelectionState(false);
    dom.previewPlayBtn.disabled = true;
    if(dom.showJsonBtn) dom.showJsonBtn.disabled = true;
    
    // Clear state
    currentSongFilename = null;
    playingSongFilename = null;
    dom.songNameInput.classList.add('hidden');
    if(dom.repl.editor) dom.repl.editor.stop();
    renderPlayButton();
    updateSongListVisualizer();
    
    // Clear preview
    dom.previewJson.innerText = '';
    lastExportedData = null;
}

function showEditor() {
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'flex';
    dom.playBtn.style.visibility = 'visible';
    dom.exportBtn.disabled = false;
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
    if (DEMO_MODE && dom.newSongBtn) {
        dom.newSongBtn.style.display = 'none';
    }
    if (dom.demoModeBadge) {
        dom.demoModeBadge.hidden = !DEMO_MODE;
        dom.demoModeBadge.style.display = DEMO_MODE ? 'inline-flex' : 'none';
        dom.demoModeBadge.classList.toggle('hidden', !DEMO_MODE);
    }
    
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

    const instruments = {};
    const monophonicAliases = new Set();
    const defragged = getDefragmentedInstruments();

    defragged.forEach((inst) => {
        instruments[inst.strudelAlias] = inst.params;
        if (inst.monophonic) monophonicAliases.add(inst.strudelAlias);
    });

    // Reload into Strudel
    loadZzFXInstruments(instruments, { monophonicAliases });
    console.log('[ReplApp] Reloaded', Object.keys(instruments).length, 'instruments into Strudel');
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
    if (DEMO_MODE) return;
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
        const files = DEMO_MODE
            ? Array.from(demoSongSourceByFile.keys()).sort()
            : await (async () => {
                const res = await fetch('/api/songs');
                if (!res.ok) throw new Error('Failed to list songs');
                return res.json();
            })();
        
        dom.songList.innerHTML = '';
        files.forEach(file => {
            const fileName = decodeURIComponent(file.replace('.js', ''));
            const li = document.createElement('li');
            li.className = `song-item ${file === currentSongFilename ? 'active' : ''}`;
            
            li.innerHTML = DEMO_MODE
                ? `<span>${fileName}</span>`
                : `
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
            if (!DEMO_MODE) {
                li.querySelector('.sidebar-del-btn').onclick = (e) => {
                    e.stopPropagation();
                    showDeleteConfirmation(file);
                };
            }

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
        const isPlayingTarget =
            span &&
            playingSongFilename &&
            span.innerText === decodeURIComponent(playingSongFilename.replace('.js', ''));
        
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
        let fileCode = '';
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
        currentSongDisplayName = decodeURIComponent(filename.replace('.js', '')); // Store without extension
        originalSongName = currentSongDisplayName; // Track for rename detection
        dom.songNameInput.value = currentSongDisplayName;
        dom.songNameInput.readOnly = DEMO_MODE; // Demo mode is read-only for song management
        dom.songNameInput.placeholder = '';
        
        Array.from(dom.songList.children).forEach(li => {
            const span = li.querySelector('span');
            const isActive = span && span.innerText === decodeURIComponent(filename.replace('.js', ''));
            li.classList.toggle('active', isActive);
        });
        
        updateSongListVisualizer();
        
        if (dom.repl.editor) {
            dom.repl.editor.setCode(editorCode);
        } else {
            dom.repl.setAttribute('code', editorCode);
        }
        
        dom.exportBtn.disabled = false;
        
        // Clear preview and save status
        lastExportedData = null;
        dom.previewJson.innerText = "// Click GENERATE to create ZzFXM song";
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

    try {
        await fetch(`/api/song-meta/${currentSongFilename}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowsPerCycle })
        });
    } catch (e) {
        console.warn('Failed to save song meta', e);
    }
}

async function saveCurrentSong() {
    if (DEMO_MODE) return;
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

async function exportCurrentSong() {
    if (!currentSongFilename) return;
    
    validateCode(dom.repl.editor.code);
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        if (!confirm("Code contains unsafe functions for ZzFXM (e.g. reverb/delay). These will be ignored. Export anyway?")) return;
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
        
        // 5. Export!
        const result = exportPattern(pattern, bpm, instrumentArray, instrumentMapping, 8, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers,
            rowsPerCycle,
            monophonicByInstrumentIndex: monophonicByIndex
        });
        const songData = result.song;
        const {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases = []
        } = result.stats;
        
        // Store for preview
        lastExportedData = songData;
        lastExportedMeta = { monophonicByInstrumentIndex: monophonicByIndex };
        dom.previewJson.innerText = JSON.stringify(songData, null, 2);
        
        // 4. Send JSON to server (local mode only)
        const jsonFilename = currentSongFilename.replace('.js', '.json');
        if (!DEMO_MODE) {
            const res = await fetch(`/api/save-exported/${jsonFilename}`, {
                method: 'POST',
                body: JSON.stringify(songData)
            });
            if (!res.ok) throw new Error('Server failed to save JSON');
        }
        
        // Enable preview playback buttons
        // Enable preview playback buttons
        dom.previewPlayBtn.disabled = false;
        if(dom.showJsonBtn) dom.showJsonBtn.disabled = false;
        
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

function openModal() {
    dom.newSongModal.classList.add('open');
    dom.newSongName.focus();
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

function buildBlockSourceFromApi(item) {
    const name = item?.name || 'Block';
    const description = item?.description || '';
    const pattern = item?.pattern || '';
    const trackerState = item?.trackerState ?? null;
    return `// Block: ${name}
// ${description || 'No description'}

export const name = "${String(name).replace(/"/g, '\\"')}";
export const description = "${String(description).replace(/"/g, '\\"')}";

export const pattern = \`${String(pattern).replace(/`/g, '\\`')}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;
}

function buildArrangementSourceFromApi(item) {
    const name = item?.name || 'Arrangement';
    const arrangementState = item?.arrangementState ?? null;
    return `// Arrangement: ${name}

export const name = "${String(name).replace(/"/g, '\\"')}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;
}

function parseBlockSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const descMatch = content.match(/export\s+const\s+description\s*=\s*["']([^"']*)["']/);
    const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*([`"'])([\s\S]*?)\1\s*;?/);
    const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\})\s*;/);

    let trackerState = null;
    if (trackerStateMatch) {
        try { trackerState = JSON.parse(trackerStateMatch[1]); } catch (_e) { trackerState = null; }
    }

    return {
        name: nameMatch ? nameMatch[1] : 'Block',
        description: descMatch ? descMatch[1] : '',
        pattern: patternMatch ? patternMatch[2].trim() : '',
        trackerState
    };
}

function parseArrangementSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
    let arrangementState = { version: 1, name: nameMatch ? nameMatch[1] : 'Arrangement', bpm: 120, rows: [] };
    if (arrangementStateMatch) {
        try { arrangementState = JSON.parse(arrangementStateMatch[1]); } catch (_e) { /* keep fallback */ }
    }
    return {
        name: nameMatch ? nameMatch[1] : arrangementState?.name || 'Arrangement',
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
                return res.json();
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

        const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
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
    const unknownPaths = [];

    for (const entry of entries) {
        const normalized = normalizeZipEntryPath(entry.name);
        const content = await entry.async('string');
        if (!content.trim()) continue;

        if (normalized.toLowerCase().endsWith('/instruments.js') || normalized === 'instruments.js') {
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
        unknownPaths,
    };
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
        songs: new Set((songs || []).map((f) => String(f || '').toLowerCase())),
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
        const res = await fetch(`/api/song/${encodeURIComponent(filename)}`, { method: 'POST', body: content });
        return res.ok;
    }
    if (section === 'blocks') {
        const parsed = parseBlockSource(content);
        const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed),
        });
        return res.ok;
    }
    if (section === 'arrangements') {
        const parsed = parseArrangementSource(content);
        const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed),
        });
        return res.ok;
    }
    return false;
}

function closeUploadProjectModal() {
    pendingUploadBundle = null;
    pendingUploadConflicts = null;
    dom.uploadProjectModal?.classList.remove('open');
}

function openUploadProjectModal(bundle, conflicts) {
    pendingUploadBundle = bundle;
    pendingUploadConflicts = conflicts;

    if (dom.uploadProjectFilename) {
        dom.uploadProjectFilename.textContent = `File: ${bundle.fileName}`;
    }
    if (dom.uploadProjectSummary) {
        dom.uploadProjectSummary.textContent = `${bundle.songs.length} songs, ${bundle.blocks.length} blocks, ${bundle.arrangements.length} arrangements${bundle.instrumentsContent ? ', instruments.js' : ''}`;
    }

    const warnings = [];
    if (bundle.unknownPaths.length) warnings.push(`Ignored ${bundle.unknownPaths.length} unknown path(s).`);
    if (conflicts.songs > 0 || conflicts.blocks > 0 || conflicts.arrangements > 0) {
        warnings.push(`Conflicts found: ${conflicts.songs} songs, ${conflicts.blocks} blocks, ${conflicts.arrangements} arrangements.`);
    }
    if (DEMO_MODE) {
        warnings.push('Demo mode import updates in-browser session data only.');
    }

    if (dom.uploadProjectWarnings) {
        dom.uploadProjectWarnings.innerHTML = warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('');
        dom.uploadProjectWarnings.classList.toggle('hidden', warnings.length === 0);
    }

    const setToggleState = (input, enabled, checked) => {
        if (!input) return;
        input.disabled = !enabled;
        input.checked = enabled ? checked : false;
    };
    setToggleState(dom.uploadIncludeSongs, bundle.songs.length > 0, true);
    setToggleState(dom.uploadIncludeBlocks, bundle.blocks.length > 0, true);
    setToggleState(dom.uploadIncludeArrangements, bundle.arrangements.length > 0, true);
    setToggleState(dom.uploadIncludeInstruments, Boolean(bundle.instrumentsContent), Boolean(bundle.instrumentsContent));

    if (dom.uploadModeMerge) dom.uploadModeMerge.checked = true;
    if (dom.uploadModeReplace) dom.uploadModeReplace.checked = false;
    if (dom.uploadInstrumentsKeep) dom.uploadInstrumentsKeep.checked = true;
    if (dom.uploadInstrumentsReplace) dom.uploadInstrumentsReplace.checked = false;

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
    if (!pendingUploadBundle || !pendingUploadConflicts) return;

    const includeSongs = Boolean(dom.uploadIncludeSongs?.checked);
    const includeBlocks = Boolean(dom.uploadIncludeBlocks?.checked);
    const includeArrangements = Boolean(dom.uploadIncludeArrangements?.checked);
    const includeInstruments = Boolean(dom.uploadIncludeInstruments?.checked);

    if (!includeSongs && !includeBlocks && !includeArrangements && !includeInstruments) {
        setStatus('Select at least one data section to import', 'error');
        return;
    }

    const mode = dom.uploadModeReplace?.checked ? 'replace' : 'merge';
    const replaceInstruments = dom.uploadInstrumentsReplace?.checked;

    try {
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
        setStatus(`Upload failed: ${e.message}`, 'error');
    } finally {
        if (dom.uploadProjectInput) dom.uploadProjectInput.value = '';
    }
}

async function handleUploadSelection(file) {
    if (!file) return;
    try {
        const bundle = await buildUploadBundle(file);
        if (!bundle.songs.length && !bundle.blocks.length && !bundle.arrangements.length && !bundle.instrumentsContent) {
            setStatus('ZIP does not contain importable project data', 'error');
            return;
        }

        const existing = await getExistingNamesBySection();
        const conflicts = {
            songs: bundle.songs.filter((s) => existing.songs.has(s.filename.toLowerCase())).length,
            blocks: bundle.blocks.filter((b) => existing.blocks.has(b.filename.toLowerCase())).length,
            arrangements: bundle.arrangements.filter((a) => existing.arrangements.has(a.filename.toLowerCase())).length,
        };
        openUploadProjectModal(bundle, conflicts);
    } catch (e) {
        console.error(e);
        setStatus(`Upload failed: ${e.message}`, 'error');
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

dom.exportBtn.addEventListener('click', exportCurrentSong);
if (dom.downloadProjectBtn) dom.downloadProjectBtn.addEventListener('click', downloadSongsAndInstruments);
if (dom.uploadProjectBtn) dom.uploadProjectBtn.addEventListener('click', () => dom.uploadProjectInput?.click());
if (dom.uploadProjectInput) {
    dom.uploadProjectInput.addEventListener('change', (e) => {
        const file = e.target?.files?.[0];
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

dom.sidebarTitle.addEventListener('click', showWelcome);
dom.newSongBtn.addEventListener('click', openModal);
dom.cancelNewSong.addEventListener('click', closeModal);
dom.confirmNewSong.addEventListener('click', () => {
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
});
dom.newSongName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = dom.newSongName.value.trim();
    if (name) createNewSong(name);
});

// Delete Confirmation
let songToDelete = null;

function showDeleteConfirmation(filename) {
    songToDelete = filename;
    dom.deleteConfirmText.innerHTML = `File: <strong>${decodeURIComponent(filename)}</strong><br>This action is irreversible.`;
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
    if (renameDebounceTimeout) clearTimeout(renameDebounceTimeout);
    renameDebounceTimeout = setTimeout(() => {
        renameSong({ quiet: true });
    }, 1000);
});

// Save song name on Enter key
dom.songNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
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
        const files = await res.json();
        
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

    if (!lastExportedData) {
        setStatus('Nothing to play. Export a song first.', 'error');
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
    }, lastExportedMeta);
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
    } else if (isRunning) {
        // Another song is currently running. Switch to selected song and restart
        // from the beginning of the selected song's timeline.
        editor.stop();
        editor.evaluate();
        updatePlayState(true);
    } else {
        // Start selected song from the beginning.
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

export function isStrudelPlaybackActive() {
    const editor = dom.repl.editor;
    return Boolean(editor && editor.repl && editor.repl.scheduler && editor.repl.scheduler.started);
}

function renderPlayButton() {
    const editor = dom.repl.editor;
    // Use playingSongFilename logic: Show STOP only if running AND playing current song
    // Note: editor.repl.scheduler.started might be true (if playing another song)
    // But we only show STOP if matches current filename.
    const isRunning = editor && editor.repl.scheduler.started;
    const showStop = isRunning && playingSongFilename === currentSongFilename;
    
    dom.playBtn.innerHTML = showStop ? '<i data-lucide="square" class="w-5 h-5 fill-current"></i>' : '<i data-lucide="play" class="w-5 h-5 fill-current"></i>';
    dom.playBtn.style.color = '#eee';
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
        params: inst.params,
    }));
    
    initTracker(instrumentList);
}

/**
 * Setup tracker event listeners
 */
function setupTrackerEventListeners() {

    document.addEventListener('tracker:closed', (e) => {
        const { returnToBlocksOnClose } = e.detail || {};
        if (!returnToBlocksOnClose) return;
        if (isBlocksModalOpen()) return;
        openBlocksModal();
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
        params: inst.params,
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
        params: inst.params,
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

	    // Stop Strudel playback when entering the Blocks modal (avoids confusion with previews/exports).
	    document.addEventListener('blocks:modalOpen', () => {
	        const editor = dom.repl.editor;
	        if (editor && editor.repl.scheduler.started) {
	            editor.stop();
	            updatePlayState(false);
	        }
	    });

	    // Stop any tracker-based preview playback when exiting the Blocks modal.
	    document.addEventListener('blocks:modalClose', () => {
	        stopTrackerPreviewPlayback();
	    });
	    
	    // Listen for blocks:create event (from Blocks modal)
	    document.addEventListener('blocks:create', () => {
	        openTrackerModal();

    });
    
    // Listen for blocks:edit event (from Blocks modal)
    document.addEventListener('blocks:edit', async (e) => {
        const { block, trackerState } = e.detail;
        await openTrackerModalForEdit(block, trackerState);
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

	        previewTrackerStateOnce(trackerState, instrumentList, trackerState.bpm || 120);
	    });

	    // Listen for arrangements:preview event
	    document.addEventListener('arrangements:preview', async (e) => {
	        const { arrangement } = e.detail || {};
	        const arrangementState = arrangement?.arrangementState;
	        if (!arrangementState) return;

	        try {
	            setStatus(`Previewing arrangement "${arrangement?.name || 'arrangement'}"...`, 'normal');
	            console.log('[Arranger] Preview start:', arrangementState);
	            const { getDefragmentedInstruments } = await import('./instrument-manager.js');
	            const instruments = getDefragmentedInstruments();
	            const instrumentList = instruments.map(inst => ({
	                id: inst.strudelAlias,
	                name: inst.strudelAlias,
	                params: inst.params,
	            }));
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
	            let fetched = 0;
	            let playable = 0;
	            for (const filename of wantedBlockFiles) {
	                try {
	                    const res = await fetch(`/api/blocks/${filename}`);
	                    if (!res.ok) continue;
	                    fetched++;
	                    const block = await res.json();
	                    console.log('[Arranger] Preview fetched block:', filename, 'trackerState?', !!block?.trackerState);
	                    if (block?.trackerState) {
	                        trackerStateByFilename[filename] = block.trackerState;
	                        if (isPlayableTrackerState(block.trackerState)) playable++;
	                    }
	                } catch (err) {
	                    console.warn('[Arranger] Failed to fetch block for preview:', filename, err);
	                }
	            }

	            if (wantedBlockFiles.length > 0 && fetched === 0) {
	                setStatus('Arrangement preview failed: could not load blocks.', 'error');
	                return;
	            }
	            if (wantedBlockFiles.length > 0 && playable === 0) {
	                setStatus('Arrangement preview unavailable: blocks have no playable tracker data.', 'error');
	                return;
	            }

	            const bpm = arrangementState.bpm || 120;
	            console.log('[Arranger] Preview rendering. bpm:', bpm, 'blocks:', Object.keys(trackerStateByFilename).length);
	            previewArrangementStateOnce(arrangementState, trackerStateByFilename, instrumentList, bpm);
	        } catch (err) {
	            console.error('[Arranger] Preview failed:', err);
	            setStatus('Arrangement preview failed (see console).', 'error');
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



// Listen for tracker:saveBlock event (when saving edits)
document.addEventListener('tracker:saveBlock', async (e) => {
    const { isNewBlock, filename, name, description, pattern, trackerState } = e.detail;
    
    if (isNewBlock) {
        // Handle new block creation
        const success = await saveBlock(name, description || "Created in tracker", pattern, trackerState);
        if (success) {
            setStatus(`Block "${name}" created successfully`, 'success');
            // Close tracker and return to blocks list
            closeTracker();
            openBlocksModal();
        } else {
            setStatus('Failed to create block', 'error');
        }
    } else {
        // Handle existing block update
        // Update the block
        const success = await updateBlock(filename, name, description, pattern, trackerState);
        if (success) {
            setStatus(`Block "${name}" updated successfully`, 'success');
            // Close tracker and return to blocks list
            closeTracker();
            openBlocksModal();
        } else {
            setStatus('Failed to update block', 'error');
        }
    }
});

// Start
init();
