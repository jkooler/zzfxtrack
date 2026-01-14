// instruments.js
// Paste your ZzFXMicro parameters here.
// These are just arrays of numbers. Safe for Node and Browser.

export const INST_BASS = [5,.05,589,.04,0,.05,3,3.5,-1,0,36,.02,0,.1,0,.5,.06,.72,.04,.22,-1295]; 
export const INST_LEAD = [5,.05,88,.01,.04,.01,4,.5,-2,-1,455,.42,0,0,362,0,0,.86,0,0,-1380];
export const INST_HIHAT = [2,.05,934,.02,.02,.03,4,2.6,11,0,-296,.67,0,0,0,0,.16,.51,.01,.26,0]; // Noise

/**
 * Strudel Sound Names to ZzFXM Channel Indices
 * This mapping ensures we can use descriptive names in Strudel
 * while still baking to correct ZzFXM channels.
 */
export const instrumentMapping = {
    "bd": 0,    // Bass drum id
    "ld": 1,    // Lead id
    "hh": 2     // Hihat id
};

// Map them to IDs you want to use in Strudel
export const instruments = {
    "bd": INST_BASS,
    "ld": INST_LEAD,
    "hh": INST_HIHAT
};

// Also export as array for the baker (ordered by channel index)
export const instrumentArray = [INST_BASS, INST_LEAD, INST_HIHAT];