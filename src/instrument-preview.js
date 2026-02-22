import { zzfxG } from './zzfx-loader.js';

/**
 * Instrument Preview
 * Plays test notes for instrument editing without interfering with Strudel playback
 */

let previewAudioContext = null;
let previewSources = new Set();
let previewTimeout = null;
let previewAnalyser = null;
let currentPreviewAlias = null;

/**
 * Initialize audio context for preview
 */
function getPreviewAudioContext() {
    if (!previewAudioContext) {
        previewAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return previewAudioContext;
}

/**
 * Get or create the preview analyser (for scope visualization). Connected to destination so scope can read from it.
 */
function getPreviewAnalyser() {
    const ctx = getPreviewAudioContext();
    if (!previewAnalyser) {
        previewAnalyser = ctx.createAnalyser();
        previewAnalyser.fftSize = 256;
        previewAnalyser.smoothingTimeConstant = 0.5;
        previewAnalyser.connect(ctx.destination);
    }
    return previewAnalyser;
}

/**
 * Stop currently playing test note
 */
export function stopTestNote() {
    if (currentPreviewAlias) {
        document.dispatchEvent(new CustomEvent('instrument-preview:end', { detail: { alias: currentPreviewAlias } }));
        currentPreviewAlias = null;
    }
    previewSources.forEach((source) => {
        try {
            source.stop();
        } catch (e) {
            // Already stopped
        }
    });
    previewSources.clear();
}

/**
 * Play a test note with given ZzFX parameters
 * @param {Array} params - ZzFX parameters (21 numbers)
 * @param {number} frequency - Test frequency in Hz (default: 440)
 * @param {string} [instrumentAlias] - Instrument alias for scope visualization (scope will show preview waveform)
 */
export function playTestNote(params, frequency = null, gain = 1, delaySeconds = 0, allowOverlap = false, instrumentAlias = null) {
    if (!allowOverlap) {
        stopTestNote();
    }
    
    try {
        const ctx = getPreviewAudioContext();
        
        // Clone params
        const testParams = [...params];
        
        // Only override frequency if explicitly provided
        if (frequency !== null) {
            testParams[2] = frequency;
        }
        // Otherwise use the instrument's own frequency (params[2])
        
        // Ensure we have all 21 parameters
        while (testParams.length < 21) testParams.push(0);
        
        // Generate sound using ZzFXG
        const samples = zzfxG(...testParams);
        
        if (!samples || samples.length === 0) {
            console.warn('[InstrumentPreview] No samples generated');
            return;
        }
        
        // Create audio buffer
        const buffer = ctx.createBuffer(1, samples.length, 44100);
        buffer.getChannelData(0).set(samples);
        
        // Route through analyser so scope can visualize preview
        const analyser = getPreviewAnalyser();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Number.isFinite(gain) ? gain : 1);
        source.connect(gainNode);
        gainNode.connect(analyser);
        const startTime = ctx.currentTime + Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0);
        source.start(startTime);
        
        previewSources.add(source);
        currentPreviewAlias = instrumentAlias ?? null;
        if (currentPreviewAlias) {
            document.dispatchEvent(new CustomEvent('instrument-preview:start', { detail: { alias: currentPreviewAlias, analyser } }));
        }
        
        source.onended = () => {
            previewSources.delete(source);
            if (currentPreviewAlias) {
                document.dispatchEvent(new CustomEvent('instrument-preview:end', { detail: { alias: currentPreviewAlias } }));
                currentPreviewAlias = null;
            }
        };
        
        console.log('[InstrumentPreview] Playing test note at', testParams[2], 'Hz');
    } catch (e) {
        console.error('[InstrumentPreview] Failed to play test note:', e);
    }
}

/**
 * Play test note with debouncing (for auto-preview on parameter change)
 * @param {Array} params - ZzFX parameters
 * @param {number} frequency - Test frequency
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 300)
 * @param {string} [instrumentAlias] - Instrument alias for scope visualization
 */
export function playTestNoteDebounced(params, frequency = null, debounceMs = 300, instrumentAlias = null) {
    // Clear existing timeout
    if (previewTimeout) {
        clearTimeout(previewTimeout);
    }
    
    // Set new timeout
    previewTimeout = setTimeout(() => {
        playTestNote(params, frequency, 1, 0, false, instrumentAlias);
        previewTimeout = null;
    }, debounceMs);
}

/**
 * Resume audio context (needed for user interaction requirement)
 */
export function resumePreviewAudio() {
    const ctx = getPreviewAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
}
