export const INSTRUMENT_TYPE_OPTIONS = [
    { value: 'synth', label: 'Synth', icon: 'keyboard-music' },
    { value: 'drums', label: 'Drums', icon: 'drum' },
    { value: 'bass', label: 'Bass', icon: 'guitar' },
    { value: 'other', label: 'Other', icon: 'audio-waveform' },
];

const VALID_INSTRUMENT_TYPES = new Set(INSTRUMENT_TYPE_OPTIONS.map((option) => option.value));

export function normalizeInstrumentType(value, fallback = 'synth') {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    return VALID_INSTRUMENT_TYPES.has(normalized) ? normalized : fallback;
}

export function getInstrumentTypeMeta(value) {
    const normalized = normalizeInstrumentType(value);
    return INSTRUMENT_TYPE_OPTIONS.find((option) => option.value === normalized) || INSTRUMENT_TYPE_OPTIONS[0];
}
