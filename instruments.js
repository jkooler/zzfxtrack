// instruments.js
// Paste your ZzFXMicro parameters here.
// These are just arrays of numbers. Safe for Node and Browser.

export const INST_BASS = [1,.05,589,.04,0,.05,3,3.5,-1,0,36,.02,0,.1,0,.5,.06,.72,.04,.22,-1295]; 
// Original Lead
export const INST_LEAD = [1,.05,88,.01,.04,.01,4,.5,-2,-1,455,.42,0,0,362,0,0,.86,0,0,-1380];
export const INST_HIHAT = [1,.05,934,.02,.02,.03,4,2.6,11,0,-296,.67,0,0,0,0,.16,.51,.01,.26,0]; // Noise
export const INST_COLDPAD = [1,0,110,.55,1.4,3,1,11,0,0,0,0,0,.45,0,0,.9,.21,0,0,-2964];
export const INST_FLUTE = [1,0,523.2511,.14,1,1,1,1,0,0,0,0,0,.1,0,0,.25,0,.08,0,0];

// Diagnostic Waves (Short decay, no modulation)
// Params: Vol, Rand, Freq, Att, Sus, Rel, Shape
export const INST_SINE     = [1, 0, 220, .01, .05, .2, 0];
export const INST_TRIANGLE = [1, 0, 220, .01, .05, .2, 1];
export const INST_SAW      = [1, 0, 220, .01, .05, .2, 2];
export const INST_TAN      = [1, 0, 220, .01, .05, .2, 3];
export const INST_NOISE    = [1, 0, 220, .01, .05, .2, 4];

export const SHORT_BLIP = [0.5,.05,523.2511,.01,.06,.3,0,1,0,0,0,0,0,0,0,0,0,.52,.02,0,0];

export const BLUR = [.5,.05,215,0,.04,.01,4,.3,0,15,133,.38,.04,0,0,0,0,.72,.2,0,278];

/**
 * Strudel Sound Names to ZzFXM Channel Indices
 * This mapping ensures we can use descriptive names in Strudel
 * while still baking to correct ZzFXM channels.
 */
export const instrumentMapping = {
    "bd": 0,
    "ld": 1,
    "hh": 2,
    "cp": 3,
    "blip": 4,
    "blur": 5,
    "flute": 6,
    "sine": 7,
    "tri": 8,
    "saw": 9,
    "tan": 10,
    "noise": 11
};

// Map them to IDs you want to use in Strudel
export const instruments = {
    "bd": INST_BASS,
    "ld": INST_LEAD,
    "hh": INST_HIHAT,
    "cp": INST_COLDPAD,
    "flute": INST_FLUTE,
  	"test": INST_LEAD,
    "blip": SHORT_BLIP,
    "blur": BLUR,
    "sine": INST_SINE,
    "tri": INST_TRIANGLE,
    "saw": INST_SAW,
    "tan": INST_TAN,
    "noise": INST_NOISE
};

// Also export as array for the baker (ordered by channel index)
export const instrumentArray = [
    INST_BASS, INST_LEAD, INST_HIHAT, INST_COLDPAD, SHORT_BLIP, BLUR, INST_FLUTE,
    INST_SINE, INST_TRIANGLE, INST_SAW, INST_TAN, INST_NOISE
];