import { noteToMidi } from '@strudel/core';

/**
 * Shared logic for converting a Strudel pattern into ZzFXM format.
 * Supports chord expansion: multiple notes at the same time on the same
 * instrument are allocated to separate voice channels.
 */

// Default resolution (supports 16th, 8th, 32nd, triplets)
const DEFAULT_ROWS_PER_CYCLE = 96;
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
 * Export a Strudel pattern into ZzFXM format.
 * @param {Pattern} pattern - Strudel pattern
 * @param {number} bpm - Beats per minute
 * @param {Array} instrumentArray - Array of ZzFX instrument definitions
 * @param {Object} instrumentMapping - Map of instrument names to indices
 * @param {number} cycles - Number of cycles to export (default: 8)
 * @param {Object} options - Optional settings
 * @param {number} options.maxVoicesPerInstrument - Max voices per instrument (default: Infinity)
 * @param {Array} options.monophonicByInstrumentIndex - Boolean array aligned to instrumentArray (default: [])
 * @returns {Object} { song: ZzFXM song array, stats: { channelCount, droppedNotes } }
 */
export function exportPattern(pattern, bpm, instrumentArray, instrumentMapping, cycles = 8, options = {}) {
    const { maxVoicesPerInstrument = Infinity, normalizeUnisonLayers = false, rowsPerCycle = DEFAULT_ROWS_PER_CYCLE, monophonicByInstrumentIndex = [] } = options;
    
    const totalRows = cycles * rowsPerCycle;
    const events = pattern.queryArc(0, cycles);
    
    // Voice-aware track storage: { "instIndex-voice": Array[totalRows] }
    const tracks = {};
    // Tracks which voices are occupied at each position
    const voiceTracker = {};
    // Statistics
    let droppedNotes = 0;
    let unknownInstrumentNotes = 0;
    const unknownInstrumentAliases = new Set();

    console.log("Exporter Stats:", {
        instrCount: instrumentArray?.length,
        mappingKeys: Object.keys(instrumentMapping || {}).length,
        mappingPreview: instrumentMapping,
        normalizeUnisonLayers
    });

    // Helper to resolve instrument index from event
    function resolveInstIndex(e) {
        let s = e.value.s;
        if (typeof s === 'undefined') return 0;

        if (instrumentMapping?.[s] !== undefined) {
            return instrumentMapping[s];
        }

        const parsed = Number(s);
        if (Number.isInteger(parsed) && parsed >= 0) {
            return parsed;
        }

        // Unknown string alias (e.g. "bd"): mark invalid so caller can skip.
        return -1;
    }

    // Helper to calculate semitone shift for an event
    function calculateSemitone(e, instIndex) {
        let semitone = 0;
        const rawNote = e.value.note ?? e.value.n ?? 60;
        const midiNote = typeof rawNote === 'string' ? noteToMidi(rawNote) : rawNote;
        
        if (typeof midiNote === 'number' && !isNaN(midiNote)) {
            let baseFreq = 440;
            if (instrumentArray && instrumentArray[instIndex]) {
                baseFreq = instrumentArray[instIndex][2] || 440;
            }
            const baseMidi = 12 * Math.log2(baseFreq / 440) + 69;
            semitone = midiNote - baseMidi;
        }
        return semitone;
    }

    // --- PASS 1: Build unison map if normalization is enabled ---
    // Key: "instIndex-gridIndex-semitone", Value: count of identical notes
    const unisonMap = new Map();
    if (normalizeUnisonLayers) {
        events.forEach((e) => {
            const instIndex = resolveInstIndex(e);
            if (instIndex < 0 || instIndex >= (instrumentArray?.length || 0)) return;

            const gridIndex = Math.floor(e.whole.begin.valueOf() * rowsPerCycle);
            if (gridIndex < totalRows) {
                const semitone = Math.round(calculateSemitone(e, instIndex));
                const key = `${instIndex}-${gridIndex}-${semitone}`;
                unisonMap.set(key, (unisonMap.get(key) || 0) + 1);
            }
        });
    }

    // --- PASS 2: Process events ---
    events.forEach((e) => {
        const instIndex = resolveInstIndex(e);
        if (instIndex < 0 || instIndex >= (instrumentArray?.length || 0)) {
            unknownInstrumentNotes++;
            droppedNotes++;
            if (typeof e.value?.s === 'string' && e.value.s.trim()) {
                unknownInstrumentAliases.add(e.value.s.trim());
            }
            return;
        }
        const gridIndex = Math.floor(e.whole.begin.valueOf() * rowsPerCycle);
        
        if (gridIndex < totalRows) {
            const isMonophonic = Boolean(monophonicByInstrumentIndex?.[instIndex]);
            const voice = isMonophonic ? 0 : getAvailableVoice(voiceTracker, instIndex, gridIndex, maxVoicesPerInstrument);

            if (voice === -1) {
                // Limit reached, skip this note
                droppedNotes++;
                return;
            }

            const trackKey = `${instIndex}-${voice}`;
            
            // Ensure track exists
            if (!tracks[trackKey]) tracks[trackKey] = Array(totalRows).fill(0);

            // Pitch
            const semitone = calculateSemitone(e, instIndex);
            
            // Velocity (Mapped to Attenuation)
            let gain = (typeof e.value.gain !== 'undefined') ? e.value.gain : 1;
            
            // Apply unison normalization if enabled
            // Only affects identical notes (same instrument + same time + same pitch)
            if (normalizeUnisonLayers) {
                const unisonKey = `${instIndex}-${gridIndex}-${Math.round(semitone)}`;
                const unisonCount = unisonMap.get(unisonKey) || 1;
                if (unisonCount > 1) {
                    // Apply 1/sqrt(n) scaling for stacked identical notes
                    gain *= (1 / Math.sqrt(unisonCount));
                }
            }
            
            let attenuation = Math.floor((1 - gain) * MAX_ATTENUATION);

            // ZzFXMicro Pattern Format: [Instrument, Attenuation, Note]
            // Note: instIndex is the ORIGINAL instrument index, not the channel number
            if (isMonophonic && tracks[trackKey][gridIndex]) {
                // If multiple notes land on the same row (e.g. a chord), keep the highest pitch.
                droppedNotes++;
                const existingSemitone = tracks[trackKey][gridIndex][2];
                if (semitone > existingSemitone) {
                    tracks[trackKey][gridIndex] = [instIndex, attenuation, semitone];
                }
            } else {
                tracks[trackKey][gridIndex] = [instIndex, attenuation, semitone];
            }
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
    const bpmScale = rowsPerCycle / BASE_RESOLUTION;

    const channelCount = patternData.length;
    
    console.log("Exporter Output:", {
        channelCount,
        droppedNotes,
        unknownInstrumentNotes,
        unknownInstrumentAliases: Array.from(unknownInstrumentAliases),
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
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases: Array.from(unknownInstrumentAliases)
        }
    };
}
