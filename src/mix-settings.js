export const DEFAULT_PLAYBACK_MIX_SETTINGS = Object.freeze({
  targetPeak: 0.5,
  masterGainDb: 3,
  softClipDrive: 1.4,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizePlaybackMixSettings(raw = {}) {
  return {
    targetPeak: clamp(toFiniteNumber(raw.targetPeak, DEFAULT_PLAYBACK_MIX_SETTINGS.targetPeak), 0.1, 0.99),
    masterGainDb: clamp(toFiniteNumber(raw.masterGainDb, DEFAULT_PLAYBACK_MIX_SETTINGS.masterGainDb), -24, 24),
    softClipDrive: clamp(toFiniteNumber(raw.softClipDrive, DEFAULT_PLAYBACK_MIX_SETTINGS.softClipDrive), 1, 8),
  };
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export function softClipSample(sample, drive = DEFAULT_PLAYBACK_MIX_SETTINGS.softClipDrive) {
  const shapedDrive = Math.max(1, drive);
  const norm = Math.tanh(shapedDrive);
  if (norm === 0) return sample;
  return Math.tanh(sample * shapedDrive) / norm;
}
