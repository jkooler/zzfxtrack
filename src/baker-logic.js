import { noteToMidi } from '@strudel/core';

/**
 * Shared logic for converting a Strudel pattern into ZzFXM format.
 */

// Resolution increased to 48 (LCM of 16 and 12) to support triplets and 16th notes
const ROWS_PER_CYCLE = 48;
const BASE_RESOLUTION = 16; 
const MAX_ATTENUATION = 20;

export function bakePattern(pattern, bpm, instrumentArray, instrumentMapping, cycles = 8) {
    const totalRows = cycles * ROWS_PER_CYCLE;
    const events = pattern.queryArc(0, cycles);
    const tracks = {};

    console.log("Baker Stats:", {
        instrCount: instrumentArray?.length,
        mappingKeys: Object.keys(instrumentMapping || {}).length,
        mappingPreview: instrumentMapping
    });

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
                // Calculate Base MIDI of the instrument
                // ZzFX Freq is param index 2
                // instrumentArray passed to function
                let baseFreq = 440;
                if (instrumentArray && instrumentArray[instIndex]) {
                    baseFreq = instrumentArray[instIndex][2] || 440;
                }
                
                // Formula: 12 * log2(freq / 440) + 69
                const baseMidi = 12 * Math.log2(baseFreq / 440) + 69;
                
                // Shift = Target - Base
                semitone = midiNote - baseMidi;
                
                // Round to integer for ZzFXM format?
                // ZzFXM player usually handles floats?
                // Standard ZzFXM is integers (semitones).
                // But my player uses float math: Math.pow(2, semitone/12).
                // So keeping precision is good!
                // But ZzFXM format might expect int. 
                // Let's keep it float for accuracy.
                // Wait, tracks[instIndex][gridIndex] = [inst, atten, semi].
                // If I put float, JSON stringify keeps it.
            }
            
            // Velocity (Mapped to Attenuation)
            let gain = (typeof e.value.gain !== 'undefined') ? e.value.gain : 1;
            let attenuation = Math.floor((1 - gain) * MAX_ATTENUATION);

            // ZzFXMicro Pattern Format: [Instrument, Attenuation, Note]
            tracks[instIndex][gridIndex] = [instIndex, attenuation, semitone];
        }
    });

    // Flatten to Channel Arrays (Must preserve index alignment!)
    // If we have instrument 7, we need channels 0-7.
    // Find max index
    const maxIndex = Object.keys(tracks).length > 0 ? Math.max(...Object.keys(tracks).map(Number)) : -1;
    
    const patternData = [];
    if (maxIndex >= 0) {
        for(let i=0; i<=maxIndex; i++) {
            if (tracks[i]) {
                patternData.push(tracks[i]);
            } else {
                // Empty channel (Silence)
                // ZzFXM expects [0, 0, 0] entries usually.
                // Our loop above fills existing tracks with 0.
                // So we just need a new array of 0s?
                // Wait, tracks[i][gridIndex] = [inst, atten, semi].
                // 0 means silence/no note?
                // Usually [0,0,0] is a 'no op' or treated as rest?
                // ZzFXM player: "if (n)" (note exists).
                // If the array is full of 0s. 0 is falsy.
                // But wait, n is an array? [inst, atten, semi].
                // If element is 0 (number), it's not an array.
                patternData.push(Array(totalRows).fill(0));
            }
        }
    }

    // Pad channels (Optional, as all are equal length now due to Array(totalRows))
    // But good to be safe.
    const maxLen = totalRows;
    patternData.forEach(ch => {
        while(ch.length < maxLen) ch.push(0);
    });

    // Scale BPM based on resolution increase
    // 48 / 16 = 3
    const bpmScale = ROWS_PER_CYCLE / BASE_RESOLUTION;

    // --- THE ZzFXMicro SONG STRUCTURE ---
    return [
        instrumentArray, // 0: Instruments
        [patternData],   // 1: Patterns
        [0],             // 2: Sequence
        bpm * bpmScale   // 3: BPM
    ];
}
