import { zzfxG } from './zzfx-loader.js';

/**
 * ZzFX Music Renderer v2.0.3 by Frank Force 2019
 * Adapted for ES Modules and Strudel Baker format.
 */

// Max attenuation used in baker-logic.js
const MAX_ATTENUATION = 20;

export const buildSong = (song) => {
    // song structure: [instruments, patterns, sequence, BPM]
    if (!song) return null;
    let [instruments, patterns, sequence, BPM] = song;
    
    let sampleRate = 44100;
    let secondsPerBeat = 60 / BPM;
    // Baker uses 16 rows per beat? No, 16 rows per CYCLE usually.
    // In Baker Logic: ROWS_PER_CYCLE = 16.
    // Strudel cycle usually = 1 bar (4 beats).
    // So 16 rows = 4 beats. -> 4 rows per beat. -> 16th notes.
    // So 1 row = 1/16th note.
    
    let samplesPerRow = (secondsPerBeat / 4) * sampleRate;
    
    // In our simplified baker, patterns is `[patternData]`.
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

    sequence.forEach((patIndex, seqIndex) => {
        let pattern = patterns[patIndex]; // Array of channels
        
        if (!pattern) return;

        // Iterate Channels
        pattern.forEach((channel, channelIndex) => {
            // Channel is array of note events: [InstrumentIndex, Attenuation, Semitone]
            
            for (let i = 0; i < channel.length; i++) {
                const noteData = channel[i];
                if (noteData) {
                    // noteData is [inst, atten, semi] or just [inst, atten, semi]
                    // Baker: `tracks[instIndex][gridIndex] = [instIndex, attenuation, semitone];`
                    
                    let instIndex = noteData[0];
                    let attenuation = noteData[1];
                    let semitone = noteData[2];
                    
                    let params = instruments[instIndex];
                    if (params) {
                        let p = [...params];
                        
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
                        
                        // Scale ALL frequency components to match WebAudio playbackRate behavior
                        p[2] *= ratio;  // Freq
                        p[8] *= ratio;  // Slide
                        p[9] *= ratio;  // Delta Slide
                        p[10] *= ratio; // Pitch Jump
                        p[14] *= ratio; // Modulation Rate
                        
                        // Volume Attenuation
                        // vol = vol * (1 - atten/MAX)
                        p[0] *= (1 - (attenuation / MAX_ATTENUATION));
                        
                        // Generate Samples
                        let sound = zzfxG(...p);
                        
                        // Per-Note Normalization (Match Strudel Behavior)
                        // This ensures consistent volume regardless of ZzFX params
                        let maxAmp = 0;
                        for(let s=0; s<sound.length; s++) {
                             const abs = Math.abs(sound[s]);
                             if (abs > maxAmp) maxAmp = abs;
                        }
                        
                        if (maxAmp > 0) {
                            // Target Peak: 0.5 (Standard Strudel Headroom)
                            // Apply Attenuation Gain here
                             
                            // Formula:
                            // Normalized (0.5) * PatternGain (1 - atten/20)
                            let noteGain = 1.0;
                            noteGain *= (1 - (attenuation / MAX_ATTENUATION));
                            
                            const scale = (0.5 / maxAmp) * noteGain;
                            
                            for(let s=0; s<sound.length; s++) {
                                sound[s] *= scale;
                            }
                        }
                        
                        // Mix
                        let noteStart = Math.floor(currentSampleOffset + (i * samplesPerRow));
                        for (let j=0; j<sound.length; j++) {
                            if (noteStart + j < mixBuffer.length) {
                                mixBuffer[noteStart + j] += sound[j];
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
        let scale = 0.5 / max; // Safety margin
        for (let i=0; i<mixBuffer.length; i++) mixBuffer[i] *= scale;
    }
    
    return mixBuffer;
};


// Playback State
let playingSource = null;

export function playZzfxmSong(songData, audioCtx) {
    stopZzfxmSong();
    
    console.log("[ZzFXM] Building song...", songData);
    const pcm = buildSong(songData);
    if (!pcm) {
        console.error("[ZzFXM] Failed to build song");
        return;
    }
    
    const buffer = audioCtx.createBuffer(1, pcm.length, 44100);
    buffer.getChannelData(0).set(pcm);
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    
    playingSource = source;
    
    console.log(`[ZzFXM] Playing ${pcm.length} samples.`);
    
    source.onended = () => {
        if (playingSource === source) {
            playingSource = null;
            console.log("[ZzFXM] Ended.");
        }
    };
}

export function stopZzfxmSong() {
    if (playingSource) {
        try { playingSource.stop(); } catch(e){}
        playingSource = null;
        console.log("[ZzFXM] Stopped.");
    }
}
