/**
 * Module: features/playback/export-settings
 * Purpose: Export settings modal behavior and playback/WAV settings normalization.
 */

let deps = {
    getDom: () => ({}),
    sanitizePlaybackMixSettings: (value) => value,
    getPlaybackLoudnessPresets: () => ({}),
    getDefaultPlaybackPresetId: () => 'balanced',
    savePatternMeta: async () => {},
    updateArrangementPreview: () => {},
    isTrackerPreviewPlaying: () => false,
    refreshTrackerPreview: () => {},
};

let exportSettingsSnapshot = null;

export function configureExportSettings(options = {}) {
    deps = { ...deps, ...options };
}

export function getPlaybackMixSettings() {
    const dom = deps.getDom();
    return deps.sanitizePlaybackMixSettings({
        targetPeak: dom.playbackTargetPeak?.value,
        masterGainDb: dom.playbackMasterGainDb?.value,
        softClipDrive: dom.playbackSoftClipDrive?.value,
    });
}

export function getWavExportSettings() {
    const dom = deps.getDom();
    const sampleRate = parseInt(dom.wavSampleRate?.value, 10);
    const bitDepth = parseInt(dom.wavBitDepth?.value, 10);
    return {
        sampleRate: [8000, 11025, 16000, 22050, 32000, 44100, 48000].includes(sampleRate) ? sampleRate : 44100,
        bitDepth: [8, 16, 24].includes(bitDepth) ? bitDepth : 16,
    };
}

export function normalizePlaybackPresetId(value) {
    const key = String(value || '').trim();
    if (!key || key === 'custom') return key || null;
    const presets = deps.getPlaybackLoudnessPresets();
    return Object.prototype.hasOwnProperty.call(presets, key) ? key : null;
}

function approxEqual(a, b, epsilon = 1e-6) {
    return Math.abs(Number(a) - Number(b)) <= epsilon;
}

export function inferPlaybackPresetId(settings) {
    const clean = deps.sanitizePlaybackMixSettings(settings);
    const entries = Object.entries(deps.getPlaybackLoudnessPresets());
    for (const [presetId, presetSettings] of entries) {
        const p = deps.sanitizePlaybackMixSettings(presetSettings);
        if (
            approxEqual(clean.targetPeak, p.targetPeak)
            && approxEqual(clean.masterGainDb, p.masterGainDb)
            && approxEqual(clean.softClipDrive, p.softClipDrive)
        ) {
            return presetId;
        }
    }
    return 'custom';
}

export function applyPlaybackMixSettingsToInputs(settings) {
    const dom = deps.getDom();
    const clean = deps.sanitizePlaybackMixSettings(settings);
    if (dom.playbackTargetPeak) dom.playbackTargetPeak.value = String(clean.targetPeak);
    if (dom.playbackMasterGainDb) dom.playbackMasterGainDb.value = String(clean.masterGainDb);
    if (dom.playbackSoftClipDrive) dom.playbackSoftClipDrive.value = String(clean.softClipDrive);
}

export function setPlaybackPresetControl(presetId) {
    const dom = deps.getDom();
    if (!dom.playbackLoudnessPreset) return;
    const normalized = normalizePlaybackPresetId(presetId) || 'custom';
    dom.playbackLoudnessPreset.value = normalized;
}

function getExportSettingsSnapshot() {
    const dom = deps.getDom();
    const resolutionChecked = document.querySelector('input[name="exportResolution"]:checked');
    return {
        limitChannels: Boolean(dom.limitChannels?.checked),
        maxChannelsInput: String(dom.maxChannelsInput?.value ?? '16'),
        normalizeLayers: Boolean(dom.normalizeLayers?.checked),
        playbackLoudnessPreset: String(dom.playbackLoudnessPreset?.value ?? 'balanced'),
        playbackTargetPeak: String(dom.playbackTargetPeak?.value ?? '0.5'),
        playbackMasterGainDb: String(dom.playbackMasterGainDb?.value ?? '3'),
        playbackSoftClipDrive: String(dom.playbackSoftClipDrive?.value ?? '1.4'),
        exportResolution: resolutionChecked ? String(resolutionChecked.value) : '96',
        exportResolutionCustom: String(dom.exportResolutionCustom?.value ?? '96'),
        simpleExport: Boolean(dom.simpleExport?.checked),
        wavSampleRate: String(dom.wavSampleRate?.value ?? '44100'),
        wavBitDepth: String(dom.wavBitDepth?.value ?? '16'),
    };
}

