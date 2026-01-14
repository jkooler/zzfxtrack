import { noteToMidi } from '@strudel/core';
import { instrumentMapping } from '../instruments.js';

/**
 * Shared logic for converting a Strudel pattern into ZzFXM format.
 */

const ROWS_PER_CYCLE = 16;
const MAX_ATTENUATION = 20;

export function bakePattern(pattern, bpm, instrumentArray, cycles = 4) {
    const totalRows = cycles * ROWS_PER_CYCLE;
    const events = pattern.queryArc(0, cycles);
    const tracks = {};

    events.forEach((e) => {
        let instIndex = 0;
        let s = e.value.s;
        
        if (typeof s !== 'undefined') {
            // Check mapping first
            if (instrumentMapping[s] !== undefined) {
                instIndex = instrumentMapping[s];
            } else {
                // Fallback to numeric parsing
                instIndex = parseInt(s);
                if (isNaN(instIndex)) instIndex = 0;
            }
        }
        
        // Ensure track exists
        if (!tracks[instIndex]) tracks[instIndex] = Array(totalRows).fill(0);

        const gridIndex = Math.floor(e.whole.begin.valueOf() * ROWS_PER_CYCLE);
        
        if (gridIndex < totalRows) {
            // Pitch
            let semitone = 0;
            const rawNote = e.value.note ?? e.value.n ?? 60;
            const midiNote = typeof rawNote === 'string' ? noteToMidi(rawNote) : rawNote;
            
            if (typeof midiNote === 'number' && !isNaN(midiNote)) {
                semitone = Math.round(midiNote) - 60;
            }
            
            // Velocity (Mapped to Attenuation)
            let gain = (typeof e.value.gain !== 'undefined') ? e.value.gain : 1;
            let attenuation = Math.floor((1 - gain) * MAX_ATTENUATION);

            // ZzFXMicro Pattern Format: [Instrument, Attenuation, Note]
            tracks[instIndex][gridIndex] = [instIndex, attenuation, semitone];
        }
    });

    // Flatten to Channel Arrays
    const patternData = Object.keys(tracks).sort((a,b) => parseInt(a)-parseInt(b)).map(k => tracks[k]);

    // Pad channels
    const maxLen = Math.max(...patternData.map(c => c.length), 0);
    patternData.forEach(ch => {
        while(ch.length < maxLen) ch.push(0);
    });

    // --- THE ZzFXMicro SONG STRUCTURE ---
    return [
        instrumentArray, // 0: Instruments
        [patternData],   // 1: Patterns
        [0],             // 2: Sequence
        bpm              // 3: BPM
    ];
}
