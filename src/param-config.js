// Script to reorganize parameters with toggle
// Add this to instrument-ui.js

// Parameter ordering mappings
const MUSICIAN_ORDER = [0, 6, 7, 2, 1, 20, 3, 18, 4, 17, 5, 13, 15, 16, 19, 12, 8, 9, 10, 11, 14];
const ARRAY_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

// Parameter labels for musician view
const PARAM_LABELS = {
    0: { group: 'General', label: 'Volume' },
    1: { group: 'General', label: 'Randomness' },
    2: { group: 'General', label: 'Frequency (Hz)' },
    3: { group: 'Envelope (ADSR)', label: 'Attack (s)' },
    4: { group: 'Envelope (ADSR)', label: 'Sustain (s)' },
    5: { group: 'Envelope (ADSR)', label: 'Release (s)' },
    6: { group: 'General', label: 'Wave Shape', hint: '0=sine, 1=tri, 2=saw, 3=tan, 4=noise, 5=square' },
    7: { group: 'General', label: 'Shape Curve' },
    8: { group: 'Pitch', label: 'Slide (Hz/s)' },
    9: { group: 'Pitch', label: 'Delta Slide' },
    10: { group: 'Pitch', label: 'Pitch Jump (Hz)' },
    11: { group: 'Pitch', label: 'Pitch Jump Time (s)' },
    12: { group: 'LFO (Volume)', label: 'Repeat Time (s)' },
    13: { group: 'Effects', label: 'Noise (detune)' },
    14: { group: 'Pitch', label: 'Modulation (Hz)' },
    15: { group: 'Effects', label: 'Bit Crush' },
    16: { group: 'Effects', label: 'Delay (s)' },
    17: { group: 'Envelope (ADSR)', label: 'Sustain Volume' },
    18: { group: 'Envelope (ADSR)', label: 'Decay' },
    19: { group: 'LFO (Volume)', label: 'Tremolo (Hz)' },
    20: { group: 'General', label: 'Filter (Hz)' }
};

export { MUSICIAN_ORDER, ARRAY_ORDER, PARAM_LABELS };
