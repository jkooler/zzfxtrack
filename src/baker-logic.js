import { noteToMidi } from '@strudel/core';

/**
 * Shared logic for converting a Strudel pattern into ZzFXM format.
 * Supports chord expansion: multiple notes at the same time on the same
 * instrument are allocated to separate voice channels.
 */

// Resolution increased to 48 (LCM of 16 and 12) to support triplets and 16th notes
const ROWS_PER_CYCLE = 48;
const BASE_RESOLUTION = 16; 
const MAX_ATTENUATION = 20;

/**
 * Find an available voice for an instrument at a specific grid position.
 * @param {Object} voiceTracker - Tracks which voices are used at each position
 * @param {number} instIndex - Instrument index
 * @param {number} gridIndex - Grid/row position
 * @param {number} maxVoices - Maximum voices per instrument (Infinity = unlimited)
 * @returns {number} Voice number (0, 1, 2...) or -1 if limit reached
 */
function getAvailableVoice(voiceTracker, instIndex, gridIndex, maxVoices = Infinity) {
    const key = `${instIndex}`;
    if (!voiceTracker[key]) voiceTracker[key] = {};

    // Find next available voice for this instrument at this time
    let voice = 0;
    while (voiceTracker[key][`${gridIndex}-${voice}`]) {
        voice++;
    }
    
    // Apply limit if set (for js13k mode)
    if (voice >= maxVoices) {
        return -1; // Signal: cannot allocate, skip this note
    }
    
    voiceTracker[key][`${gridIndex}-${voice}`] = true;
    return voice;
}

/**
 * Bake a Strudel pattern into ZzFXM format.
 * @param {Pattern} pattern - Strudel pattern
 * @param {number} bpm - Beats per minute
 * @param {Array} instrumentArray - Array of ZzFX instrument definitions
 * @param {Object} instrumentMapping - Map of instrument names to indices
 * @param {number} cycles - Number of cycles to bake (default: 8)
 * @param {Object} options - Optional settings
 * @param {number} options.maxVoicesPerInstrument - Max voices per instrument (default: Infinity)
 * @returns {Object} { song: ZzFXM song array, stats: { channelCount, droppedNotes } }
 */
export function bakePattern(pattern, bpm, instrumentArray, instrumentMapping, cycles = 8, options = {}) {
    const { maxVoicesPerInstrument = Infinity } = options;
    
    const totalRows = cycles * ROWS_PER_CYCLE;
    const events = pattern.queryArc(0, cycles);
    
    // Voice-aware track storage: { "instIndex-voice": Array[totalRows] }
    const tracks = {};
    // Tracks which voices are occupied at each position
    const voiceTracker = {};
    // Statistics
    let droppedNotes = 0;

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

        const gridIndex = Math.floor(e.whole.begin.valueOf() * ROWS_PER_CYCLE);
        
        if (gridIndex < totalRows) {
            // Get available voice for this instrument at this position
            const voice = getAvailableVoice(voiceTracker, instIndex, gridIndex, maxVoicesPerInstrument);
            
            if (voice === -1) {
                // Limit reached, skip this note
                droppedNotes++;
                return;
            }
            
            const trackKey = `${instIndex}-${voice}`;
            
            // Ensure track exists
            if (!tracks[trackKey]) tracks[trackKey] = Array(totalRows).fill(0);

            // Pitch
            let semitone = 0;
            const rawNote = e.value.note ?? e.value.n ?? 60;
            const midiNote = typeof rawNote === 'string' ? noteToMidi(rawNote) : rawNote;
            
            if (typeof midiNote === 'number' && !isNaN(midiNote)) {
                // Calculate Base MIDI of the instrument
                // ZzFX Freq is param index 2
                let baseFreq = 440;
                if (instrumentArray && instrumentArray[instIndex]) {
                    baseFreq = instrumentArray[instIndex][2] || 440;
                }
                
                // Formula: 12 * log2(freq / 440) + 69
                const baseMidi = 12 * Math.log2(baseFreq / 440) + 69;
                
                // Shift = Target - Base
                semitone = midiNote - baseMidi;
            }
            
            // Velocity (Mapped to Attenuation)
            let gain = (typeof e.value.gain !== 'undefined') ? e.value.gain : 1;
            let attenuation = Math.floor((1 - gain) * MAX_ATTENUATION);

            // ZzFXMicro Pattern Format: [Instrument, Attenuation, Note]
            // Note: instIndex is the ORIGINAL instrument index, not the channel number
            tracks[trackKey][gridIndex] = [instIndex, attenuation, semitone];
        }
    });

    // Flatten voice tracks to continuous channel array
    // Sort by instrument index, then voice number
    const trackKeys = Object.keys(tracks).sort((a, b) => {
        const [instA, voiceA] = a.split('-').map(Number);
        const [instB, voiceB] = b.split('-').map(Number);
        if (instA !== instB) return instA - instB;
        return voiceA - voiceB;
    });
    
    const patternData = trackKeys.map(key => tracks[key]);
    
    // Handle empty pattern
    if (patternData.length === 0) {
        patternData.push(Array(totalRows).fill(0));
    }

    // Pad channels (safety check)
    const maxLen = totalRows;
    patternData.forEach(ch => {
        while(ch.length < maxLen) ch.push(0);
    });

    // Scale BPM based on resolution increase
    const bpmScale = ROWS_PER_CYCLE / BASE_RESOLUTION;

    const channelCount = patternData.length;
    
    console.log("Baker Output:", {
        channelCount,
        droppedNotes,
        maxVoicesPerInstrument: maxVoicesPerInstrument === Infinity ? 'unlimited' : maxVoicesPerInstrument
    });

    // --- THE ZzFXMicro SONG STRUCTURE ---
    const song = [
        instrumentArray, // 0: Instruments
        [patternData],   // 1: Patterns
        [0],             // 2: Sequence
        bpm * bpmScale   // 3: BPM
    ];
    
    return {
        song,
        stats: {
            channelCount,
            droppedNotes
        }
    };
}
