import { zzfxG } from './zzfx-loader.js';

/**
 * Instrument Preview
 * Plays test notes for instrument editing without interfering with Strudel playback
 */

let previewAudioContext = null;
let previewSources = new Set();
let previewTimeout = null;

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
 * Stop currently playing test note
 */
export function stopTestNote() {
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
 */
export function playTestNote(params, frequency = null, gain = 1, delaySeconds = 0, allowOverlap = false) {
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
        
        // Create and play source
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Number.isFinite(gain) ? gain : 1);
        source.connect(gainNode).connect(ctx.destination);
        const startTime = ctx.currentTime + Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0);
        source.start(startTime);
        
        previewSources.add(source);
        
        // Auto-cleanup when finished
        source.onended = () => {
            previewSources.delete(source);
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
 */
export function playTestNoteDebounced(params, frequency = null, debounceMs = 300) {
    // Clear existing timeout
    if (previewTimeout) {
        clearTimeout(previewTimeout);
    }
    
    // Set new timeout
    previewTimeout = setTimeout(() => {
        playTestNote(params, frequency);
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
