import { zzfxG } from './zzfx-core.js';
import { dbToGain, sanitizePlaybackMixSettings, softClipSample } from './mix-settings.js';

/**
 * ZzFXTrack Player — ZzFX Music Renderer v2.0.3 by Frank Force 2019
 * Adapted from earlier work by Keith Clark and Frank Force (MIT License)
 * for ES Modules and ZzFXTrack Player export format. Uses ZzFXMicro (21-param) engine.
 * Original project by Keith Clark and Frank Force.
 */

// Max attenuation used in export-logic.js
const MAX_ATTENUATION = 20;

/**
 * Normalize song input: accept either legacy [instruments, patterns, sequence, BPM] or
 * wrapped format { song: [...], mix?: { targetPeak, masterGainDb, softClipDrive } }.
 * Returns { song: array, options: merged options (stored mix + caller options, caller overrides) }.
 */
function normalizeSongInput(song, options = {}) {
    if (!song) return { song: null, options };
    if (Array.isArray(song)) {
        return { song, options };
    }
    if (song && typeof song === 'object' && Array.isArray(song.song)) {
        const storedMix = song.mix != null ? sanitizePlaybackMixSettings(song.mix) : {};
        const mergedOptions = { ...storedMix, ...options };
        return { song: song.song, options: mergedOptions };
    }
    return { song: null, options };
}

