import { noteToMidi } from '@strudel/core';

/**
 * Shared logic for converting a Strudel pattern into ZzFXTrack Player format.
 * Supports chord expansion: multiple notes at the same time on the same
 * instrument are allocated to separate voice channels.
 */

// Default resolution (supports 16th, 8th, 32nd, triplets)
const DEFAULT_ROWS_PER_CYCLE = 96;
const BASE_RESOLUTION = 16;
const MAX_ATTENUATION = 20;
/** Single upfront query window used for period detection and finite-length inference. */
const PERIOD_LOOKAHEAD_CYCLES = 64;
/** Quantization precision for robust structural comparisons. */
const TIME_QUANTIZE_DECIMALS = 6;

function toNumber(value) {
    if (value == null) return NaN;
    if (typeof value.valueOf === 'function') {
        const n = Number(value.valueOf());
        return Number.isFinite(n) ? n : NaN;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
}

function quantizeTime(value) {
    return Number(value.toFixed(TIME_QUANTIZE_DECIMALS));
}

function normalizeTriggerValue(value) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value && typeof value === 'object') return JSON.stringify(value);
    if (value == null) return '';
    return String(value);
}

function normalizePrimaryTrigger(eventValue) {
    const sampleRaw = eventValue?.s ?? eventValue?.sound ?? eventValue?.sample;
    const noteRaw = eventValue?.note ?? eventValue?.n;
    const sampleValue = normalizeTriggerValue(
        (typeof sampleRaw === 'string' || typeof sampleRaw === 'number') ? sampleRaw : ''
    );
    const noteValue = normalizeTriggerValue(
        (typeof noteRaw === 'string' || typeof noteRaw === 'number') ? noteRaw : ''
    );
    return `s:${sampleValue}|n:${noteValue}`;
}

function buildEventSignature(event, windowStart, windowEnd) {
    const begin = toNumber(event?.whole?.begin);
    const end = toNumber(event?.whole?.end);
    if (!Number.isFinite(begin) || !Number.isFinite(end)) return null;
    // Ignore cross-window carry notes for period detection.
    // They create edge artifacts (especially with slow/long notes) that can
    // make two otherwise identical windows look different.
    if (begin < windowStart || end > windowEnd) return null;

    const clampedBegin = quantizeTime(begin - windowStart);
    const clampedEnd = quantizeTime(end - windowStart);
    const noteValue = normalizeTriggerValue(event?.value?.note ?? event?.value?.n);
    const sampleValue = normalizeTriggerValue(event?.value?.s ?? event?.value?.sound ?? event?.value?.sample);
    return `${clampedBegin}|${clampedEnd}|n:${noteValue}|s:${sampleValue}`;
}

function signaturesForWindow(events, windowStart, periodCycles) {
    const windowEnd = windowStart + periodCycles;
    const signatures = [];
    for (const event of events) {
        const signature = buildEventSignature(event, windowStart, windowEnd);
        if (signature) signatures.push(signature);
    }
    signatures.sort();
    return signatures;
}

function signaturesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function detectPeriodCycles(events, lookaheadCycles, rowsPerCycle) {
    function buildWindowSignature(windowStart, periodCycles) {
        const periodRows = Math.floor(periodCycles * rowsPerCycle);
        if (periodRows <= 0) return [];
        const windowEnd = windowStart + periodCycles;
        const rows = Array.from({ length: periodRows }, () => []);

        for (const event of events) {
            const begin = toNumber(event?.whole?.begin);
            if (!Number.isFinite(begin) || begin < windowStart || begin >= windowEnd) continue;
            const relative = begin - windowStart;
            // Round to reduce float drift between repeated windows
            const row = Math.round(relative * rowsPerCycle);
            if (row < 0 || row >= periodRows) continue;
            rows[row].push(normalizePrimaryTrigger(event?.value));
        }
        for (const row of rows) row.sort();
        return rows;
    }

    const maxCandidate = Math.floor(lookaheadCycles / 2);
    for (let period = 1; period <= maxCandidate; period++) {
        const periodRows = Math.floor(period * rowsPerCycle);
        if (periodRows <= 0 || (period * 2) > lookaheadCycles) continue;
        const first = buildWindowSignature(0, period);
        const second = buildWindowSignature(period, period);
        if (!first.length || !second.length) continue;

        let hasActivity = false;
        let equal = true;
        for (let row = 0; row < periodRows; row++) {
            if ((first[row]?.length || 0) > 0 || (second[row]?.length || 0) > 0) hasActivity = true;
            if (!signaturesEqual(first[row] || [], second[row] || [])) {
                equal = false;
                break;
            }
        }
        if (hasActivity && equal) return period;
    }
    return null;
}

