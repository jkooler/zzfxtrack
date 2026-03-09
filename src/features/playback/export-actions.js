/**
 * Module: features/playback/export-actions
 * Purpose: Export duration/size estimation and warning-message helper utilities.
 */

import { stripQuotedStrings } from '../../shared/code-transform-utils.js';

/** Duration (seconds) above which we show the export length warning (5 min). */
const EXPORT_LENGTH_WARNING_DURATION_SEC = 300;
/** Max cycles above which we show the export length warning. */
const EXPORT_LENGTH_WARNING_CYCLES = 512;
/** Cycles above which we show "large structure" message; below = "simple structure". */
const EXPORT_LENGTH_LARGE_STRUCTURE_CYCLES = 256;

export function inferArrangeCyclesFromCode(code) {
    if (typeof code !== 'string' || !code.includes('arrange')) return null;
    const arrangeCallRegex = /\barrange\s*\(/g;
    let maxCycles = 0;
    let callMatch;

    while ((callMatch = arrangeCallRegex.exec(code)) !== null) {
        let i = arrangeCallRegex.lastIndex;
        let depth = 1;
        let quote = null;
        let escaped = false;

        while (i < code.length && depth > 0) {
            const ch = code[i];
            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === quote) {
                    quote = null;
                }
                i++;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                quote = ch;
                i++;
                continue;
            }
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            i++;
        }
        if (depth !== 0) continue;

        const argsSource = code.slice(arrangeCallRegex.lastIndex, i - 1);
        const argsSansStrings = stripQuotedStrings(argsSource);
        let sum = 0;
        let tupleMatch;
        const tupleRegex = /\[\s*(\d+)\s*,/g;
        while ((tupleMatch = tupleRegex.exec(argsSansStrings)) !== null) {
            sum += Number(tupleMatch[1]);
        }
        if (sum > maxCycles) maxCycles = sum;
    }

    return maxCycles > 0 ? maxCycles : null;
}

export function getExportDurationSeconds(cycles, bpm) {
    if (!Number.isFinite(cycles) || !Number.isFinite(bpm) || bpm <= 0) return 0;
    return (cycles * 240) / bpm;
}

export function formatExportDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0 sec';
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    if (sec === 0) return `${min} min`;
    return `${min} min ${sec} sec`;
}

export function shouldWarnExportLength(cycles, bpm) {
    if (!Number.isFinite(cycles) || cycles <= 0) return false;
    const durationSec = getExportDurationSeconds(cycles, bpm);
    return durationSec > EXPORT_LENGTH_WARNING_DURATION_SEC || cycles > EXPORT_LENGTH_WARNING_CYCLES;
}

/** Rough estimate of ZzFXTrack Player JSON size in bytes (instruments + pattern data). */
export function estimateExportSizeBytes(cycles, rowsPerCycle, instrumentCount, channelCount) {
    const totalRows = cycles * rowsPerCycle;
    const instrumentBytes = Math.max(0, instrumentCount) * 280;
    const patternBytes = Math.max(0, channelCount) * totalRows * 14;
    return Math.ceil(instrumentBytes + patternBytes + 400);
}

export function formatExportSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
    return `~${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildExportLengthWarningMessage({ durationSec, cycles, bpm, estimatedSizeText }) {
    const durationStr = formatExportDuration(durationSec);
    const structureLine = cycles >= EXPORT_LENGTH_LARGE_STRUCTURE_CYCLES
        ? 'The song structure is large and uses lots of cycles. This can attribute to increased file size.'
        : 'The song structure is simple with a lower set of cycles. This will affect file size positively.';
    return `Your exported song duration exceeds 5 minutes. It will contribute to file size and can be unoptimal for small games or demos.\n\nTotal play time: about ${durationStr} (at ${bpm} BPM).\nEstimated export file size: ${estimatedSizeText}.\n\n${structureLine}`;
}
