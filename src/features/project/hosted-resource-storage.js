/**
 * Module: features/project/hosted-resource-storage
 * Purpose: Browser-local persistence for hosted/demo user resources.
 */

const PATTERN_SOURCES_KEY = 'zzfxtrack-hosted-pattern-sources-v1';
const PATTERN_META_KEY = 'zzfxtrack-hosted-pattern-meta-v1';
const BLOCK_SOURCES_KEY = 'zzfxtrack-hosted-block-sources-v1';
const ARRANGEMENT_SOURCES_KEY = 'zzfxtrack-hosted-arrangement-sources-v1';

function normalizeScope(value) {
    return value === 'system' ? 'system' : 'user';
}

function readRecordMap(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed;
    } catch (_e) {
        return {};
    }
}

function writeRecordMap(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function cloneJsonValue(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
}

function deleteRecordEntry(key, filename) {
    const records = readRecordMap(key);
    if (!(filename in records)) return false;
    delete records[filename];
    writeRecordMap(key, records);
    return true;
}

function moveRecordEntry(key, oldFilename, newFilename) {
    if (!oldFilename || !newFilename || oldFilename === newFilename) return true;
    const records = readRecordMap(key);
    if (!(oldFilename in records)) return false;
    records[newFilename] = records[oldFilename];
    delete records[oldFilename];
    writeRecordMap(key, records);
    return true;
}

export function listHostedPatternEntries() {
    const patternSources = readRecordMap(PATTERN_SOURCES_KEY);
    const patternMeta = readRecordMap(PATTERN_META_KEY);
    return Object.keys(patternSources)
        .sort((a, b) => a.localeCompare(b))
        .map((filename) => ({
            filename,
            scope: normalizeScope(patternMeta?.[filename]?.scope),
        }));
}

export function getHostedPatternSourceOrNull(filename) {
    const patternSources = readRecordMap(PATTERN_SOURCES_KEY);
    return typeof patternSources?.[filename] === 'string' ? patternSources[filename] : null;
}

export function saveHostedPatternSource(filename, content) {
    const patternSources = readRecordMap(PATTERN_SOURCES_KEY);
    patternSources[filename] = String(content || '');
    writeRecordMap(PATTERN_SOURCES_KEY, patternSources);
}

export function renameHostedPattern(oldFilename, newFilename) {
    const moved = moveRecordEntry(PATTERN_SOURCES_KEY, oldFilename, newFilename);
    if (!moved) return false;
    moveRecordEntry(PATTERN_META_KEY, oldFilename, newFilename);
    return true;
}

export function deleteHostedPattern(filename) {
    const deleted = deleteRecordEntry(PATTERN_SOURCES_KEY, filename);
    deleteRecordEntry(PATTERN_META_KEY, filename);
    return deleted;
}

export function getHostedPatternMetaOrNull(filename) {
    const patternMeta = readRecordMap(PATTERN_META_KEY);
    const value = patternMeta?.[filename];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return cloneJsonValue(value);
}

export function saveHostedPatternMetaRecord(filename, payload) {
    const patternMeta = readRecordMap(PATTERN_META_KEY);
    patternMeta[filename] = cloneJsonValue(payload || {});
    writeRecordMap(PATTERN_META_KEY, patternMeta);
}

export function listHostedBlocks(parseBlockSource) {
    const blockSources = readRecordMap(BLOCK_SOURCES_KEY);
    return Object.keys(blockSources)
        .sort((a, b) => a.localeCompare(b))
        .map((filename) => {
            const parsed = parseBlockSource(blockSources[filename] || '');
            return {
                filename,
                name: parsed?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
                description: parsed?.description || '',
                pattern: parsed?.pattern || '',
                trackerState: parsed?.trackerState ?? null,
                scope: normalizeScope(parsed?.scope),
            };
        });
}

export function getHostedBlockSourceOrNull(filename) {
    const blockSources = readRecordMap(BLOCK_SOURCES_KEY);
    return typeof blockSources?.[filename] === 'string' ? blockSources[filename] : null;
}

export function getHostedBlockDetailOrNull(filename, parseBlockSource) {
    const source = getHostedBlockSourceOrNull(filename);
    if (!source) return null;
    const parsed = parseBlockSource(source);
    return {
        filename,
        name: parsed?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
        description: parsed?.description || '',
        pattern: parsed?.pattern || '',
        trackerState: parsed?.trackerState ?? null,
        scope: normalizeScope(parsed?.scope),
    };
}

export function saveHostedBlockDetail(filename, payload, buildBlockSourceFromApi) {
    const blockSources = readRecordMap(BLOCK_SOURCES_KEY);
    blockSources[filename] = buildBlockSourceFromApi({
        filename,
        name: payload?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
        description: payload?.description || '',
        pattern: payload?.pattern || '',
        trackerState: payload?.trackerState ?? null,
        scope: normalizeScope(payload?.scope),
    });
    writeRecordMap(BLOCK_SOURCES_KEY, blockSources);
}

export function renameHostedBlock(oldFilename, newFilename) {
    return moveRecordEntry(BLOCK_SOURCES_KEY, oldFilename, newFilename);
}

export function deleteHostedBlock(filename) {
    return deleteRecordEntry(BLOCK_SOURCES_KEY, filename);
}

export function listHostedArrangements(parseArrangementSource) {
    const arrangementSources = readRecordMap(ARRANGEMENT_SOURCES_KEY);
    return Object.keys(arrangementSources)
        .sort((a, b) => a.localeCompare(b))
        .map((filename) => {
            const parsed = parseArrangementSource(arrangementSources[filename] || '');
            return {
                filename,
                name: parsed?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
                scope: normalizeScope(parsed?.scope),
                bpm: Number.isFinite(Number(parsed?.arrangementState?.bpm)) ? Number(parsed.arrangementState.bpm) : 120,
                arrangementState: parsed?.arrangementState ?? null,
            };
        });
}

export function getHostedArrangementSourceOrNull(filename) {
    const arrangementSources = readRecordMap(ARRANGEMENT_SOURCES_KEY);
    return typeof arrangementSources?.[filename] === 'string' ? arrangementSources[filename] : null;
}

export function getHostedArrangementDetailOrNull(filename, parseArrangementSource) {
    const source = getHostedArrangementSourceOrNull(filename);
    if (!source) return null;
    const parsed = parseArrangementSource(source);
    return {
        filename,
        name: parsed?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
        scope: normalizeScope(parsed?.scope),
        bpm: Number.isFinite(Number(parsed?.arrangementState?.bpm)) ? Number(parsed.arrangementState.bpm) : 120,
        arrangementState: parsed?.arrangementState ?? null,
    };
}

export function saveHostedArrangementDetail(filename, payload, buildArrangementSourceFromApi) {
    const arrangementSources = readRecordMap(ARRANGEMENT_SOURCES_KEY);
    arrangementSources[filename] = buildArrangementSourceFromApi({
        filename,
        name: payload?.name || decodeURIComponent(filename.replace(/\.js$/i, '')),
        arrangementState: payload?.arrangementState ?? null,
        scope: normalizeScope(payload?.scope),
    });
    writeRecordMap(ARRANGEMENT_SOURCES_KEY, arrangementSources);
}

export function renameHostedArrangement(oldFilename, newFilename) {
    return moveRecordEntry(ARRANGEMENT_SOURCES_KEY, oldFilename, newFilename);
}

export function deleteHostedArrangement(filename) {
    return deleteRecordEntry(ARRANGEMENT_SOURCES_KEY, filename);
}