function getMaxEndCycle(events) {
    let maxEnd = 0;
    for (const event of events) {
        const end = toNumber(event?.whole?.end);
        if (Number.isFinite(end)) maxEnd = Math.max(maxEnd, end);
    }
    return maxEnd;
}

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
 * Export a Strudel pattern into ZzFXTrack Player format.
 * @param {Pattern} pattern - Strudel pattern
 * @param {number} bpm - Beats per minute
 * @param {Array} instrumentArray - Array of ZzFX instrument definitions
 * @param {Object} instrumentMapping - Map of instrument names to indices
 * @param {number} cycles - Number of cycles to export (default: 8)
 * @param {Object} options - Optional settings
 * @param {number} options.maxVoicesPerInstrument - Max voices per instrument (default: Infinity)
 * @param {Array} options.monophonicByInstrumentIndex - Boolean array aligned to instrumentArray (default: [])
 * @returns {Object} { song: ZzFXTrack Player song array, stats: { channelCount, droppedNotes } }
 */
export function exportPattern(pattern, bpm, instrumentArray, instrumentMapping, cycles = 8, options = {}) {
    const {
        maxVoicesPerInstrument = Infinity,
        normalizeUnisonLayers = false,
        rowsPerCycle = DEFAULT_ROWS_PER_CYCLE,
        monophonicByInstrumentIndex = [],
        forceCycles = null,
        rowCycleBoundaries = null,
        simpleExport = false
    } = options;

    const hasForcedCycles = Number.isFinite(forceCycles) && forceCycles > 0;
    // Single upfront query (avoid repeated expensive Strudel evaluations)
    const lookaheadCycles = hasForcedCycles ? Math.ceil(forceCycles) : PERIOD_LOOKAHEAD_CYCLES;
    const detectionEvents = pattern.queryArc(0, lookaheadCycles);
    const detectedPeriod = hasForcedCycles
        ? null
        : detectPeriodCycles(detectionEvents, lookaheadCycles, rowsPerCycle);
    const maxEndCycle = getMaxEndCycle(detectionEvents);
    const finiteCycles = maxEndCycle > 0 ? Math.ceil(maxEndCycle) : 0;

    // Choose export length:
    // - detected period for repeating patterns
    // - finite length when clearly shorter than lookahead
    // - fallback to caller intent (cycles, currently 8)
    let exportLengthMode = hasForcedCycles ? 'arrangement' : 'fallback';
    let exportCycles = hasForcedCycles
        ? Math.max(Math.floor(forceCycles), 1)
        : (detectedPeriod ?? Math.max(cycles, 1));
    if (!hasForcedCycles && detectedPeriod != null) {
        exportLengthMode = 'period';
    }
    if (!hasForcedCycles && detectedPeriod == null && finiteCycles > 0 && finiteCycles < lookaheadCycles) {
        exportCycles = Math.max(finiteCycles, 1);
        exportLengthMode = 'finite';
    }
    exportCycles = Math.min(exportCycles, lookaheadCycles);

    const totalRows = exportCycles * rowsPerCycle;
    const events = detectionEvents;
    
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
        normalizeUnisonLayers,
        detectedPeriod,
        finiteCycles,
        forcedCycles: hasForcedCycles ? Math.floor(forceCycles) : null,
        cycles: exportCycles,
        mode: exportLengthMode,
        lookaheadCycles,
        totalRows
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

    // Convert a dense channel array to sparse: { _: length, "index": [inst, atten, semi], ... }
    // so JSON has no repeated 0s (smaller file, like ZzFXM style).
    function denseChannelToSparse(arr) {
        const out = { _: arr.length };
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]) out[i] = arr[i];
        }
        return out;
    }

    // --- SEQUENCE & REUSABLE PATTERNS ---
    // Arrangement export: slice by row (block) boundaries so patterns = unique row contents,
    // sequence = which pattern per row. Pattern export: slice only when we have a detected
    // repeat period; otherwise one pattern, sequence [0].
    const useRowBoundaries = hasForcedCycles && Array.isArray(rowCycleBoundaries) && rowCycleBoundaries.length >= 2;
    const periodCycles = !useRowBoundaries && (detectedPeriod != null && exportCycles >= detectedPeriod && detectedPeriod > 0)
        ? detectedPeriod
        : null;
    const patternsList = [];
    const sequence = [];
    const patternSignatureToIndex = new Map();

    // Arrangement: either simple (one chunk per row = full repeats) or optimized (one chunk per cycle, deduped).
    if (useRowBoundaries) {
        if (simpleExport) {
            // Simple: one pattern per arrangement row (length = repeats × rowsPerCycle). Larger files, original behaviour.
            for (let i = 0; i < rowCycleBoundaries.length - 1; i++) {
                const startCycle = rowCycleBoundaries[i];
                const endCycle = rowCycleBoundaries[i + 1];
                const startRow = startCycle * rowsPerCycle;
                const endRow = Math.min(endCycle * rowsPerCycle, totalRows);
                const chunk = patternData.map(ch => ch.slice(startRow, endRow));
                const targetLen = endRow - startRow;
                chunk.forEach(ch => {
                    while (ch.length < targetLen) ch.push(0);
                });
                const sparseChunk = chunk.map(denseChannelToSparse);
                const signature = JSON.stringify(sparseChunk);
                if (patternSignatureToIndex.has(signature)) {
                    sequence.push(patternSignatureToIndex.get(signature));
                } else {
                    const idx = patternsList.length;
                    patternsList.push(sparseChunk);
                    patternSignatureToIndex.set(signature, idx);
                    sequence.push(idx);
                }
            }
        } else {
            // Optimized: one pattern per cycle (per repeat), deduped. Sequence has one entry per cycle.
            for (let i = 0; i < rowCycleBoundaries.length - 1; i++) {
                const startCycle = rowCycleBoundaries[i];
                const endCycle = rowCycleBoundaries[i + 1];
                for (let c = startCycle; c < endCycle; c++) {
                    const cycleStartRow = c * rowsPerCycle;
                    const cycleEndRow = Math.min((c + 1) * rowsPerCycle, totalRows);
                    const chunk = patternData.map(ch => ch.slice(cycleStartRow, cycleEndRow));
                    const targetLen = cycleEndRow - cycleStartRow;
                    chunk.forEach(ch => {
                        while (ch.length < targetLen) ch.push(0);
                    });
                    const sparseChunk = chunk.map(denseChannelToSparse);
                    const signature = JSON.stringify(sparseChunk);
                    if (patternSignatureToIndex.has(signature)) {
                        sequence.push(patternSignatureToIndex.get(signature));
                    } else {
                        const idx = patternsList.length;
                        patternsList.push(sparseChunk);
                        patternSignatureToIndex.set(signature, idx);
                        sequence.push(idx);
                    }
                }
            }
        }
    } else {
        const periodRows = periodCycles != null ? periodCycles * rowsPerCycle : totalRows;
        for (let start = 0; start < totalRows; start += periodRows) {
            const end = Math.min(start + periodRows, totalRows);
            const chunk = patternData.map(ch => ch.slice(start, end));
            const targetLen = end - start;
            chunk.forEach(ch => {
                while (ch.length < targetLen) ch.push(0);
            });
            const sparseChunk = chunk.map(denseChannelToSparse);
            const signature = JSON.stringify(sparseChunk);
            if (patternSignatureToIndex.has(signature)) {
                sequence.push(patternSignatureToIndex.get(signature));
            } else {
                const idx = patternsList.length;
                patternsList.push(sparseChunk);
                patternSignatureToIndex.set(signature, idx);
                sequence.push(idx);
            }
        }
    }

    if (patternsList.length === 0) {
        patternsList.push(patternData.map(ch => denseChannelToSparse(ch.slice())));
        sequence.push(0);
    }

    console.log("Exporter Output:", {
        channelCount,
        patternCount: patternsList.length,
        sequenceLength: sequence.length,
        droppedNotes,
        unknownInstrumentNotes,
        unknownInstrumentAliases: Array.from(unknownInstrumentAliases),
        maxVoicesPerInstrument: maxVoicesPerInstrument === Infinity ? 'unlimited' : maxVoicesPerInstrument
    });

    // --- THE ZzFXTrack PLAYER SONG STRUCTURE ---
    const song = [
        instrumentArray,  // 0: Instruments
        patternsList,     // 1: Patterns (array of patterns; same pattern can be reused via sequence)
        sequence,         // 2: Sequence (pattern indices to play in order)
        bpm * bpmScale    // 3: BPM
    ];
    
    return {
        song,
        stats: {
            channelCount,
            droppedNotes,
            unknownInstrumentNotes,
            unknownInstrumentAliases: Array.from(unknownInstrumentAliases),
            exportDebug: {
                mode: exportLengthMode,
                detectedPeriod,
                finiteCycles,
                lookaheadCycles,
                forcedCycles: hasForcedCycles ? Math.floor(forceCycles) : null,
                exportCycles,
                patternCount: patternsList.length,
                sequenceLength: sequence.length
            }
        }
    };
}
