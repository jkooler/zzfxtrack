/**
 * Module: features/patterns/pattern-meta
 * Purpose: Pattern metadata persistence and scope/name normalization helpers.
 */

import { getPatternMetaOrNull, savePatternMetaRecord } from '../../app/api.js';

let metaDeps = {
    isDemoMode: () => false,
    getCurrentPatternFilename: () => null,
    getCurrentPatternMetadata: () => ({
        title: '',
        author: '',
        contact: '',
        license: '',
    }),
    setCurrentPatternScope: () => {},
    setCurrentPatternMetadata: () => {},
    updatePatternNameReadOnly: () => {},
    sanitizePlaybackMixSettings: (v) => v,
    applyPlaybackMixSettingsToInputs: () => {},
    normalizePlaybackPresetId: () => null,
    inferPlaybackPresetId: () => null,
    setPlaybackPresetControl: () => {},
    applyWavSettings: () => {},
    applyExportResolutionRowsPerCycle: () => {},
    getRowsPerCycle: () => 96,
    getPlaybackMixSettings: () => ({}),
    getPlaybackPresetValue: () => null,
    getWavExportSettings: () => ({ sampleRate: 44100, bitDepth: 16 }),
    warn: () => {},
};

function normalizeScope(value) {
    return value === 'system' ? 'system' : 'user';
}

export function normalizePatternMetadata(value) {
    return {
        title: String(value?.title || '').trim(),
        author: String(value?.author || '').trim(),
        contact: String(value?.contact || '').trim(),
        license: String(value?.license || '').trim(),
    };
}

export function configurePatternMeta(options = {}) {
    metaDeps = { ...metaDeps, ...options };
}

export function normalizePatternBaseName(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function updatePatternScope(filename, scope) {
    const existing = await getPatternMetaOrNull(filename) || {};
    const updated = { ...(existing || {}), scope: normalizeScope(scope) };
    await savePatternMetaRecord(filename, updated);
}

export async function updatePatternAdvancedSettings(filename, { scope, metadata } = {}) {
    const existing = await getPatternMetaOrNull(filename) || {};
    const updated = {
        ...(existing || {}),
        scope: normalizeScope(scope),
        metadata: normalizePatternMetadata(metadata),
    };
    await savePatternMetaRecord(filename, updated);
}

export async function loadPatternMeta(filename) {
    metaDeps.setCurrentPatternMetadata(normalizePatternMetadata());
    try {
        const data = await getPatternMetaOrNull(filename);
        metaDeps.setCurrentPatternMetadata(normalizePatternMetadata(data?.metadata));
        if (!data) return;
        if (typeof data?.scope === 'string') {
            metaDeps.setCurrentPatternScope(normalizeScope(data.scope));
            metaDeps.updatePatternNameReadOnly();
        }
        const mixSettings = metaDeps.sanitizePlaybackMixSettings({
            targetPeak: data?.playbackTargetPeak,
            masterGainDb: data?.playbackMasterGainDb,
            softClipDrive: data?.playbackSoftClipDrive,
        });
        metaDeps.applyPlaybackMixSettingsToInputs(mixSettings);
        const savedPreset = typeof data?.playbackLoudnessPreset === 'string' ? data.playbackLoudnessPreset : null;
        const resolvedPreset = metaDeps.normalizePlaybackPresetId(savedPreset) || metaDeps.inferPlaybackPresetId(mixSettings) || 'custom';
        metaDeps.setPlaybackPresetControl(resolvedPreset);
        metaDeps.applyWavSettings(data?.wavSampleRate, data?.wavBitDepth);

        const rowsPerCycle = parseInt(data?.rowsPerCycle, 10);
        if (!rowsPerCycle || Number.isNaN(rowsPerCycle)) return;
        metaDeps.applyExportResolutionRowsPerCycle(rowsPerCycle);
    } catch (e) {
        metaDeps.warn('Failed to load pattern meta', e);
    }
}

export async function savePatternMeta() {
    const filename = metaDeps.getCurrentPatternFilename();
    if (!filename) return;

    const rowsPerCycle = metaDeps.getRowsPerCycle();
    const mixSettings = metaDeps.getPlaybackMixSettings();
    const presetId = metaDeps.normalizePlaybackPresetId(metaDeps.getPlaybackPresetValue())
        || metaDeps.inferPlaybackPresetId(mixSettings)
        || 'custom';
    const wavSettings = metaDeps.getWavExportSettings();

    try {
        const existing = await getPatternMetaOrNull(filename) || {};
        await savePatternMetaRecord(filename, {
            ...(existing || {}),
            metadata: normalizePatternMetadata(metaDeps.getCurrentPatternMetadata()),
            rowsPerCycle,
            playbackTargetPeak: mixSettings.targetPeak,
            playbackMasterGainDb: mixSettings.masterGainDb,
            playbackSoftClipDrive: mixSettings.softClipDrive,
            playbackLoudnessPreset: presetId,
            wavSampleRate: wavSettings.sampleRate,
            wavBitDepth: wavSettings.bitDepth,
        });
    } catch (e) {
        metaDeps.warn('Failed to save pattern meta', e);
    }
}
