// instruments.js
// Paste your ZzFXMicro parameters here.
// These are just arrays of numbers. Safe for Node and Browser.
//
// Waveform Indexes (Index 6):
// 0: Sine
// 1: Triangle
// 2: Sawtooth
// 3: Tangent
// 4: Noise
// 5: Square (Pulse)

export const INST_KICKDRUM = [1,.05,589,.04,0,.05,3,3.5,-1,0,36,.02,0,.1,0,.5,.06,.72,.04,.22,-1295]; 
export const INST_LEAD = [1,.05,88,.01,.04,.01,4,.5,-2,-1,455,.42,0,0,362,0,0,.86,0,0,-1380];
export const INST_HIHAT = [1,.05,934,.02,.02,.03,4,2.6,11,0,-296,.67,0,0,0,0,.16,.51,.01,.26,0];
export const INST_COLDPAD = [1,0,110,.55,1.4,3,1,11,0,0,0,0,0,.45,0,0,.9,.21,0,0,-2964];
export const INST_FLUTE = [1,0,523.2511,.14,1,1,1,1,0,0,0,0,0,.1,0,0,.25,0,.08,0,0];
export const INST_SHORT_BLIP = [0.5,.05,523.2511,.01,.06,.3,0,1,0,0,0,0,0,0,0,0,0,.52,.02,0,0];
export const INST_BLUR = [.5,.05,215,0,.04,.01,4,.3,0,15,133,.38,.04,0,0,0,0,.72,.2,0,278];

// Diagnostic Waves (Short decay, no modulation)
// Params: Vol, Rand, Freq, Att, Sus, Rel, Shape
export const INST_SINE     = [.2,0,220,.01,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_TRIANGLE = [.2,0,220,.01,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_SAW      = [.2,0,220,.01,0,0,2,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_SQUARE   = [.2,0,220,.01,0,0,5,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_NOISE    = [.2,0,220,.01,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_TAN      = [.2,0,220,.01,0,0,3,1,0,0,0,0,0,0,0,0,0,0,1,0,0];

// Minimal Test (Volume + Decay only)
// Vol=1, Rand=6, Freq=220, Att=0.2, Sus=3, Rel=1, Shape=0, Curve=20, Slide=-1, DSlide=1, 
// Jump=155, JTime=10, Rep=1, Noise=0, Mod=5, Crush=0, Delay=0.3, SusVol=0.1, Decay=1, Trem=1, Filter=-500
export const INST_MINIMAL  = [0.1, 6, 220, 0.2, 3, 1, 0, 20, -1, 1, 155, 10, 1, 0, 5, 0, 0.3, 0.1, 1, 1, -500];

/**
 * Strudel Sound Names to ZzFXM Channel Indices
 * This mapping ensures we can use descriptive names in Strudel
 * while still baking to correct ZzFXM channels.
 */
export const instrumentMapping = {
    "z-kickdrum": 0, // Was bd
    "z-lead": 1,
    "z-hh": 2,
    "z-cp": 3,
    "z-blip": 4,
    "z-blur": 5,
    "z-flute": 6,
    "z-sine": 7,
    "z-tri": 8,
    "z-saw": 9,
    "z-tan": 10,
    "z-noise": 11,
    "z-square": 12,
    "z-minimal": 18
};

// Map them to IDs you want to use in Strudel
export const instruments = {
    "z-KICKDRUM": INST_KICKDRUM,
    "z-lead": INST_LEAD,
    "z-hh": INST_HIHAT,
    "z-cp": INST_COLDPAD,
    "z-blip": INST_SHORT_BLIP,
    "z-blur": INST_BLUR,
    "z-flute": INST_FLUTE,
    "z-sine": INST_SINE,
    "z-tri": INST_TRIANGLE,
    "z-saw": INST_SAW,
    "z-tan": INST_TAN,
    "z-noise": INST_NOISE,
    "z-square": INST_SQUARE,
    "z-minimal": INST_MINIMAL
};

// Also export as array for the baker (ordered by channel index)
export const instrumentArray = [
    INST_KICKDRUM, INST_LEAD, INST_HIHAT, INST_COLDPAD, INST_SHORT_BLIP, INST_BLUR, INST_FLUTE,
    INST_SINE, INST_TRIANGLE, INST_SAW, INST_TAN, INST_NOISE,
    INST_SQUARE, INST_MINIMAL
];