export const buildSong = (song, options = {}) => {
    const { song: actualSong, options: mergedOptions } = normalizeSongInput(song, options);
    if (!actualSong) return null;
    let [instruments, patterns, sequence, BPM] = actualSong;
    const monophonicByInstrumentIndex = mergedOptions?.monophonicByInstrumentIndex || [];
    const mixSettings = sanitizePlaybackMixSettings(mergedOptions);
    const targetPeak = mixSettings.targetPeak;
    
    let sampleRate = 44100;
    let secondsPerBeat = 60 / BPM;
    // Exporter uses 16 rows per beat? No, 16 rows per CYCLE usually.
    // In Exporter Logic: ROWS_PER_CYCLE = 16.
    // One cycle is typically 1 bar (4 beats).
    // So 16 rows = 4 beats. -> 4 rows per beat. -> 16th notes.
    // So 1 row = 1/16th note.
    
    let samplesPerRow = (secondsPerBeat / 4) * sampleRate;
    
    // In our simplified exporter, patterns is `[patternData]`.
    // patternData is an array of channels.
    // sequence is `[0]`.
    
    // We iterate the sequence to build the full buffer.
    // Calculate total buffer length first.
    let totalRows = 0;
    sequence.forEach(patIndex => {
        let pattern = patterns[patIndex];
        // Pattern length is determined by channel length.
        // Assuming all channels same length.
        if (pattern && pattern.length > 0) {
            totalRows += pattern[0].length;
        }
    });

    let bufferLength = Math.ceil(totalRows * samplesPerRow);
    let mixBuffer = new Float32Array(bufferLength + sampleRate * 2); // Add 2s tail for release
    
    let currentSampleOffset = 0;

    // Used to avoid clicks when cutting monophonic notes at the next note boundary.
    const MONO_CUT_FADE_SAMPLES = Math.floor(sampleRate * 0.01); // ~10ms

    sequence.forEach((patIndex, seqIndex) => {
        let pattern = patterns[patIndex]; // Array of channels
        
        if (!pattern) return;

        // Iterate Channels
        pattern.forEach((channel, channelIndex) => {
            // Channel is array of note events: [InstrumentIndex, Attenuation, Semitone]

            // If an instrument is marked monophonic, cut its note at the next note-on in the same channel.
            const nextNoteAt = Array(channel.length).fill(null);
            let next = null;
            for (let i = channel.length - 1; i >= 0; i--) {
                nextNoteAt[i] = next;
                if (channel[i]) next = i;
            }
            
            for (let i = 0; i < channel.length; i++) {
                const noteData = channel[i];
                if (noteData) {
                    // noteData is [inst, atten, semi] or just [inst, atten, semi]
                    // Exporter: `tracks[instIndex][gridIndex] = [instIndex, attenuation, semitone];`
                    
                    let instIndex = noteData[0];
                    let attenuation = noteData[1];
                    let semitone = noteData[2];
                    
                    let params = instruments[instIndex];
                    if (params) {
                        let p = [...params];

                        // Pad parameters to prevent NaN in ZzFXG
                        while (p.length < 20) p.push(0);
                        
                        // Pitch shift logic
                        // ZzFXFreq = param[2]
                        // We need to calculate the Ratio (PlaybackRate) applied.
                        // Ratio = 2^(semitone/12).
                        const ratio = Math.pow(2, semitone/12);
                        
                        // ZzFX Params:
                        // 2: Frequency
                        // 8: Slide
                        // 9: Delta Slide
                        // 10: Pitch Jump
                        // 14: Modulation (Frequency)
                        
                        // Scale frequency components for pitch shifting
                        // Note: Slide, deltaSlide, pitchJump, and modulation are NOT scaled - they remain absolute
                        // Only the base frequency is scaled to achieve the target pitch
                        p[2] *= ratio;  // Freq
                        // p[8] *= ratio;  // Slide - REMOVED: should be absolute
                        // p[9] *= ratio;  // Delta Slide - REMOVED: should be absolute
                        // p[10] *= ratio; // Pitch Jump - REMOVED: should be absolute
                        // p[14] *= ratio; // Modulation Rate - REMOVED: should be absolute
                        
                        // Volume Attenuation
                        // vol = vol * (1 - atten/MAX)
                        p[0] *= (1 - (attenuation / MAX_ATTENUATION));
                        
                        // Store intended volume for normalization
                        // This preserves relative volume differences between instruments
                        const intendedVol = p[0];
                        
                        // Generate Samples
                        let sound = zzfxG(...p);
                        
                        // Per-note normalization.
                        // Normalize to target peak, then preserve intended volume differences.
                        // relative loudness between instruments (e.g., hi-hat 0.3 vs pad 0.5)
                        let maxAmp = 0;
                        for(let s=0; s<sound.length; s++) {
                             const abs = Math.abs(sound[s]);
                             if (abs > maxAmp) maxAmp = abs;
                        }
                        
                        if (maxAmp > 0) {
                            // Scale to target headroom, preserving intended volume.
                            const scale = (targetPeak / maxAmp) * intendedVol;
                            
                            for(let s=0; s<sound.length; s++) {
                                sound[s] *= scale;
                            }
                        }
                        
                        // Mix
                        let noteStart = Math.floor(currentSampleOffset + (i * samplesPerRow));
                        let mixLen = sound.length;
                        let monoCutFadeSamples = 0;
                        if (monophonicByInstrumentIndex?.[instIndex]) {
                            const nextRow = nextNoteAt[i];
                            if (typeof nextRow === 'number') {
                                const maxSamples = Math.floor((nextRow - i) * samplesPerRow);
                                mixLen = Math.min(mixLen, Math.max(0, maxSamples));
                                monoCutFadeSamples = Math.min(MONO_CUT_FADE_SAMPLES, mixLen);
                            }
                        }
                        for (let j=0; j<mixLen; j++) {
                            if (noteStart + j < mixBuffer.length) {
                                let sample = sound[j];
                                if (monoCutFadeSamples > 0 && j >= mixLen - monoCutFadeSamples) {
                                    if (monoCutFadeSamples === 1) {
                                        sample = 0;
                                    } else {
                                        const fadeStart = mixLen - monoCutFadeSamples;
                                        const t = (j - fadeStart) / (monoCutFadeSamples - 1); // 0..1
                                        sample *= (1 - t);
                                    }
                                }
                                mixBuffer[noteStart + j] += sample;
                            }
                        }
                    }
                }
            }
        });
        
        // Advance offset by pattern length
        if (pattern.length > 0) {
            currentSampleOffset += pattern[0].length * samplesPerRow;
        }
    });
    
    // Normalize Logic (copied from loader)
    let max = 0;
    for (let i=0; i<mixBuffer.length; i++) max = Math.max(max, Math.abs(mixBuffer[i]));
    if (max > 0) {
        let scale = targetPeak / max; // Safety margin
        for (let i=0; i<mixBuffer.length; i++) mixBuffer[i] *= scale;
    }

    const masterGain = dbToGain(mixSettings.masterGainDb);
    const clipDrive = mixSettings.softClipDrive;
    for (let i = 0; i < mixBuffer.length; i++) {
        mixBuffer[i] = softClipSample(mixBuffer[i] * masterGain, clipDrive);
    }
    
    return mixBuffer;
};


// Playback State
let playingSource = null;

export function playZzFXTrackSong(songData, audioCtx, onEnded, options = {}) {
    stopZzFXTrackSong();
    
    console.log("[ZzFXTrack Player] Building song...", songData);
    const pcm = buildSong(songData, options);
    if (!pcm) {
        console.error("[ZzFXTrack Player] Failed to build song");
        if (onEnded) onEnded();
        return;
    }
    
    const buffer = audioCtx.createBuffer(1, pcm.length, 44100);
    buffer.getChannelData(0).set(pcm);
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    
    playingSource = source;
    
    console.log(`[ZzFXTrack Player] Playing ${pcm.length} samples.`);
    
    source.onended = () => {
        if (playingSource === source) {
            playingSource = null;
            console.log("[ZzFXTrack Player] Ended.");
            if (onEnded) onEnded();
        }
    };
}

export function stopZzFXTrackSong() {
    if (playingSource) {
        try { playingSource.stop(); } catch(e){}
        playingSource = null;
        console.log("[ZzFXTrack Player] Stopped.");
    }
}
