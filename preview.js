import { getAudioContext, initAudio, webaudioRepl, drawTimeScope, getAnalyserById } from "@strudel/webaudio"; 
import { songs } from "./songs/index.js";
import { instruments, instruments as instrumentMap } from "./instruments.js";
import { exportPattern } from "./src/export-logic.js";
import { initStrudel } from "./src/init.js";
import { loadZzFXInstruments } from "./src/zzfx-loader.js";

await initStrudel();

const repl = webaudioRepl();

const songSelect = document.getElementById('songSelect');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const exportBtn = document.getElementById('exportBtn');
const status = document.getElementById('status');
const canvas = document.getElementById('visualizer');

let currentPattern = null;
let currentBpm = 125;
let animationId = null;

// Populate Song Selector
Object.keys(songs).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    songSelect.appendChild(opt);
});

async function loadSong(id) {
    status.innerText = `⏳ Loading ${id}...`;
    try {
        const module = await songs[id]();
        currentPattern = module.pattern;
        currentBpm = module.bpm || 125;
        status.innerText = `✅ Loaded ${id}. Ready to play.`;
    } catch (e) {
        status.innerText = `❌ Error loading ${id}: ${e.message}`;
        console.error(e);
    }
}

// Strudel Visualizer Loop
function startVisualizer() {
    if (animationId) cancelAnimationFrame(animationId);
    
    // Auto-resize canvas to match its display size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    const ctx = canvas.getContext('2d');
    
    function draw() {
        const analyser = getAnalyserById(0); 
        
        if (analyser) {
            try {
                // Pass id: 0 to match the analyser we retrieved
                drawTimeScope(true, { 
                    ctx: ctx, 
                    id: 0,
                    color: '#00ff66',
                    thickness: 2,
                    align: true 
                });
            } catch (err) {
                // Fallback drawing if Strudel visualizer fails
                drawStaticLine(ctx);
            }
        } else {
            drawStaticLine(ctx);
        }
        animationId = requestAnimationFrame(draw);
    }
    
    function drawStaticLine(c) {
        c.fillStyle = '#000';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.strokeStyle = '#003311';
        c.beginPath();
        c.moveTo(0, canvas.height/2);
        c.lineTo(canvas.width, canvas.height/2);
        c.stroke();
    }
    
    draw();
}

async function playSong() {
    if (!currentPattern) {
        await loadSong(songSelect.value);
    }

    // Ensure audio is initialized
    await initAudio();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    // Load/Refresh ZzFX Instruments
    loadZzFXInstruments(instrumentMap);

    status.innerText = `🎵 Playing ${songSelect.value} at ${currentBpm} BPM...`;
    
    // In Strudel 1.x, we set the pattern on the repl.
    await repl.setPattern(currentPattern.cpm(currentBpm).orbit(0));
    
    startVisualizer();
}

function stopSong() {
    repl.stop();
    status.innerText = "🛑 Stopped.";
}

function exportSong() {
    if (!currentPattern) {
        status.innerText = "❌ Load a song first!";
        return;
    }

    status.innerText = "🍞 Exporting ZzFXM JSON...";
    const songData = exportPattern(currentPattern, currentBpm, instruments);
    
    // Download logic
    const blob = new Blob([JSON.stringify(songData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${songSelect.value}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    status.innerText = `✅ Exported ${songSelect.value}.json successfully!`;
}

// Bind Events
songSelect.addEventListener('change', () => {
    stopSong();
    loadSong(songSelect.value);
});

playBtn.addEventListener('click', playSong);
stopBtn.addEventListener('click', stopSong);
exportBtn.addEventListener('click', exportSong);

// Initial Load
loadSong(songSelect.value);

// HMR
if (import.meta.hot) {
    import.meta.hot.accept('./songs/index.js', () => window.location.reload());
}