function applyExportSettingsSnapshot(snap) {
    if (!snap) return;
    const dom = deps.getDom();
    if (dom.limitChannels) dom.limitChannels.checked = Boolean(snap.limitChannels);
    if (dom.maxChannelsInput) dom.maxChannelsInput.value = snap.maxChannelsInput;
    if (dom.channelLimitGroup) dom.channelLimitGroup.classList.toggle('hidden', !snap.limitChannels);
    if (dom.maxChannelsInput) dom.maxChannelsInput.disabled = !snap.limitChannels;
    if (dom.normalizeLayers) dom.normalizeLayers.checked = Boolean(snap.normalizeLayers);
    if (dom.playbackLoudnessPreset) dom.playbackLoudnessPreset.value = snap.playbackLoudnessPreset;
    if (dom.playbackTargetPeak) dom.playbackTargetPeak.value = snap.playbackTargetPeak;
    if (dom.playbackMasterGainDb) dom.playbackMasterGainDb.value = snap.playbackMasterGainDb;
    if (dom.playbackSoftClipDrive) dom.playbackSoftClipDrive.value = snap.playbackSoftClipDrive;
    const resolutionInputs = document.querySelectorAll('input[name="exportResolution"]');
    resolutionInputs.forEach((input) => {
        input.checked = input.value === snap.exportResolution;
    });
    if (dom.exportResolutionCustom) dom.exportResolutionCustom.value = snap.exportResolutionCustom;
    if (dom.exportResolutionHint) dom.exportResolutionHint.style.display = snap.exportResolution === '48' ? 'block' : 'none';
    if (dom.exportResolutionCustomWrap) dom.exportResolutionCustomWrap.classList.toggle('hidden', snap.exportResolution !== 'custom');
    if (dom.simpleExport) dom.simpleExport.checked = Boolean(snap.simpleExport);
    if (dom.wavSampleRate) dom.wavSampleRate.value = snap.wavSampleRate;
    if (dom.wavBitDepth) dom.wavBitDepth.value = snap.wavBitDepth;
}

function hasExportSettingsChanges() {
    const current = getExportSettingsSnapshot();
    if (!exportSettingsSnapshot) return false;
    return (
        current.limitChannels !== exportSettingsSnapshot.limitChannels ||
        current.maxChannelsInput !== exportSettingsSnapshot.maxChannelsInput ||
        current.normalizeLayers !== exportSettingsSnapshot.normalizeLayers ||
        current.playbackLoudnessPreset !== exportSettingsSnapshot.playbackLoudnessPreset ||
        current.playbackTargetPeak !== exportSettingsSnapshot.playbackTargetPeak ||
        current.playbackMasterGainDb !== exportSettingsSnapshot.playbackMasterGainDb ||
        current.playbackSoftClipDrive !== exportSettingsSnapshot.playbackSoftClipDrive ||
        current.exportResolution !== exportSettingsSnapshot.exportResolution ||
        current.exportResolutionCustom !== exportSettingsSnapshot.exportResolutionCustom ||
        current.simpleExport !== exportSettingsSnapshot.simpleExport ||
        current.wavSampleRate !== exportSettingsSnapshot.wavSampleRate ||
        current.wavBitDepth !== exportSettingsSnapshot.wavBitDepth
    );
}

function updateExportSettingsApplyButton() {
    const dom = deps.getDom();
    if (!dom.applyExportSettings) return;
    dom.applyExportSettings.disabled = !hasExportSettingsChanges();
}

function applyPlaybackMixToPreview() {
    const mixSettings = getPlaybackMixSettings();
    deps.updateArrangementPreview({
        mixSettings,
        keepPosition: true,
    });
    if (deps.isTrackerPreviewPlaying()) {
        deps.refreshTrackerPreview();
    }
}

