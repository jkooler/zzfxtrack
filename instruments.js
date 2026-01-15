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
export const INST_SINE     = [1,0,220,.01,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_TRIANGLE = [1,0,220,.01,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_SAW      = [1,0,220,.01,0,0,2,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_TAN      = [1,0,220,.01,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const INST_NOISE    = [1,0,220,.01,0,0,5,1,0,0,0,0,0,0,0,0,0,0,1,0,0];


// Minimal Test (Volume + Decay only)
// Vol=1, Rand=6, Freq=220, Att=0.2, Sus=3, Rel=1, Shape=0, Curve=20, Slide=-1, DSlide=1, 
// Jump=155, JTime=10, Rep=1, Noise=0, Mod=5, Crush=0, Delay=0.3, SusVol=0.1, Decay=1, Trem=1, Filter=-500
export const INST_MINIMAL  = [1, 6, 220, 0.2, 3, 1, 0, 20, -1, 1, 155, 10, 1, 0, 5, 0, 0.3, 0.1, 1, 1, -500];

// -----------------------------------------------------------------------------
// Parameter Diagnostics (Specialized Instruments)
// -----------------------------------------------------------------------------

// 1. Envelope Test (Slow ADSR)
export const INST_SLOW_ENV = [1, 0, 220, .5, .5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, .5, 0, 0];

// 2. Slide Test (Slide Up)
export const INST_SLIDE_UP = [1, 0, 220, .01, .1, .2, 0, 0, .1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// 3. Jump Test (Pitch Jump)
export const INST_JUMP     = [1, 0, 220, .01, .1, .5, 0, 0, 0, 0, 400, .2, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// 4. Modulation Test (Heavy FM)
export const INST_MOD      = [1, 0, 220, .01, .1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0];

// 5. Tremolo Test (AM)
export const INST_TREMOLO  = [1, 0, 220, .01, .1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0];

// 6. BitCrush Test (Resolution)
export const INST_BITCRUSH = [1, 0, 220, .01, .1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0];


export const SHORT_BLIP = [0.5,.05,523.2511,.01,.06,.3,0,1,0,0,0,0,0,0,0,0,0,.52,.02,0,0];

export const BLUR = [.5,.05,215,0,.04,.01,4,.3,0,15,133,.38,.04,0,0,0,0,.72,.2,0,278];

/**
 * Strudel Sound Names to ZzFXM Channel Indices
 * This mapping ensures we can use descriptive names in Strudel
 * while still baking to correct ZzFXM channels.
 */
export const instrumentMapping = {
    "kick": 0, // Was bd
    "ld": 1,
    "zzfx_hh": 2,
    "cp": 3,
    "blip": 4,
    "blur": 5,
    "flute": 6,
    "sine": 7,
    "tri": 8,
    "saw": 9,
    "tan": 10,
    "noise": 11,
    // Diagnostics
    "test_env": 12,
    "test_slide": 13,
    "test_jump": 14,
    "test_mod": 15,
    "test_trem": 16,
    "test_crush": 17,
    "minimal": 18
};

// Map them to IDs you want to use in Strudel
export const instruments = {
    "kick": INST_BASS, // Was bd
    "ld": INST_LEAD,
    "zzfx_hh": INST_HIHAT,
    "cp": INST_COLDPAD,
    "flute": INST_FLUTE,
  	"test": INST_LEAD,
    "blip": SHORT_BLIP,
    "blur": BLUR,
    "sine": INST_SINE,
    "tri": INST_TRIANGLE,
    "saw": INST_SAW,
    "tan": INST_TAN,
    "noise": INST_NOISE,
    // Diagnostics
    "test_env": INST_SLOW_ENV,
    "test_slide": INST_SLIDE_UP,
    "test_jump": INST_JUMP,
    "test_mod": INST_MOD,
    "test_trem": INST_TREMOLO,
    "test_crush": INST_BITCRUSH,
    "minimal": INST_MINIMAL
};

// Also export as array for the baker (ordered by channel index)
export const instrumentArray = [
    INST_BASS, INST_LEAD, INST_HIHAT, INST_COLDPAD, SHORT_BLIP, BLUR, INST_FLUTE,
    INST_SINE, INST_TRIANGLE, INST_SAW, INST_TAN, INST_NOISE,
    INST_SLOW_ENV, INST_SLIDE_UP, INST_JUMP, INST_MOD, INST_TREMOLO, INST_BITCRUSH,
    INST_MINIMAL
];