export function setupExportSettingsModal() {
    const dom = deps.getDom();
    if (dom.playbackLoudnessPreset && !normalizePlaybackPresetId(dom.playbackLoudnessPreset.value)) {
        dom.playbackLoudnessPreset.value = deps.getDefaultPlaybackPresetId();
    }

    dom.exportSettingsBtn.addEventListener('click', () => {
        exportSettingsSnapshot = getExportSettingsSnapshot();
        dom.exportSettingsModal.classList.add('open');
        updateExportSettingsApplyButton();
    });

    dom.cancelExportSettings?.addEventListener('click', () => {
        applyExportSettingsSnapshot(exportSettingsSnapshot);
        dom.exportSettingsModal.classList.remove('open');
    });

    dom.applyExportSettings?.addEventListener('click', () => {
        if (!hasExportSettingsChanges()) return;
        deps.savePatternMeta();
        const inferred = inferPlaybackPresetId(getPlaybackMixSettings());
        setPlaybackPresetControl(inferred);
        applyPlaybackMixToPreview();
        exportSettingsSnapshot = getExportSettingsSnapshot();
        dom.exportSettingsModal.classList.remove('open');
    });

    dom.exportSettingsModal.addEventListener('click', (e) => {
        if (e.target === dom.exportSettingsModal) {
            applyExportSettingsSnapshot(exportSettingsSnapshot);
            dom.exportSettingsModal.classList.remove('open');
        }
    });

    const resolutionInputs = document.querySelectorAll('input[name="exportResolution"]');
    const updateResolutionUi = () => {
        const selected = document.querySelector('input[name="exportResolution"]:checked');
        const isCustom = selected?.value === 'custom';
        if (dom.exportResolutionHint) {
            dom.exportResolutionHint.style.display = selected?.value === '48' ? 'block' : 'none';
        }
        if (dom.exportResolutionCustomWrap) {
            dom.exportResolutionCustomWrap.classList.toggle('hidden', !isCustom);
        }
    };
    resolutionInputs.forEach((input) => {
        input.addEventListener('change', () => {
            updateResolutionUi();
            updateExportSettingsApplyButton();
        });
    });
    dom.exportResolutionCustom?.addEventListener('input', () => {
        updateResolutionUi();
        updateExportSettingsApplyButton();
    });
    updateResolutionUi();

    dom.limitChannels.addEventListener('change', () => {
        if (dom.limitChannels.checked) {
            dom.channelLimitGroup.classList.remove('hidden');
            dom.maxChannelsInput.disabled = false;
            dom.maxChannelsInput.focus();
        } else {
            dom.channelLimitGroup.classList.add('hidden');
            dom.maxChannelsInput.disabled = true;
        }
        updateExportSettingsApplyButton();
    });

    dom.maxChannelsInput?.addEventListener('input', updateExportSettingsApplyButton);
    dom.normalizeLayers?.addEventListener('change', updateExportSettingsApplyButton);
    dom.simpleExport?.addEventListener('change', updateExportSettingsApplyButton);
    dom.playbackLoudnessPreset?.addEventListener('change', () => {
        const presetId = normalizePlaybackPresetId(dom.playbackLoudnessPreset?.value);
        if (!presetId || presetId === 'custom') {
            setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
        } else {
            const presetSettings = deps.getPlaybackLoudnessPresets()[presetId];
            applyPlaybackMixSettingsToInputs(presetSettings);
        }
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackTargetPeak?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackMasterGainDb?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.playbackSoftClipDrive?.addEventListener('input', () => {
        updateExportSettingsApplyButton();
        applyPlaybackMixToPreview();
    });
    dom.wavSampleRate?.addEventListener('change', updateExportSettingsApplyButton);
    dom.wavBitDepth?.addEventListener('change', updateExportSettingsApplyButton);

    if (!dom.playbackTargetPeak?.value || !dom.playbackMasterGainDb?.value || !dom.playbackSoftClipDrive?.value) {
        applyPlaybackMixSettingsToInputs(deps.getPlaybackLoudnessPresets()[deps.getDefaultPlaybackPresetId()]);
    }
    setPlaybackPresetControl(inferPlaybackPresetId(getPlaybackMixSettings()));
    exportSettingsSnapshot = getExportSettingsSnapshot();
}
